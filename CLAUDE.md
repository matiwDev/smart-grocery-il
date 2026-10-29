# Smart Grocery IL — Claude Code Context

## Project
Household grocery planner for Israel (Plan v2, decided 2026-10-28). A shared weekly
shopping list, meal planning that fills the list, recipes, product photos and health
grades, daily nutrition per person, and an automatic ESTIMATE of what each trip cost.
Price comparison by branch/location was dropped on purpose (other apps do it; the feeds
lack names/photos/categories; it blew the free-tier database).

**Plan doc:** https://claude.ai/artifact/AYHzvogue2bq2DhfSR7HBf (features, screens, data, build order)
**Live URL:** https://smart-grocery-il.vercel.app
**Repo:** https://github.com/matiwDev/smart-grocery-il (public)

### Build order (Plan v2)
1. Clean up — DONE (phase1/cleanup): map, Location/Coupons tabs, compare/nearby APIs,
   basket modes, chain selector, price alerts UI, branch tables and overrides removed.
2. List v2 + trip estimate — DONE (phase2/list-v2): free-text items, edit any item (name,
   aisle, own price, photo), aisle grouping, check-off, "Done shopping at…" → trip saved
   with an estimated total; Recent trips on the Saved lists screen.
   NOT YET: the list itself is still per user (baskets.user_id); household sharing of the
   live list comes with phase 3 (Realtime).
3. Household chat: real messages per household, live (Supabase Realtime), photo upload.
   TODAY THE CHAT IS A PLACEHOLDER: hard-coded "Dad/Mom" messages, nothing saved or shared.
4. Recipes + meal plan → list (household recipes in Hebrew; TheMealDB shown in English).
5. Product photo + health grade (Open Food Facts, cached; measure coverage first).
6. What can I cook?
7. Daily nutrition, per person (age, sex, activity → target ranges). Planned meals only,
   NOT a food diary.
8. Insights (spend by month/chain, most-bought, health-grade mix).

## Stack
- Next.js 15, React 19, TypeScript, Tailwind CSS 4
- Supabase (PostgreSQL + Auth + Realtime)
- Vercel (hosting), GitHub Actions (daily price feed)
- Resend (email/OTP)

## Env vars
Source: `~/.config/smartgrocery/.env.local` (or `.env.local` at project root)
Restore: `npm run env:link`
Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, RESEND_API_KEY, ANTHROPIC_API_KEY
Optional: NEXT_PUBLIC_DEBUG_EMAILS (debug panel in production)

## Key npm scripts
```
npm run dev              # localhost:3000 (Dev Login button on the sign-in screen)
npm run build            # production build
npm run ingest           # price feed for all chains → chain_prices + monthly rollup
npm run seed:products    # add new products from the Shufersal feed
npm run enrich:names     # translate Hebrew names via Claude Haiku (paid, manual)
npm run env:link         # restore .env.local from source
```

---

## Data architecture

### Prices (estimates only)
- `chain_prices`: ONE row per (product_id, chain_id). `price` = the price MOST of the
  chain's stores charge in today's feed (mode; ties → lower), plus `min_price`,
  `max_price`, `branch_count` (how many stores carry it). Refreshed nightly.
- `active_chain_prices` (view): chain_prices for chains with `status = 'active'`.
  EVERY app read goes through this view; only the ingest writes `chain_prices`.
- `product_price_monthly`: one row per (product, chain, month) with min/max/avg/last,
  ONLY for tracked products (view `tracked_products` = basket items + active price
  alerts; service-role only). `rpc/rollup_monthly_prices` adds today's price once a day,
  called at the end of every ingest. Seeded with July–August 2026. Powers analytics
  `price_trend` (`?months=12`) and `price_drops` (this month vs last month's average).
- The app shows one price per product per chain. There are no store/branch prices.

### Chain status (migration 015)
`chains.status` is `active` or `in_development`. In-development chains (yohananof,
osher_ad, keshet_teamim — their feeds return only a few hundred items) are still
ingested but never shown. Promote one with
`UPDATE chains SET status = 'active' WHERE id = '...'`.

### Shopping list (migration 018)
- `basket_items`: `checked`; free-text items have `product_id IS NULL` and keep their own
  `category`, `custom_price`, `image_url`. App row key: product id, or `free:<row id>`.
- `product_overrides` (household_id, product_id): a household's edits to a catalog product
  (name, category, price, image_url). Only values that differ are stored; deleting the row
  = "back to catalog". RLS: household members (`is_household_member()`).
- `shopping_trips` + `trip_items`: each "Done shopping". `est_total`, `item_count`,
  `priced_count`; per item `unit_price` + `price_source` (custom | chain | cheapest | none).
  RLS: own trips + household members' trips; insert own only.
- Storage bucket `item-photos` (public read, 5 MB, jpeg/png/webp), uploads only into
  `<auth.uid()>/…`. The client shrinks photos to 800px JPEG first (`lib/list.ts`).
- Price shown for an item = household price if set, else the chain's estimate
  (`unitPrice()` in `lib/list.ts`). Same function feeds the list, the done-shopping sheet
  and the saved trip, so they always agree.

### Categories (migration 018)
`categorize_product(name)` (SQL, Hebrew keyword rules, first match wins) sets
`products.category` via trigger on insert/rename; also callable as an RPC (free-text items).
12 aisles in `lib/categories.ts` (order = list order): produce, bread, dairy_eggs,
meat_fish, pantry, snacks, drinks, frozen, baby, personal_care, household, other.
After migration: other 24%, personal_care 23%, pantry 11%… Households can re-assign any
item. Old keys (dairy, meat, beverage) map via `normalizeCategory()`.

### Other tables
- `chains` (7, 4 active), `products` (~38k, barcode-keyed)
- `baskets`, `basket_items`, `profiles`, `households`, `household_members`
- `messages` (unused so far: no household_id, no photo — rebuilt in phase 3)
- `price_alerts`, `promotions`, `waitlist` (no UI; kept, tiny)
- `ingest_log`, `custom_markets`, `custom_market_entries`, `schema_migrations`

### Dropped. Do not reference.
`price_history`, `latest_prices`, `latest_prices_by_branch`, `refresh_latest_prices()`
(migration 013), `branches`, `branch_price_overrides`, `ingest_log.overrides_written`
(migration 017). No `current_prices`, no `chain_price_changes`.
Size: 1,129 MB (Oct 27) → 37 MB (Oct 29). Free limit 500 MB.

## Database access
Claude has the Supabase connector (project `dnypogoyjtcotlxfqgug`) and applies migrations
and queries directly. Every migration is also saved in `supabase/migrations/` and recorded
in `public.schema_migrations`.

---

## Chain feeds (how prices are ingested)
All chains publish prices publicly under Israel's Food Act (2014) — no scraping needed.

| Chain | Feed platform | Method |
|---|---|---|
| Shufersal | Azure blob (listing) | HTTPS, fetch per-store .gz files |
| Rami Levy | Cerberus FTP | FTP, user=RamiLevi, blank password |
| Victory | laibcatalog.co.il | HTTPS JSON API, edi=7290696200003 |
| Mahsanei Hashuk | laibcatalog.co.il | HTTPS JSON API, edi=7290661400001 |
| Yohananof | Cerberus FTP | FTP, user=yohananof, blank password (in development) |
| Osher Ad | Cerberus FTP | FTP, user=osherad, blank password (in development) |
| Keshet Teamim | Cerberus FTP | FTP, user=Keshet, blank password (in development) |

Mega and Co-op have NO working public feed and are NOT supported.

Ingest script: `scripts/ingest-prices.ts`. Store ids in the feeds are only used to count
stores and pick the most common price; stores are not saved. Scheduled ONLY by GitHub
Actions (`.github/workflows/ingest-prices.yml`, 03:00 UTC, also runnable manually; a full
run takes ~35 min). `/api/prices/ingest` exists for manual calls but can't finish within
Vercel's 300s limit. Parsers: `scripts/parsers/`.

---

## UI structure
- Bottom nav (interim, until phases 2–8): Home (list), Scan, Saved lists, Analytics.
  Target: List, Meals, Recipes, Insights.
- Home: product search ("from ₪X · cheapest chain", plus "Add “…” as your own item") →
  shopping list grouped by aisle (components/ShoppingList.tsx). Tap the circle = in the
  cart; tap the item = edit sheet (components/ItemEditSheet.tsx); "Done shopping" =
  components/DoneShoppingSheet.tsx. Saved lists screen starts with Recent trips
  (components/RecentTrips.tsx).
- Header: app icon + Globe/language, Sun/Moon/theme, Bell, User/avatar (opens the drawer:
  Profile, Saved lists, Chat, Analytics, Community).
- Auth: email + password with an emailed code on sign-up. No guest mode. Signing up with
  an existing email switches to Sign In (Supabase sends no code in that case).
- Theme: light/dark via CSS variables.

## Debug tools (components/DebugPanel.tsx, lib/debug.ts)
Who sees them: everyone on `npm run dev`; in production, only signed-in users whose email
is in `NEXT_PUBLIC_DEBUG_EMAILS` (comma-separated, set in Vercel).
Open: floating bug button (bottom corner) or Ctrl/Cmd+Shift+D.
- **Cheats:** +5/+12 staple products, +3 free-text items, check all / uncheck all, clear
  list, jump to any view, toggle lang/theme, test toast, copy user id, reset all `sg_*`
  localStorage keys.
- **Network:** 0.5/2/5s delay on /api/* calls, force every /api/* call to fail (500),
  live API call log with status/timing and expandable JSON bodies.
- **Status:** `GET /api/debug/status` (server re-checks the email list against the
  verified Supabase session; 404 otherwise) → DB size vs 500 MB, per-chain price counts
  and last ingest, trips, household edits, category counts, tracked products, monthly
  rows; "Run monthly rollup now"
  (`POST {action:'rollup'}`). Backed by `debug_db_stats()` (migrations 016/017).
- "Dev Login" on the sign-in screen (dev server only, `app/api/dev/login`):
  dev@smartgrocery.local.

---

## Costs (reviewed 2026-10-29)
Everything runs on free tiers. Watch:
- **Supabase Free:** 500 MB DB (37 MB used), 1 GB file storage, 5 GB egress; pauses after
  7 idle days (the daily ingest keeps it awake).
- **Vercel Hobby:** free but **non-commercial only**. Commercial launch → Pro ($20/mo).
- **GitHub Actions:** ~1,050 min/month; free while the repo is public.
- **Anthropic API:** only `npm run enrich:names`, pay-per-use, manual.
- **Resend:** auth emails via Supabase SMTP (verify it is connected); 3,000 emails/month.
- Planned, free: Open Food Facts (15 reads/min, attribution), TheMealDB (£10 one-time
  production key at launch), USDA FoodData Central (free key).

---

## What NOT to build until the plan's core works
- Coupons/promotions, price alert emails, Shufersal cart integration
- WhatsApp support (placeholder number in code — replace 972500000000)
- Branch/location pricing or maps (dropped by decision)
- Full price history (monthly summaries for tracked products only)

---

## Applied DB migrations
001_products_and_prices, 002_price_alerts, 003_household_invite, 004_ingest_log,
005_waitlist, 006_online_branches, 007_branches_external_id, 008_analytics_indexes,
009_custom_markets, 010_basket_items_fk, 010_promotions, 011_branch_pricing_views,
012_chain_prices, 013_drop_price_history, 014_lock_tracked_products, 015_chain_status,
016_debug_stats, 017_drop_branches, 018_list_v2_trips, 019_lock_household_functions
(all recorded in public.schema_migrations)

Security note (019): `generate_household_invite(p_user_id)` and
`join_household_by_code(p_user_id, p_code)` took any user id and were callable without
signing in; nobody can execute them now. The app uses `get_or_create_own_household()` and
`join_household_by_code(code)`, which act on `auth.uid()`.
