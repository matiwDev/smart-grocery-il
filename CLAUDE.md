# Smart Grocery IL — Claude Code Context

## Project
Mobile-first grocery price comparison app for the Israeli market.
Users build a basket, the app compares total cost across Israeli supermarket chains,
and shows them the cheapest option.

**Live URL:** https://smart-grocery-il.vercel.app
**Repo:** https://github.com/matiwDev/smart-grocery-il

## Stack
- Next.js 15, React 19, TypeScript, Tailwind CSS 4
- Supabase (PostgreSQL + Auth + Realtime)
- Vercel (hosting), GitHub Actions (daily ingest cron)
- Resend (email/OTP)

## Env vars
Source: `~/.config/smartgrocery/.env.local` (or `.env.local` at project root)
Restore: `npm run env:link`
Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, RESEND_API_KEY, ANTHROPIC_API_KEY

## Key npm scripts
```
npm run dev              # localhost:3000
npm run build            # production build
npm run ingest           # run price ingestion all chains
npm run seed:branches    # seed branches from all chain feeds
npm run geocode:branches # geocode branches without coordinates
npm run enrich:names     # translate Hebrew names via Claude Haiku
npm run env:link         # restore .env.local from source
```

---

## Data architecture

### Price model (migration 012_chain_prices.sql)
The free tier is 500 MB. `price_history` hit 710 MB, and one row per product × branch
would be ~5–10M rows (~1 GB), so prices are stored compactly:
- `chain_prices`: ONE row per (product_id, chain_id). `price` is the price that MOST of
  the chain's branches charge in today's feed (mode; ties go to the lower price). It also
  stores `min_price`, `max_price` and `branch_count` (how many branches carry it).
- `branch_price_overrides`: one row per (product_id, branch_id), ONLY where that branch's
  price differs from the chain mode. Stale overrides for fetched branches are deleted each run.
- `product_price_monthly`: one row per (product, chain, month) with min/max/avg/last price,
  ONLY for tracked products (view `tracked_products` = basket items + active price alerts).
  `rpc/rollup_monthly_prices` adds today's chain price once per day; called at the end of
  every ingest. Seeded with July–August 2026 from the old price_history. Powers analytics
  `price_trend` (monthly points, `?months=12`) and `price_drops` (this month vs last month avg).

**Effective price at branch B** = override(P, B) if it exists, else chain_prices(P, B.chain).
Helpers: `lib/geo.ts` → `nearestBranchPerChain()`, `fetchBranchOverrides()`.
Caveat: per-branch availability is not stored; a branch is assumed to carry every product
its chain publishes.

### Other tables
- `chains`: 7 chains (shufersal, rami_levy, victory, mahsanei_hashuk, yohananof, osher_ad, keshet_teamim)
- `products`: barcode-keyed catalog (~38k)
- `branches`: one row per physical store (~1,045). Has `external_id`, `lat`, `lng`.
- `baskets`, `basket_items`, `profiles`, `households`, `household_members`, `messages`,
  `price_alerts`, `waitlist`, `ingest_log` (+ `overrides_written`), `custom_markets`,
  `custom_market_entries`

### Dropped. Do not reference.
`price_history`, `latest_prices`, `latest_prices_by_branch`, `refresh_latest_prices()`
(dropped 2026-10-28, migration 013; DB went from 1,129 MB to 26 MB).
There is no `current_prices` table and no `chain_price_changes` table.

## Database access
Claude has the Supabase connector (project `dnypogoyjtcotlxfqgug`) and applies migrations
and queries directly. Record applied migrations in `public.schema_migrations`.

---

## Chain feeds (how prices are ingested)
All chains publish prices publicly under Israel's Food Act (2014) — no scraping needed.

| Chain | Feed platform | Method |
|---|---|---|
| Shufersal | Azure blob (listing) | HTTPS, fetch per-branch .gz files |
| Rami Levy | Cerberus FTP | FTP, user=RamiLevi, blank password |
| Victory | laibcatalog.co.il | HTTPS JSON API, edi=7290696200003 |
| Mahsanei Hashuk | laibcatalog.co.il | HTTPS JSON API, edi=7290661400001 |
| Yohananof | Cerberus FTP | FTP, user=yohananof, blank password |
| Osher Ad | Cerberus FTP | FTP, user=osherad, blank password |
| Keshet Teamim | Cerberus FTP | FTP, user=Keshet, blank password |

Mega and Co-op have NO working public feed and are NOT supported.

Ingest script: `scripts/ingest-prices.ts`
All parsers in: `scripts/parsers/`

---

## Known data issues
1. **chain_prices is empty** until the next successful `npm run ingest` / GitHub Action run.
   Until then every price endpoint returns no prices.
2. **Branch coords vs external_id**: old manually seeded branches have coords but no
   `external_id`; ingested placeholder branches have `external_id` but no coords. With the
   012 model, coord-only branches still get correct chain prices (only their overrides are
   missed), so this is now lower priority. Fix: `npm run geocode:branches` for the
   external_id rows, then deactivate coord-only duplicates.
3. The Supabase free-tier project pauses after ~7 days without activity. The daily ingest
   cron keeps it awake, but only while the cron succeeds.

---

## UI structure
- Bottom nav: Home, Scan, Coupons, Location tabs
- **MAP HAS BEEN REMOVED** — Location tab should show branch list only (no Leaflet map)
- Header: app icon + 4 icon buttons (Globe/language, Sun/Moon/theme, Bell/alerts, User/avatar)
- Basket modes: Smart (cheapest), Chain (single chain), Compare (two chains)
- Auth: OTP email/phone. No guest mode — app shows sign-in modal until logged in.
- Theme: light/dark via CSS variables. No skin picker.

---

## What NOT to build until core works
- Promotions/coupons feature (010_promotions.sql applied but UI not built)
- Price alert emails (table exists, no trigger built)
- Shufersal cart integration
- WhatsApp support (placeholder number in code — replace 972500000000)
- Full price history (only monthly summaries for tracked products are kept)

---

## Applied DB migrations
001_products_and_prices, 002_price_alerts, 003_household_invite, 004_ingest_log,
005_waitlist, 006_online_branches, 007_branches_external_id, 008_analytics_indexes,
009_custom_markets, 010_basket_items_fk, 010_promotions
011_branch_pricing_views, 012_chain_prices, 013_drop_price_history (all recorded in public.schema_migrations)
