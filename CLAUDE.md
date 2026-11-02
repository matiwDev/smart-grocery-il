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
   Adjusted 29 Oct (migration 020): ONE chain per user (profiles.preferred_chain_id) —
   search shows only that chain's products at its price, with a green "₪X at <chain>"
   hint when another active chain is cheaper; the list, totals and the done-shopping
   default use that chain. Free text becomes a household "My product" (custom_products),
   found in search under "My products" whatever chain is chosen. Tapping an item's photo
   opens a large preview (change / remove); an empty photo slot opens the picker.
3. Shared live list + household chat — DONE (phase3/household, migrations 021–022): the
   household has ONE current list that every member sees and edits, live; saved lists are
   the household's; real chat per household with photos, live. See "Household sharing".
4. Recipes + meal plan → list — BUILT (phase4/recipes-meals, migration 024 applied 1 Nov): household
   recipes (Hebrew), TheMealDB ideas (English) browse + save, week grid (days × breakfast /
   lunch / dinner) with servings and who eats, "Add week to list" (scaled, merged, topped
   up, never added twice). New tabs: List, Meals, Recipes, Analytics. See "Recipes & meal plan".
5. Product photo + health grade — DONE (phase5/photos-grades, migration 025 applied 2 Nov).
   Coverage measured 1 Nov (`npm run off:coverage`, 168 retail barcodes): OFF knows 17% of
   products (25% of food), photo 10%, Nutri-Score 3%, nutrition 14% (22% of food). So no
   bulk job: looked up on demand for list items and cached. See "Product info".
6. What can I cook? — BUILT (phase6/what-can-i-cook, migration 026 applied 2 Nov): third
   tab in Recipes. Chips you pick + "Use my list" + who's eating → our recipes and
   TheMealDB ideas that use ≥1 thing you have, never break an eater's food preferences
   (per person, in Profile), ranked by overlap + a health estimate + goals; less healthy
   dishes rank lower with a badge (not hidden). See "What can I cook?".
7. Daily nutrition, per person (age, sex, activity → target ranges). Planned meals only,
   NOT a food diary. IN PROGRESS (phase7/nutrition, branched from phase 6): 7A people +
   body data + targets DONE (migration 027). 7B Health Ministry food table (צמרת) +
   recipe nutrition: waiting for the CSV in data/tzameret/ (data.gov.il is not reachable
   from Claude's side). See "Nutrition".
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
Optional: NEXT_PUBLIC_DEBUG_EMAILS (debug panel in production), THEMEALDB_API_KEY
          (defaults to TheMealDB's free dev key "1")

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

### Amount per item (migration 023)
`basket_items.quantity_unit` / `trip_items.quantity_unit`: `unit` (default, whole numbers)
or `kg` (decimals, e.g. 1.5). Set in the edit sheet (Amount + Units/kg toggle); the list's
+/- step is 1 unit or 0.5 kg (min 0.1 kg). Line estimate = price × amount, so a kg item's
price should be per kg. Helpers: `qtyStep`, `qtyMin`, `formatQty` in lib/list.ts.

### Chain choice + My products (migration 020)
- `profiles.preferred_chain_id`: the user's chain. Picker opens by itself until set
  (components/ChainPickerSheet.tsx); the "Shopping at" chip on Home changes it.
- `/api/products/search?q=&chain=<id>`: only products with a `chain_prices` row for that
  chain (inner join), each with `chain_price` and `cheaper` ({chain_id, price} of the
  cheapest OTHER active chain when lower by more than ₪0.05). Without `chain` (barcode
  scanner) it returns every match.
- `custom_products` (household_id, name unique per household case-insensitive, category,
  price, image_url): the household's own products. RLS: household members.
  `basket_items.custom_product_id` / `trip_items.custom_product_id` link to it; the list
  API reads name/aisle/price/photo from it. Searched client-side (RLS) in `doSearch`.
  Row key `custom:<id>`; older free-text rows (`free:<row id>`) still work.
- `cheaperElsewhere()` in lib/list.ts drives the list hint.

### Household sharing (migrations 021–022)
- Every user is in exactly ONE household (`get_or_create_own_household()` creates one on
  first use and returns the newest membership). `join_household_by_code(code)` moves you:
  removes your other memberships; if the new household already has a current list, yours
  becomes a saved list, otherwise yours becomes its list. `get_household_members()` →
  user_id, nickname, role (profiles stay private to their owner).
- Lists: `baskets` / `basket_items` RLS = owner OR member of `baskets.household_id`.
  The current list = the household's newest non-archived basket (created with
  household_id if none). Saved lists = archived baskets visible to you (own + household);
  "Load into current list" COPIES a saved list's items into the current list.
- `/api/baskets/{id}/items` and the personal `/api/analytics` reports authenticate with
  the Supabase access token (`Authorization: Bearer`, `utils/authFetch.ts`,
  `lib/authServer.ts`) — never a user_id parameter (service-role routes bypass RLS).
- Realtime (`supabase_realtime` publication): basket_items, messages, product_overrides,
  custom_products; REPLICA IDENTITY FULL on basket_items and messages. app/page.tsx
  subscribes per list: INSERT/UPDATE filtered by basket_id, DELETE matched by row id (under
  RLS a DELETE event carries only the id), household product edits / My products → a
  debounced (350 ms) reload of the list.
- `messages` (household_id NOT NULL, user_id default auth.uid(), nickname, message_text,
  image_path; text or photo required). RLS: members read; insert only as yourself into
  your household; delete your own. UI: components/HouseholdChat.tsx (last 200, live,
  search, tap own message → delete, photo preview).
- Storage bucket `chat-photos`: PRIVATE, path `<household_id>/<uuid>.jpg` (1280px JPEG),
  members read/upload, uploader deletes; shown through 1-hour signed URLs.
- Fixed in 022: the households / household_members read policies referenced themselves
  ("infinite recursion"), so any direct read of those tables failed.

### Recipes & meal plan (migration 024, phase 4)
- `recipes` (household_id, title, lang he|en, servings, instructions, image_url, category,
  source own|mealdb, source_id = idMeal (unique per household), source_url).
- `recipe_ingredients` (recipe_id, position, name + measure AS WRITTEN; for the list:
  amount + unit `unit`|`kg`|`none`, list_name, product_id / custom_product_id link,
  skip_list). `none` = "need some": counts as 1 and is never summed. `parseMeasure()` in
  lib/recipes.ts reads "1 ק״ג", "500 גרם", "חצי ק״ג", "2 large", "1 lb" → kg/units; tsp/cup/cloves → none.
  TheMealDB imports get a Hebrew list_name from the `EN_HE` table when known; water,
  salt and pepper default to skip_list.
- `meal_plan_entries` (household_id, plan_date, slot breakfast|lunch|dinner, recipe_id,
  servings, eaters uuid[] = member user ids, NULL = everyone, added_to_list_at).
- `basket_items.from_meals text[]`: recipe titles the item was added for → green chef-hat
  badge on the list and "For: …" in the edit sheet.
- RLS: household members (`is_household_member`). Realtime: recipes, meal_plan_entries
  (REPLICA IDENTITY FULL); MealPlanView / RecipesView subscribe and reload (debounced).
- Meal plan → list: `needsFor()` scales each ingredient by entry servings / recipe servings,
  merges per product (product_id, custom_product_id, else name), rounds up (whole units,
  kg to 100 g). `addNeedsToList()` turns unlinked ingredients into household "My
  products" (categorize_product for the aisle), tops up items already on the list (counts
  and kg add; `none` stays; an item already in the cart is unchecked and reset to the
  need), inserts the rest. Entries sent get `added_to_list_at`; "Add again" re-sends.
- TheMealDB through `/api/recipes/mealdb` (`?s=`, `?c=`, `?i=`, `?list=categories`,
  `?random=1`; cached 1 day). Key `THEMEALDB_API_KEY` (optional env, default dev key "1";
  production key £10 at launch). Attribution line on the Ideas tab.
- UI: components/MealPlanView.tsx (week grid, Sunday first), RecipesView.tsx (Our recipes /
  Ideas tabs), RecipeSheet.tsx (detail: plan, add to list, save idea, edit, delete),
  RecipeEditor.tsx (ingredients as written; "⋯" = list name, product link, skip),
  PlanMealSheet.tsx (recipe, day, slot, who eats, servings follow eaters until changed).

### What can I cook? (phase 6, migration 026)
- `lib/cook.ts`: `words()` folds names to comparable words (no niqqud, numbers, units,
  geresh; Hebrew ים/ות/ה/ת and English plurals folded; יי→י). Something you have covers an
  ingredient when one's words are all in the other's ("עוף" covers "חזה עוף"; "חלב תנובה
  3%" covers "חלב"), except products MADE WITH it ("שוקולד חלב" is not milk; `MADE_WITH`
  first words). A linked product_id / custom_product_id always matches.
- Staples never count as missing: skip_list ingredients plus salt, pepper, oil, olive oil,
  sugar, water (`isStaple`). `matchRecipes()` keeps recipes with ≥1 match. `KEEP` in
  lib/cook.ts lists Hebrew words not to stem (שמנת must not become שמן). "Add missing to list" = `needsFor()` on the recipe with only the
  missing ingredients (`withOnly`), through the usual addNeedsToList.
- TheMealDB: `/api/recipes/mealdb?ing=a|b,c` — each comma group is one thing we have with its
  English candidates (`englishCandidates()` = reverse EN_HE, most specific first, only names
  wholly inside ours); the server picks the first name in `list.php?i=list`, calls
  `filter.php?i=` once per group (free key = one ingredient per call; max 6 groups), ranks
  by groups used, then fetches the best 24 whole (`lookup.php`, cached a day) so the app
  can check diets and health. Returns `{meals[MealFull + uses[]], used[], unknown}`. The
  app turns them into recipe-shaped objects (`mealAsRecipe`, id `mealdb:<id>`) and
  matches/scores them exactly like ours.
- `person_profiles` (migration 026, one row per user; phase 7 adds age/sex/activity here):
  diet any|pescatarian|vegetarian|vegan, kosher (default OFF), avoid[] (gluten, lactose,
  nuts, peanuts, eggs, fish, shellfish, sesame, soy), dislikes[] (free text, ≤30), goals[]
  (lighter, protein, less_sugar, more_veg). RLS: own row read/write; household members read
  (`shares_household(user_id)`, SECURITY DEFINER). Edited in Profile →
  components/FoodPrefsSection.tsx (autosaves, 500 ms).
- `lib/suggest.ts`: `kindsOf()` classifies an ingredient by keyword (meat, pork, fish,
  shellfish, dairy, eggs, gluten, nuts…, veg, legume, whole grain, sugar…; `NOT_LISTS`
  stops coconut milk = dairy etc.). `combinePrefs()` for the eaters: strictest diet, any
  kosher, union of avoid/dislikes/goals. `blockedBy()` = hard rules (kosher = no pork,
  shellfish, or meat with dairy). `healthOf()` = 0–100 ESTIMATE (veg/legumes/whole grains/
  fish up; cream/butter/cheese, sugar, processed meat, red meat, deep-frying, desserts down;
  goals scale it) → band healthy ≥68 | balanced | occasional <45 or dessert.
  `rankSuggestions()` = 50 × share you have − 3 per missing beyond 2 + 0.4 × health ± goals.
  `healthyPicks()` when nothing is chosen. Phase 7 should replace the estimate with real
  per-serving values.
- UI: components/CookView.tsx (chips with Hebrew/English suggestions, "Use my list" toggle,
  both remembered in localStorage `sg_cook_have`, `sg_cook_use_list`; "Who's eating?" member
  pills, default everyone; "Suits: …" line + link to Food preferences; Healthy / Occasional
  / Dessert chips via `HealthChip`). RecipesView gets `listItems` (current list names via
  `effective()`) and `onEditPrefs` (→ Profile) from app/page.tsx.

### Nutrition (phase 7, migration 027)
- `person_body` (user_id PK): birth_year, sex male|female, activity sedentary|light|active|
  very_active, height_cm, weight_kg. PRIVATE (own row only). `person_profiles.targets` jsonb =
  the ranges computed from it, readable by the household (the body numbers never are).
- `household_people`: people without an account (children…): name, the same body fields,
  food preferences (as person_profiles) and targets, one row, RLS = household members.
  app/page.tsx loads them (id, name) next to the members and passes `eaterList` (members +
  people, role 'person') wherever "who eats" is chosen; their ids go in
  meal_plan_entries.eaters. `deletePerson()` also removes the id from planned meals.
  `loadPrefs()` reads both tables.
- `lib/nutrition.ts` `targetsFor(body)`: energy = IOM 2005 EER equations (age, sex, height,
  weight, PA coefficient; children 3–18 + growth; 2-year-olds 89×kg−80), ±10% range,
  rounded to 50; missing height/weight → typical values by age (`approx: true`); under 2 →
  null. AMDR shares for protein/fat/carbs (by age), protein never under the RDA (g/kg);
  fiber 14 g/1000 kcal; sodium CDRR by age (1200/1500/1800/2300 mg); sat fat and sugars
  < 10% of kcal. Targets are computed in the browser and stored on save.
- UI (Profile): components/PeopleSections.tsx — `BodySection` (own, autosave, "Private"
  badge, shows the targets), `HouseholdPeopleSection` (list + edit sheet with BodyFields,
  TargetsSummary, FoodPrefsEditor). components/FoodPrefsSection.tsx now exports the
  controlled `FoodPrefsEditor`, `SaveState`, `pillCls`, `fieldLabelCls`.

### Product info: photo + health grade (migration 025, phase 5)
- `product_info` (product_id PK → products): status found | not_found, fetched_at, off_name,
  image_url (OFF front, 200px; `largerOffImage()` → 400px), is_beverage, per100 jsonb (kcal,
  sugars, sat_fat, salt, sodium_mg, protein, fiber, fvl, sweeteners), nutriscore a–e +
  nutriscore_source off | calc, red_flags text[] (sodium | sugar | sat_fat). Shared catalog
  data: signed-in users read, only the service role writes.
- `POST /api/products/info {ids}` (Bearer token): answers from the cache, looks up at most 6
  new/stale products per call on OFF (`world.openfoodfacts.org/api/v2/product/<barcode>`,
  User-Agent `OFF_USER_AGENT`), returns `{info, pending}`. Non-retail barcodes are cached as
  not_found without a call. Recheck: not_found after 45 days, found after 180.
  `hooks/useProductInfo.ts` asks for the list's catalog items, re-asks while pending (≤6 rounds).
- `lib/health.ts`: Israel's red labels, stage 2 (solids per 100 g: sodium > 400 mg, sugars
  > 10 g, sat fat > 4 g; liquids per 100 ml: > 300 mg, > 5 g, > 3 g) and Nutri-Score 2023
  (general foods + beverages). OFF's own grade always wins; for fats/oils/nuts, cheese and
  red meat we never calculate one. `lib/off.ts` turns an OFF product into a row.
- UI: list row shows the household photo, else OFF's; a Nutri-Score chip and a red octagon
  with the number of red labels. Item sheet: `HealthPanel` (components/HealthBadge.tsx) with
  grade, red labels, nutrition table and the ODbL attribution line. The OFF photo is shown,
  never saved as the household's.
- Item sheet sections are collapsible (components/Collapsible.tsx): "Estimated price by chain"
  (closed: cheapest price) and "Health & nutrition" (closed: grade chip + red-label count).
  Open/closed is remembered per browser in localStorage `sg_open_<id>`.
- Coverage script: `npm run off:coverage` (resumable, results in scripts/.off-coverage.jsonl,
  git-ignored). OFF is NOT on Claude's network allowlist: run it on your own machine.

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
- Bottom nav (phase 4): List, Meals, Recipes, Analytics (→ Insights in phase 8). Scan is
  the barcode button inside the search bar (and in the drawer); Saved lists is in the drawer.
- Home: product search ("from ₪X · cheapest chain", plus "Add “…” as your own item") →
  shopping list grouped by aisle (components/ShoppingList.tsx). Tap the circle = in the
  cart; tap the item = edit sheet (components/ItemEditSheet.tsx); "Done shopping" =
  components/DoneShoppingSheet.tsx. Saved lists screen starts with Recent trips
  (components/RecentTrips.tsx).
- Header: app icon + Globe/language, Sun/Moon/theme, Bell, User/avatar (opens the drawer:
  Profile, Saved lists, Scan, Chat, Analytics, Community).
- Auth: email + password with an emailed code on sign-up. No guest mode. Signing up with
  an existing email switches to Sign In (Supabase sends no code in that case).
- Theme: light/dark via CSS variables.

## Debug tools (components/DebugPanel.tsx, lib/debug.ts)
Who sees them: everyone on `npm run dev`; in production, only signed-in users whose email
is in `NEXT_PUBLIC_DEBUG_EMAILS` (comma-separated, set in Vercel).
Open: floating bug button (bottom corner) or Ctrl/Cmd+Shift+D.
- **Cheats:** +5/+12 staple products, +3 free-text items, check all / uncheck all, clear
  list, +5 sample Hebrew recipes, fill / clear this week's meal plan, jump to any view, toggle lang/theme, test toast, copy user id, reset all `sg_*`
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
- Open Food Facts (on-demand, ~100 reads/min allowed, ODbL attribution), TheMealDB (£10 one-time
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
016_debug_stats, 017_drop_branches, 018_list_v2_trips, 019_lock_household_functions,
020_home_chain_custom_products, 021_household_sharing_chat, 022_household_members_fix,
023_quantity_unit, 024_recipes_meal_plan, 025_product_info, 026_person_profiles,
027_people_body_targets
(all recorded in public.schema_migrations)

Security note (019): `generate_household_invite(p_user_id)` and
`join_household_by_code(p_user_id, p_code)` took any user id and were callable without
signing in; nobody can execute them now. The app uses `get_or_create_own_household()` and
`join_household_by_code(code)`, which act on `auth.uid()`.

Security notes (021, phase 3): `messages` was readable and writable by ANY signed-in user
(policy "Authenticated users read and write messages"); now household members only. The
unused `/api/baskets/sync` route (service role, trusted a client-sent userId) was deleted;
`/api/analytics` personal reports used a `user_id` parameter (anyone could read anyone's
data) — now the access token. Open advisor items (low risk, not yet fixed):
`handle_new_user()` is executable via RPC (trigger function), a few functions lack a fixed
search_path, leaked-password protection is off (Auth settings).
