# Smart Grocery IL — Claude Code Context

## What this project is
A mobile-first, real-time grocery price comparison app for the Israeli market.
Users build a shopping basket, the app compares total cost across 4 supermarket chains
(Shufersal, Rami Levy, Victory, Yohananof), and routes them to the cheapest nearby branch.

## Stack
- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL + Realtime + Auth)
- **Auth:** Supabase OTP (email + phone), profiles auto-created via DB trigger. **Mandatory as of
  Phase 8** — there is no guest mode; the app shows only the sign-in/sign-up modal until a
  session exists (see "Phase 8" below)
- **Styling:** Light/dark theme via CSS variables (see "Theme system" below), RTL/LTR Hebrew/English toggle
- **Animation:** motion (framer-motion v12)
- **Map:** react-leaflet + leaflet (client-only, dynamically imported; **Phase 13** found and
  fixed a separate flexbox percentage-height bug that also caused a blank map in production
  — see "Phase 13" below and gotchas)
- **Barcode scanning:** @zxing/browser + @zxing/library (`BrowserMultiFormatReader`,
  live camera decode, explicit "Start Camera" tap as of **Phase 13** — see "Phase 12" and
  "Phase 13" below)

## Repo structure
```
app/
  page.tsx                        # Main UI — all views (HOME, LOCATION, PROFILE, CHAT, SAVED_LISTS,
                                   # SCAN, COUPONS — the latter two added Phase 11, see below;
                                   # ANALYTICS, Phase 15 — renamed from PRICE_UPDATES, see below).
                                   # Compact icon-row header (app icon opens an About sheet; lang/
                                   # theme/notifications/profile-avatar buttons) + a fixed 4-tab
                                   # bottom nav (Home/Scan/Coupons/Location) are now the primary
                                   # navigation — the old hamburger drawer is triggered by the
                                   # profile avatar instead (still a side drawer as of Phase 11
                                   # step 5; becomes a bottom sheet in step 6, not yet done). New
                                   # sub-components: BottomNav, ChainSelectorStrip (Phase 12: now a
                                   # collapsible dropdown row, not a pill strip — see "Phase 12"
                                   # below), Toast, ChainPriceBreakdown (shared per-chain price
                                   # list — takes a plain `prices` map, not a full BasketItem, so
                                   # it's reusable for a scanned ProductResult too; used by
                                   # BasketRow's expand panel and the Scan view's found-product
                                   # card), BasketRow (compact basket item row; expand panel now
                                   # also shows the barcode, Phase 12). LOCATION view redesigned
                                   # Phase 12 to a full-screen map (see below) — BranchMapContainer
                                   # no longer takes a side branch-list. SCAN view redesigned
                                   # Phase 12 from a placeholder to a real live-camera scanner via
                                   # @zxing/browser (see "Phase 12" below). Phase 13: the Scan
                                   # view opens on an idle "Start Camera" button instead of
                                   # auto-starting — see "Phase 13" below. Phase 15: SavedList cards
                                   # get a real load handler (handleLoadSavedList, rebuilds BasketItem
                                   # rows with current prices) and a delete button + styled confirm
                                   # sheet; handleSaveList no longer clears the active basket; CHAT
                                   # view groups messages under date-separator pills and gained a
                                   # client-side search (buildChatTimeline/HighlightMatch); new
                                   # AnalyticsView component (Phase 16: spending-overview/
                                   # chain-ranking(personal+general)/monthly-basket-summary/
                                   # custom-markets/price-trend, recharts) renders the ANALYTICS
                                   # view — see "Phase 16" below, replaced the original 5 sections.
  layout.tsx                      # Root layout, RTL support, pre-hydration theme-init script (see
                                   # "Theme system" below)
  api/
    analytics/route.ts            # Phase 15 — GET ?type=savings|chain_ranking|price_drops|
                                   # top_products|price_trend, plus Phase 16's spending_overview|
                                   # personal_chain_ranking|monthly_basket|custom_markets — backs
                                   # AnalyticsView. See "Phase 15"/"Phase 16" below for what each
                                   # type computes.
    products/search/route.ts      # GET ?q=<query> — returns products + latest prices per chain.
                                   # Phase 11: the `.or(...)` filter also matches `barcode.eq.<q>`
                                   # (exact match), so the Scan view's manual barcode entry works
                                   # against this same endpoint instead of needing a new one.
    prices/compare/route.ts       # POST {items:[{product_id,quantity}], chain_ids?:[...]} — returns
                                   # cost per chain, optionally narrowed to chain_ids (Phase 11 chain
                                   # selector strip; client omits it until the user deselects a chain)
    baskets/[id]/items/route.ts   # Phase 16 — GET ?user_id=<uid>, service-role, verifies the basket
                                   # belongs to user_id (service-role bypasses RLS). Joins
                                   # basket_items -> products -> latest_prices server-side (two
                                   # parallel queries + JS merge, not a single embedded select —
                                   # basket_items.product_id has no real FK to products.id) so the
                                   # login-time basket-rehydration effect in page.tsx is one fetch.
    baskets/sync/route.ts         # Basket UPSERT/sync — NOT called from the frontend (dead code);
                                   # page.tsx writes to basket_items directly via the anon client
    dev/login/route.ts            # Dev-only: get-or-creates a fixed pre-confirmed test user via
                                   # the admin API and returns its credentials. 404s unless
                                   # NODE_ENV=development. Never sends real email.
    prices/ingest/route.ts        # POST: old webhook-style endpoint writing to the STALE
                                   # `price_snapshots` table (see schema.sql note below), unused/
                                   # dead, predates Phase 4, left as-is. GET (added Phase 6): real
                                   # cron target — runs runIngestion() from scripts/ingest-prices.ts
                                   # in-process, guarded by CRON_SECRET. See "Phase 6 — Deployment"
                                   # below.
scripts/
  ingest-prices.ts                # Real ingestion logic (Shufersal/Rami-Levy fetch + match +
                                   # insert) — see "Price ingestion pipeline" below. Exports
                                   # runIngestion(), no process-level side effects; imported by
                                   # both run-ingest-cli.ts and the GET route above.
  run-ingest-cli.ts               # `npm run ingest` CLI entry point (Phase 6) — env check +
                                   # console output + process.exit wrapper around runIngestion().
  seed-products-from-feed.ts      # Phase 5, widened Phase 8 (3 -> 20 branch files), widened again
                                   # Phase 11 to walk every paginated Shufersal listing page (~22
                                   # pages / ~424 files total, not a fixed file count) — pulls unique
                                   # real products (barcode/name/price) and inserts new ones into
                                   # products + price_history per page/batch, skipping barcodes
                                   # already present (safe to re-run — see Phase 8/11 below).
                                   # Run with `npm run seed:products`.
  probe-chain-feeds.ts            # Phase 11 — probes candidate feed URLs for chains not yet
                                   # integrated (both the URLs as originally given in a task spec and
                                   # the real endpoints found via research — see Phase 11 below). Run
                                   # with `npm run probe:chains`.
  parsers/                        # Phase 11 — one fetchAndParse(): Promise<ParsedProduct[]> module
                                   # per newly-integrated chain, sharing two platform clients:
    gov-xml.ts                    # Shared Food Act XML parser (Root>Items>Item>ItemCode/ItemName/
                                   # ItemPrice/...) — every chain below publishes this same schema.
    laibcatalog.ts                # Shared client for the laibcatalog.co.il ("ניביט"/Nibit) HTTPS
                                   # JSON API (no auth) — used by victory.ts and mahsanei-hashuk.ts.
    cerberus.ts                    # Shared client for the Cerberus FTP Server platform at
                                   # url.retail.publishedprices.co.il (real FTP, port 21, chain-
                                   # specific username + blank password) — used by yohananof.ts,
                                   # osher-ad.ts, keshet-teamim.ts, and (Phase 17) rami-levy.ts.
                                   # Uses the `basic-ftp` package.
    victory.ts / mahsanei-hashuk.ts / yohananof.ts / osher-ad.ts / keshet-teamim.ts / rami-levy.ts
                                   # Thin per-chain wrappers over the two clients above. rami-levy.ts
                                   # added Phase 17 — see "Phase 17" below; username `RamiLevi`.
    types.ts                      # Shared ParsedProduct type + a GovFeedItem -> ParsedProduct mapper.
  seed-branches.ts                # Phase 8 — pulls real store metadata (StoreID/StoreName/Address/
                                   # City) from the Shufersal "Stores" feed category (catID=5, a
                                   # single chain-wide file, distinct from the per-branch PriceFull
                                   # files) and inserts new branches. Phase 15: extended beyond
                                   # Shufersal to Victory/Mahsanei Hashuk (laibcatalog.co.il
                                   # `getbranches?edi=` — branch number + name, no address) and
                                   # Yohananof/Osher Ad/Keshet Teamim (Cerberus FTP — no store-
                                   # metadata feed at all, confirmed live; branches get a synthesized
                                   # "<chain> - סניף <StoreID>" name from the price-file StoreID).
                                   # Dedup switched from client-side (name_he, address) matching to a
                                   # (chain_id, external_id) unique index (migration
                                   # 007_branches_external_id.sql, see "Phase 15" below) via a real
                                   # PostgREST upsert. See "Phase 8" below for the City-field caveat.
                                   # Run with `npm run seed:branches`.
  geocode-branch-cities.ts        # Phase 16 — none of the government feeds publish lat/lng (see
                                   # above), so branches beyond the original 8 had none. Resolves
                                   # each branch's numeric settlement code (city_he) to a real name
                                   # via data.gov.il's official settlements dataset, geocodes each
                                   # unique city once via Nominatim (1 req/sec), and backfills
                                   # city-center (not address-level) lat/lng onto every branch still
                                   # missing them. Re-runnable — resumes from
                                   # scripts/.geocode-cache.json. Run with `npm run geocode:branches`.
  geocode-branches.ts             # Phase 17 — address-level companion to geocode-branch-cities.ts
                                   # above: geocodes the smaller set of branches that have a real
                                   # street `address` (mostly Shufersal) but still no lat/lng, via
                                   # Nominatim on "{address}, {city_he}, Israel" (1 req/sec). Only 10
                                   # branches qualified as of Phase 17 — most address-having branches
                                   # already got coordinates from earlier phases. Run with
                                   # `npm run geocode:branches:address` (kept distinct from
                                   # `geocode:branches` above, which already pointed at
                                   # geocode-branch-cities.ts — renaming that existing script would
                                   # have been a breaking, unrequested change).
  enrich-product-names.ts         # Phase 5 — batches products missing name_en 50 at a time and
                                   # asks claude-haiku-4-5 to translate name_he to English. Run
                                   # with `npm run enrich:names`. Needs ANTHROPIC_API_KEY in
                                   # .env.local (not currently configured in this repo).
  shufersal-feed.ts               # Shared Shufersal fetch/gunzip/XML-parse logic. Exports
                                   # fetchShufersalFileLinks()/fetchAndParseShufersalFile() for the
                                   # PriceFull (catID=2) feed, used by ingest-prices.ts and
                                   # seed-products-from-feed.ts, plus fetchShufersalStoresFileUrl()
                                   # (Phase 8) for the Stores (catID=5) feed, used by
                                   # seed-branches.ts.
  supabase-rest.ts                # Shared env-loading + PostgREST client helpers (restFetch,
                                   # fetchWithRetry, chunk, refreshLatestPrices), used by all three
                                   # scripts above.
  tsconfig.json                   # Overrides module/moduleResolution to commonjs/node for
                                   # ts-node; the root tsconfig targets Next.js's bundler
                                   # resolution, which ts-node can't execute directly.
components/
  AuthModal.tsx                   # OTP sign-in / sign-up modal + "Dev Login" button (dev only).
                                   # Takes a `lang` prop (Phase 10) so its error copy can be
                                   # bilingual per-message instead of one concatenated "EN / HE"
                                   # string — see "Phase 10" below.
  BranchMapContainer.tsx          # Phase 12: full-bleed map only (no side branch-list panel —
                                   # removed as part of the Location-view redesign, see "Phase 12"
                                   # below). Dynamically imports BranchLeafletMap. Phase 13: root
                                   # div is `relative w-full flex-1 min-h-0` (no `h-full`) — its
                                   # parent in page.tsx is a `flex` container specifically so this
                                   # gets a real height from flex layout instead of a percentage
                                   # that never resolves — see "Phase 13" below.
  BranchLeafletMap.tsx            # Actual react-leaflet map — pins colored by chain color_hex,
                                   # popups with Waze deep link, flyTo on active-pin change,
                                   # optional userPosition prop renders a blue "you are here" pin
                                   # and flies the map to it on first fix. `theme` prop switches
                                   # the TileLayer between OSM (light) and CartoDB dark_all (dark)
                                   # — see "Theme system" below
lib/
  supabaseServer.ts               # Service-role Supabase client (API routes only)
utils/
  supabase.ts                     # Anon Supabase client (browser only) — always import this one;
                                   # do not call createClient() inline elsewhere (caused a
                                   # "Multiple GoTrueClient instances" warning previously)
supabase/
  schema.sql                      # STALE — only covers profiles/households/baskets/basket_items/
                                   # price_snapshots. The live DB additionally has products, chains,
                                   # branches, price_history, latest_prices, and basket_items.product_id,
                                   # none of which are in this file. Treat the "Database schema" section
                                   # below (and the live PostgREST schema) as the source of truth, not
                                   # this file, until it's regenerated via `supabase db pull` or similar.
  migrations/
    002_price_alerts.sql          # price_alerts table (see below). CONFIRMED APPLIED (verified
                                   # 2026-07-19 via a direct PostgREST GET — see "Applying
                                   # migrations" below for how this was checked).
    003_household_invite.sql      # households.invite_code column + get_or_create_own_household()/
                                   # join_household_by_code() RPC functions (see below). CONFIRMED
                                   # APPLIED (same verification pass).
    004_ingest_log.sql            # ingest_log table (see "Price ingestion pipeline" below).
                                   # CONFIRMED APPLIED (same verification pass) — ingest-prices.ts
                                   # successfully writes rows to it now.
    005_waitlist.sql               # waitlist table (Phase 11 step 7 / Phase 12, see "Phase 12"
                                   # below). CONFIRMED APPLIED — re-checked live via PostgREST in
                                   # Phase 14 (`waitlist?select=id` → `200 []`, not PGRST205). This
                                   # file previously said NOT YET APPLIED; that was stale (applied
                                   # 2026-07-27, evidently before the Phase 14 session started) —
                                   # see "Applying migrations" below for the correction.
    006_online_branches.sql        # branches.is_online column + Shufersal/Rami Levy Online seed
                                   # rows (Phase 14, see below). CONFIRMED APPLIED — re-checked live
                                   # via PostgREST in Phase 15 (`branches?select=is_online` → `200`,
                                   # real `false` values, not `42703`). This file previously said NOT
                                   # YET APPLIED here; that was stale — see "Applying migrations"
                                   # below for the correction.
    007_branches_external_id.sql   # branches.external_id column + a (chain_id, external_id) unique
                                   # index (Phase 15, see below) — lets seed-branches.ts dedupe
                                   # branches from chains with no name/address feed. NOT a partial
                                   # index (deliberately — see the file's own comment for why a
                                   # partial index would break PostgREST's on_conflict upsert).
                                   # CONFIRMED APPLIED (Phase 16 re-check — see "Applying
                                   # migrations" below; this line previously said NOT YET APPLIED).
    008_analytics_indexes.sql      # ph_captured_chain (price_history(chain_id, captured_at DESC)) +
                                   # bi_product (basket_items(product_id)) — speed up the Phase 15
                                   # analytics queries. Performance only, not correctness — the
                                   # analytics route works without them. NOT YET APPLIED.
    009_custom_markets.sql         # custom_markets + custom_market_entries tables (Phase 16, local/
                                   # independent market spending tracker) — written and RLS-gated
                                   # directly for client-side inserts, same pattern as baskets/
                                   # basket_items. NOT YET APPLIED — the Custom Markets analytics
                                   # section degrades to an empty state until this is pasted into
                                   # the Supabase Dashboard SQL Editor.
```

## Environment variables
Located at `.env.local` (gitignored). If missing, run: `npm run env:link`
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
```
`RESEND_API_KEY` is only used as the custom SMTP credential configured in the
Supabase dashboard (Auth → Emails → SMTP Settings) — the app code never reads
it directly. See "Custom SMTP (Resend)" below for the dashboard values.

`CRON_SECRET` (added Phase 6) is only required in production — it guards the
`GET /api/prices/ingest` cron route (see "Phase 6 — Deployment" below). Not
needed for local dev unless you're manually testing that route.

## Database schema (key tables)
```sql
chains         — id (text PK), name_he, name_en, color_hex
products       — id (uuid), barcode (unique), name_he, name_en, category
branches       — id, chain_id, name_he, name_en, city_he, city_en, lat, lng, is_active,
                 is_online (migration 006, CONFIRMED APPLIED), external_id (migration 007,
                 NOT YET APPLIED — see "Applying migrations" below)
price_history  — id, product_id, chain_id, branch_id, price, captured_at, source
latest_prices  — MATERIALIZED VIEW: latest price per (product_id, chain_id)
profiles       — id (= auth.users.id), nickname, phone_number, avatar_url, selected_skin
                 (selected_skin is a leftover DB column from the old 4-skin system — see
                 "Theme system" below. Harmless if left in place; the app no longer reads
                 or writes it. Drop it in a future migration if you want to clean it up.)
households     — id, name, invite_code (unique, nullable — migration 003, CONFIRMED APPLIED)
household_members — household_id, user_id, role
baskets        — id, user_id, household_id, name, is_archived
basket_items   — id, basket_id, product_id, product_name, quantity_value
messages       — id, user_id, nickname, message_text, created_at
price_alerts   — id, product_id, user_id, target_price, chain_id, is_active
                 (migration 002, CONFIRMED APPLIED)
ingest_log     — id, chain_id, started_at, finished_at, products_fetched,
                 products_matched, products_inserted, error_text
                 (migration 004, CONFIRMED APPLIED)
waitlist       — id, email, feature (default 'coupons'), user_id (nullable), created_at
                 (migration 005, CONFIRMED APPLIED — see "Phase 11" below; CLAUDE.md
                 previously said NOT YET APPLIED, that was stale)
schema_migrations — version (text), applied_at. Discovered live (Phase 11) via a direct
                 PostgREST check — not mentioned anywhere earlier in this doc, but it's
                 a real, queryable table (`schema_migrations?select=*` returns 200) that
                 already tracks 001/002/003/004/005_consolidation/005_waitlist as
                 applied. It's a plain table (no DDL), so — unlike everything else in
                 "Applying migrations" below — a migration's own INSERT/UPDATE rows
                 (not ALTER TABLE/CREATE TABLE) CAN be written directly via the
                 service-role REST client, no Dashboard SQL Editor needed. Use this to
                 check whether a migration is applied instead of guessing from this
                 doc; only add a version row here once its actual DDL has been
                 confirmed applied (a row with no matching schema change would make
                 this table lie).
```

RPC functions (migration 003, CONFIRMED APPLIED):
```
generate_invite_code()             — internal helper, 6-char alphanumeric code
get_or_create_own_household()      — lazily creates the caller's household + invite
                                      code on first call, returns (id, name, invite_code)
join_household_by_code(code text)  — inserts a household_members row for the caller
                                      into the household matching invite_code
```

## Seeded data
- 18 original placeholder products with Hebrew + English names — barcodes are
  plausible-looking fake EAN-13s, **not** real chain SKUs (see "Price ingestion
  pipeline" below), so they never match anything in a real feed
- **38,346 products total as of Phase 11** (2026-07-27) — grew from 9,648
  (Phase 8) after widening `seed-products-from-feed.ts` again to walk every
  paginated Shufersal listing page (~22 pages / ~424 branch files, not just
  the first 20) — see "Phase 11" below. `name_en` is null for all real-feed
  products until `npm run enrich:names` is run
- **7 chains as of Phase 11**: shufersal, rami_levy, victory, yohananof,
  osher_ad, keshet_teamim, mahsanei_hashuk (the last 3 added Phase 11 — see
  below). `rami_levy` still has no working feed (see "Price ingestion
  pipeline" below); the other 6 all have real ingest paths as of Phase 11.
- **428 branches total as of Phase 8** — grew from the original 8 (Gush Dan
  area, real coordinates) to 428 (420 new) via `scripts/seed-branches.ts`. The
  420 new rows have real `name_he`/`address` but **no `lat`/`lng`** (not in the
  Stores feed) and a numeric government settlement code in `city_he` instead of
  a name (see "Phase 8" below) — they show up in the Location view's
  unfiltered branch list but not on the map or in GPS-distance results, which
  both require `lat`/`lng`
- 72 price rows (18 original products × 4 chains) with realistic ILS prices,
  plus one real `shufersal` price_history row per Phase-5/8 product
- latest_prices materialized view populated

## Custom SMTP (Resend)
Supabase's built-in email service has a very low rate limit (a few emails/hour),
which breaks OTP testing. Fix: configure Resend as custom SMTP.

Manual steps in Supabase Dashboard → Project Settings → Auth → SMTP Settings:
```
Enable Custom SMTP: ON
Sender email:        onboarding@resend.dev   (or a verified domain sender)
Sender name:         Smart Grocery IL
Host:                smtp.resend.com
Port:                465
Username:             resend
Password:             <the RESEND_API_KEY value>
Minimum interval between emails: lower from default if still testing OTP a lot
```
`RESEND_API_KEY` only needs to live in `.env.local` as a reference for whoever
is pasting it into the dashboard — the running app does not call Resend directly.

**BROKEN as of Phase 8 (2026-07-21) — every sign-up currently fails.**
`supabase.auth.signUp()` returns HTTP 500 `"Error sending confirmation email"`
for every email address tried, including the Resend account's own verified
address (`matiasepxress@gmail.com`) — confirmed via `curl` directly against
`/auth/v1/signup`. Ruled out: the Resend API key itself, which works fine when
called directly (`curl https://api.resend.com/emails ...` with that same key
succeeds and returns a real message id) — so the failure is specifically in
Supabase's SMTP relay/config, not Resend or the key. Likely causes to check by
hand in the Dashboard (no CLI/DB access to verify programmatically — see
"Applying migrations" below): the configured Sender email may not match a
domain Resend has verified for this account (the direct-API test above used
`onboarding@resend.dev` explicitly; if the Dashboard's Sender email field is
set to something else, Resend's SMTP relay would reject it even though the API
call above succeeds), the SMTP password may be stale, or "Minimum interval
between emails" may be throttling harder than expected. **Until this is fixed,
sign-up cannot be tested end-to-end** — `AuthModal.tsx` now shows a clear error
instead of a broken one when this happens (see "Phase 8" below), but the OTP
email itself will not arrive.

**Re-confirmed broken as of Phase 9 (2026-07-27)**, same exact symptom
(`500 "Error sending confirmation email"` from `/auth/v1/signup`, Resend API
key still works fine when called directly). Also ruled out this session: no
`on_auth_user_created` (or any other) trigger on `auth.users` exists anywhere
in `supabase/schema.sql` or `supabase/migrations/` — profile-row creation is
and always was handled by app code (`AuthModal.tsx`'s `.upsert()` calls after
`signUp`/`verifyOtp`), not a DB trigger, so a missing/broken trigger is not
the cause. This is purely a Dashboard SMTP config issue with no CLI/Management
API access available in this environment to fix programmatically — the user
is fixing it by hand in the Dashboard.

## Price ingestion pipeline
Israel's Food Act (2014) requires the major chains to publish real-time prices
as public XML/JSON feeds. `scripts/ingest-prices.ts` is a standalone script
(not a Next.js API route — see Node 20 gotcha below) that pulls real data from
two of them and loads it into `price_history`:

```
Shufersal:  https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=0
Rami Levy:  ftp://url.retail.publishedprices.co.il (Cerberus platform, username RamiLevi,
            blank password — see "Phase 17" below; fixed, no longer the JSON URL below)
```

**Shufersal** — that URL is not itself an XML feed; it's an HTML page listing
one gzipped `PriceFull*.gz` XML file per branch (Azure Blob Storage links with
short-lived SAS signatures, ~hundreds of branches, paginated). The script
fetches that listing, regexes out the blob URLs, downloads + gunzips the first
`SHUFERSAL_STORE_LIMIT` files (default 3, override via env var), and parses
each with `fast-xml-parser`. Each `<Item>` has `ItemCode` (barcode), `ItemName`,
`ItemPrice`, `Quantity`, `UnitOfMeasure` — confirmed against the live feed;
there is **no** `ItemSection`/`SubSection` field, contrary to an earlier
assumption (see `scripts/seed-products-from-feed.ts` below). The fetch/gunzip/
parse logic lives in `scripts/shufersal-feed.ts`, shared with the seeding
script. Verified working end to end against the live feed.

**Rami Levy — FIXED in Phase 17 (2026-08-04), see that section below for the
full writeup.** Everything in this paragraph and the two below it is now
historical (kept for the record of what didn't work): the original
`url.rami-levy.co.il` host had a DNS failure; `www.rami-levy.co.il/api/
delivery/prices` resolves but 404s; three more URL variants tried in Phase 6
(`/api/marketplace/v2/prices`, `/api/delivery/prices?storeId=331`, an added
User-Agent header) all hit the identical Nuxt.js SPA 404 page. The real access
method turned out to be a completely different platform than any of these
guesses — the government Cerberus FTP server, same one already used for
Yohananof/Osher Ad/Keshet Teamim — found via web research rather than more
URL guessing. `ingestRamiLevy()`/`extractRamiLevyItems()` (the old JSON-based
functions described below) were deleted from `scripts/ingest-prices.ts` and
replaced with `scripts/parsers/rami-levy.ts`, which reuses the same
`fetchCerberusItems()` client as the other three FTP chains.

## Phase 5 — real products seeded, real prices flowing
`scripts/seed-products-from-feed.ts` (`npm run seed:products`) fixed the
barcode-match problem described above by pulling **real** products straight
from the live Shufersal feed instead of relying on the fictional seed
barcodes:
- Fetches the same Shufersal listing/XML as `ingest-prices.ts` (shared code in
  `scripts/shufersal-feed.ts`), collects the first 200 unique barcodes seen
  (reads up to `SHUFERSAL_STORE_LIMIT`, default 5, branch files to gather
  enough uniques — one branch file alone can repeat the same catalog)
- Upserts each into `products` (`barcode`, `name_he` = `ItemName`, `name_en` =
  `null`, `category` inferred from Hebrew keywords in `ItemName` — see below)
- Inserts a matching `price_history` row per product for `shufersal`
- Calls `refresh_latest_prices()`

**Category inference, not `ItemSection`.** The real feed has no section/
category field at all (see above) — only `ItemName`, `ManufactureName`, price/
unit fields. `seed-products-from-feed.ts` instead tokenizes `ItemName` on
whitespace/punctuation and matches **whole tokens** (not raw substrings)
against Hebrew keyword lists for `dairy`/`bread`/`meat`/`beverage`/`produce`,
falling back to `other`. Token-matching (rather than `name.includes(kw)`)
matters: a raw-substring version misclassified "גרניה ספריי" (hair spray) as
`produce` because "ספריי" (spray) contains "פרי" (fruit) as a mid-word
substring — fixed by requiring the keyword to match a whole token (via
`token.startsWith(kw)`, to still catch plural/suffixed forms).

Verified end to end 2026-07-19: 200 real products upserted (218 total in
`products`), 200 real `price_history` rows inserted, and `npm run ingest`
afterward reported `shufersal fetched=20072 matched=534 inserted=534` (up from
0 before this session — the extra matches beyond the 200 seeded are because
later Shufersal branch files overlap with the first 200 barcodes).

Run manually: `npm run ingest` (uses `SUPABASE_SERVICE_ROLE_KEY` from
`.env.local`, same as everything else). Retries once per attempt on
HTTP 429/503 (3 attempts, 2s delay); any other feed failure is logged per-chain
and the script continues rather than crashing. Prints a summary line per chain
and writes a row to `ingest_log`.

## RLS rules
- products, chains, branches, price_history, latest_prices: public SELECT (authenticated + anon)
- baskets, basket_items: user owns their own rows (auth.uid() = user_id)
- profiles: user owns their own row
- price writes: service_role only
- **Gotcha:** don't write to `profiles` right after `supabase.auth.signUp()`. When email
  confirmation is required, `signUp()` returns `session: null`, so the anon client has no
  JWT yet and `auth.uid()` is null — the profiles RLS check silently rejects the insert.
  Create/upsert the profile row only after a real session exists (i.e. after OTP
  verification, or immediately if auto-confirm is on and `signUp()` already returned a
  session). See `components/AuthModal.tsx`'s `handleVerify`.

## Dev-mode auth bypass
`AuthModal.tsx` shows a "Dev Login" button when `NODE_ENV=development`. It calls
`POST /api/dev/login`, which get-or-creates a fixed test account
(`dev@smartgrocery.local` / `DevLogin123!`) via `supabase.auth.admin.createUser` with
`email_confirm: true`, upserts its `profiles` row, and returns credentials for the
client to call `signInWithPassword` with. No email is ever sent by this path, and the
route 404s outside development — use this instead of real signups when testing basket/
profile/UI flows locally. Since this account lives on the same live Supabase project
`.env.local` points at (not a separate local DB), its credentials also work via the
regular sign-in form in production (where the Dev Login button itself is correctly
hidden, per the 404 guard) — useful for testing the signed-in app end-to-end on
`smart-grocery-il.vercel.app` without needing a working OTP email (see the SMTP
gotcha above).

## Theme system (light/dark)
**Phase 7 (2026-07-21) replaced the old 4-skin system** (`warm-rose`/`earth-slate`/
`neon-acid`/`ocean-steel`, picked from a swatch grid in the Profile view) with a
plain light/dark theme. The old `Skin` type, `PALETTES` object, and the Profile
skin-picker section are gone; `profiles.selected_skin` is no longer read or
written by the app (see the DB schema note above).

**Tokens:** `app/globals.css` defines `--color-bg-base/panel/subtle/hover`,
`--color-text-primary/secondary/muted`, `--color-accent/-hover/-text`,
`--color-success/warning/danger(-bg)` under `:root` (light default) and
`[data-theme="dark"]` (dark overrides). Every component uses these via
Tailwind arbitrary-value classes, e.g. `bg-[var(--color-bg-panel)]`,
`text-[var(--color-text-muted)]` — there are no hardcoded `slate-*`/`indigo-*`/
etc. Tailwind color classes left in `page.tsx`, `AuthModal.tsx`, or
`BranchMapContainer.tsx`. Chain brand colors (`chains.color_hex`, `#E11D48`
Shufersal / `#2563EB` Rami Levy / `#16A34A` Victory / `#D97706` Yohananof) are
intentionally NOT tokens — they identify the brand and stay fixed regardless
of theme, used only for dots/bars/map pins, never as plain text on a
background.

**Four token values were deliberately darkened from an earlier design brief**
because the literal values fail WCAG AA (4.5:1) when used as text color,
verified by computing relative luminance by hand:
- light `--color-text-muted`: would be `#868E96` (~3.3:1 on white) → `#6B7280` (~4.8:1)
- light `--color-success`: would be `#2F9E44` (~3.4:1 on white) → `#15803D` (~5.0:1)
- light `--color-warning`: would be `#F08C00` (~2.5:1 on white) → `#B45309` (~5.0:1)
- dark `--color-accent-hover`: would be `#60A5FA` (white button text on hover
  only ~2.5:1) → `#2563EB` (~5.2:1) — the brief's dark-mode hover value was
  *lighter* than the base accent (brighten-on-hover), which is backwards from
  what keeps white button text readable; darkening on hover (matching light
  mode's behavior) fixes it.

If a future palette tweak reintroduces one of the original values, re-check
contrast against white/`--color-bg-panel` (light) or `--color-bg-panel` dark
(#1A1D23) before shipping it — don't assume a "brand" hex is safe as text.

**Toggle:** a Sun/Moon button in the header (next to the language toggle,
`app/page.tsx`) flips `theme` state between `'light'`/`'dark'`, sets
`document.documentElement.dataset.theme`, and persists to `localStorage` under
`sg_theme`. `app/layout.tsx` has a `dangerouslySetInnerHTML` inline script in
`<head>` that reads that key and sets `data-theme="dark"` on `<html>` before
React hydrates (avoids a light-mode flash on reload) — `<html>` needs
`suppressHydrationWarning` for this (same reason `<body>` already had it: the
attribute is intentionally client-only and won't match the server-rendered
markup).

**ChainBar contrast fix:** the price-comparison bar's price label
(`app/page.tsx`, `ChainBar` component) used to be a plain white `text-white`
span absolutely positioned over the whole bar width, which could land on the
plain track background (not the colored fill) depending on the fill
percentage — unreadable in light mode where the track is a light gray. It now
has its own `bg-black/40` backing so it's readable regardless of theme or fill
width.

**Leaflet dark tiles:** `BranchLeafletMap` takes a `theme` prop (threaded from
`page.tsx` → `BranchMapContainer` → `BranchLeafletMap`) and swaps the
`TileLayer` `url` between the default OpenStreetMap tiles (light) and CartoDB's
`dark_all` tiles (dark, `https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png`).
The Leaflet popup content itself (branch name/city inside `<Popup>`) is
untouched — Leaflet's own `leaflet.css` always renders popups with a fixed
white background, so the existing dark-ish popup text stays readable in both
app themes without needing tokens there.

## Current roadmap phase
**Phase 0 complete** — schema, seed data, API routes in place.

**Phase 1 complete:**
- [x] Fixed product search returning empty results — root cause was a corrupted
      SUPABASE_SERVICE_ROLE_KEY (stray leading char) in the linked env file, plus
      .env.local having been a symlink instead of a real file
- [x] /api/products/search?q=חלב returns products with prices per chain
- [x] /api/prices/compare returns sorted chain totals + cheapest_chain + max_savings
- [x] basket_items.product_id wired to real products.id on add
- [x] Basket items + prices rehydrate into UI state on login
- [x] Real Leaflet map (react-leaflet) replacing the placeholder, pins colored by
      chain, Waze deep links, "Navigate to cheapest" pre-selects that chain's branches
- [x] Search autocomplete loading skeleton
- [x] 44×44px touch target audit (header had two undersized buttons, now fixed)
- [x] Auth flow tested end-to-end incl. profile row + auto-created basket

**Phase 2 in progress:**
- [x] Color/rank map pins by this basket's cost at that branch (green/amber/red via
      `/api/prices/compare` comparison data), basket total shown in the marker popup
- [x] Price alerts: bell icon per basket item persists a row to `price_alerts`
      (no notification delivery yet — persistence only). **Needs migration
      `002_price_alerts.sql` applied via the Supabase SQL Editor before it works.**
- [x] Household invite flow in Profile view: generate/copy a 6-char invite code,
      join by code. **Needs migration `003_household_invite.sql` applied via the
      Supabase SQL Editor before it works** (adds `households.invite_code` +
      the `get_or_create_own_household`/`join_household_by_code` RPCs).
- [ ] Wire CHAT view to the `messages` table (currently local mock state only)
- [ ] Regenerate `supabase/schema.sql` (or a migration) so it matches the live DB
- [ ] Either wire `app/api/baskets/sync/route.ts` into the frontend or remove it —
      it's currently unused dead code

**Phase 3 in progress:**
- [x] Chat message bubbles show a timestamp (today → time only, e.g. `14:32`;
      older → `DD/MM HH:mm`, he-IL locale when `lang==='he'`). Still local mock
      state (`chatMessages`) — not read from the `messages` table yet (see above).
- [x] Save List / Clear List buttons under the Home basket. Save List prompts for
      a name (default: today's date, `he-IL` format), inserts a new `baskets` row
      + copies the current items into new `basket_items` rows, then clears the
      *active* basket's items (the working basket keeps its `id`, it's just
      emptied — the saved copy is the new row). Clear List just empties the
      active basket's items after a `window.confirm`.
- [x] Per-product price breakdown: each row under "מחיר לפריט" in the Price
      Comparison panel is now a toggle button; expanding it shows every chain's
      price for that product with cheapest/most-expensive highlighted
      (green/red). Purely a `expandedPriceItemId` UI state, no new data fetch.
- [x] GPS location + distance filter in the Location view: requests
      `navigator.geolocation` on view load, centers the map + drops a blue
      "you are here" pin on success, and adds a 1/3/5/10 km radius slider that
      filters `liveBranches` client-side via a haversine distance calc. On
      denial (or no `navigator.geolocation`), shows a city-search text input
      that matches against both `city_he` and `city_en` instead. The
      granted/denied/manual-city preference persists in `localStorage` under
      `sg_location_pref` so a repeat visit can prefill the last city typed.

**Lint cleanup (pre-Phase 4):**
- [x] Fixed `eslint.config.mjs` — ESLint 9's flat config doesn't auto-ignore
      dotfolders the way the old `.eslintrc.json` did, so it was linting
      `.next/` build output. Added an `ignores` block; also dropped a rule
      override for `react-hooks/set-state-in-effect`, which isn't registered
      by the installed `eslint-plugin-react-hooks` version and was
      hard-erroring lint regardless of severity.
- [x] Replaced all `any` types in `page.tsx`, `AuthModal.tsx`,
      `BranchMapContainer.tsx` with real types (`Dictionary`, `LiveBranch`,
      `SavedBasket`, `ChatMessage`, `BranchRow`); `Dictionary` is exported
      from `page.tsx` as `typeof DICTIONARY['he']` and imported by the two
      components. `npx tsc --noEmit` and `npm run lint` are both clean
      (warnings remain only in `app/api/baskets/sync/route.ts` and
      `app/api/prices/ingest/route.ts`, which were out of scope).
- [x] Removed dead code: unused lucide icon imports, `CHAIN_ORDER`,
      `dataWindow`/`isBasketLoaded`/`location` state (set but never read),
      `handleAvatarUpload` (never wired to an input).

**Phase 4 in progress — real price ingestion pipeline:**
- [x] `scripts/ingest-prices.ts` — see "Price ingestion pipeline" above.
      Shufersal ingestion verified against the live feed; Rami Levy's given
      URL doesn't resolve. Barcode match rate against seed data is 0 (seed
      barcodes aren't real chain SKUs) — mechanics are verified correct via
      a direct REST check, not a script bug.
- [x] Apply `004_ingest_log.sql` via the Supabase SQL Editor — confirmed
      already applied on the live project this session (Phase 5), along with
      `002_price_alerts.sql` and `003_household_invite.sql` (see "Applying
      migrations" below)
- [ ] Victory (zipped XML) and Yohananof ingestion — not started
- [x] Replace seed barcodes with real ones — done in Phase 5 via
      `scripts/seed-products-from-feed.ts` (real Shufersal catalog data, not a
      barcode swap on the old placeholders)

**Phase 5 in progress — fix product matching, get real prices flowing:**
- [x] `scripts/seed-products-from-feed.ts` — seeds 200 real products + real
      Shufersal prices from the live feed (see "Phase 5 — real products
      seeded" above). Run: `npm run seed:products`.
- [x] Rami Levy URL updated to `www.rami-levy.co.il/api/delivery/prices` and
      response parsing updated for `{data: [{id, name, price}]}` — the host
      now resolves (unlike before) but currently 404s; still unverified
      end-to-end (see "Price ingestion pipeline" above)
- [x] Verified `/api/products/search?q=חלב` and `?q=לחם` both return real
      products (mix of the 18 original + Phase-5 Shufersal items) — no
      trigram-index or `ANALYZE` fix was needed, the route uses plain
      `ilike`, not a trigram similarity search
- [x] `scripts/enrich-product-names.ts` — batches products missing `name_en`
      50 at a time through `claude-haiku-4-5` for Hebrew→English translation.
      Written and type-checked, but **not run** this session — no
      `ANTHROPIC_API_KEY` or `ant auth login` profile is configured in this
      environment. Add a key to `.env.local` before `npm run enrich:names`
      will do anything.
- [x] Confirmed all three pending migrations (`002`, `003`, `004`) are
      already applied on the live project — see "Applying migrations" below
- [x] Documented cron scheduling options for `npm run ingest` — see "Scheduling
      the ingestion pipeline" below (documentation only, nothing wired up)

**Phase 7 complete — light/dark theme (2026-07-21):**
- [x] Replaced the 4-skin palette system with light/dark CSS tokens — see
      "Theme system" above for the full writeup, including the 4 token values
      that were deliberately darkened to pass WCAG AA
- [x] Sun/Moon toggle in the header, persisted to `localStorage` (`sg_theme`),
      applied via `data-theme` on `<html>` with a pre-hydration script to avoid
      a light-mode flash on load
- [x] Removed the skin-picker section from the Profile view and all
      `selected_skin` reads/writes from the app (DB column left in place,
      unused — see DB schema note above)
- [x] Every hardcoded `slate-*`/`indigo-*`/`emerald-*`/`amber-*`/`rose-*`
      Tailwind class in `page.tsx`, `AuthModal.tsx`, and `BranchMapContainer.tsx`
      replaced with a CSS-variable-backed arbitrary-value class
- [x] Leaflet map tiles switch between OSM (light) and CartoDB `dark_all`
      (dark) based on theme
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean;
      manually verified both themes across Home/AuthModal/drawer/Profile/
      Location in a real browser, including toggle persistence across reload
- [x] Deployed in Phase 8 — `vercel --prod` run 2026-07-21, live at
      `https://smart-grocery-il.vercel.app` (see "Phase 8" below)

**Phase 8 complete — production smoke-test fixes (2026-07-21):**
- [x] Product catalog widened 218 → 9,648 (20 branch files instead of 3-5)
- [x] Per-product price breakdown — verified already working
- [x] Distance slider widened to a continuous 0.5-50km range
- [x] Real branches seeded 8 → 428 via the Shufersal Stores feed (catID=5)
- [x] Auth gate added — sign-in required, guest mode removed entirely
- [x] Sign-up "red brackets" bug fixed (raw `"{}"` → real error message);
      underlying SMTP delivery still broken, unresolved (see "Custom SMTP"
      above)
- [x] First production deploy — `vercel --prod`, live at
      `https://smart-grocery-il.vercel.app`, all 5 fixes re-verified there
- See "Phase 8" section below for full details on each

**Phase 9 complete — mobile UI fixes (2026-07-27):**
- [x] Sticky header — `app/page.tsx`'s main-app `<header>` is now
      `sticky top-0 z-40` with a solid `bg-[var(--color-bg-base)]` background.
      Required also changing the page wrapper's `overflow-x-hidden` to
      `overflow-x-clip` — see "Known issues / gotchas" below for why
      `overflow-x-hidden` silently broke `position: sticky` here.
- [x] `AuthModal.tsx` mobile keyboard fix — modal content is now its own
      scroll region (`max-h-[100dvh]`, `overflow-y-auto`) with
      `pb-[env(keyboard-inset-height,120px)]` bottom padding so the submit
      button stays reachable when the soft keyboard is open. Verified by
      constraining the browser viewport to 375×400 and confirming every
      field + the submit button scroll into view.
- [ ] Sign-up 500 error — re-diagnosed, not fixed (still the same broken
      Dashboard SMTP config from Phase 8, see "Custom SMTP" above). Confirmed
      no missing DB trigger is involved. User is fixing the SMTP config
      directly in the Supabase Dashboard.

**Phase 10 complete — production bug fix session (2026-07-27):**
- [x] Bilingual, specific auth error messages — `AuthModal.tsx` replaced its
      one generic error string with `getFriendlyAuthErrorMessage(err, lang,
      context)`, which matches Supabase's real `AuthApiError.code` values
      (`invalid_credentials`, `email_not_confirmed`, `otp_expired`, falling
      back to message-text regexes for older/uncoded errors) and returns
      Hebrew or English copy based on a new `lang` prop threaded in from
      `page.tsx`. Wrong email and wrong password intentionally still share
      one message ("Incorrect email or password") to avoid leaking account
      existence — this was an explicit requirement, not an oversight. The
      sign-in branch's old custom throw (`'User account does not exist...'`)
      was removed since it was the same underlying Supabase error and
      contradicted that requirement. Verified live on production: submitting
      bad credentials shows the new copy in both languages.
- [x] AuthModal mobile-keyboard fix, take 2 — Phase 9 already added
      `max-h-[100dvh]`/`overflow-y-auto`/keyboard-inset padding, but the
      *backdrop* (`fixed inset-0 ...`) still also had `overflow-y-auto`,
      and the panel's `my-8` margin combined with `max-h-[100dvh]` meant the
      panel could exceed the viewport with no way to reach the clipped
      portion once backdrop scroll was removed. Fixed by dropping the
      backdrop's own scroll (only the panel content should scroll) and
      capping the panel at `max-h-[calc(100dvh-2rem)]` (accounting for the
      backdrop's `p-4`) instead of the margin-based approach. Keyboard-inset
      fallback padding bumped 120px → 140px. Verified at 375×400 (viewport
      height roughly halved, simulating a keyboard) that the submit button
      and "Sign Up" link scroll fully into view.
- [x] Sticky header border — the header was already `sticky top-0 z-40` with
      a solid background from Phase 9; added `border-b
      border-[var(--color-border)]` for visual separation from scrolled
      content. Verified on both Home and Location views (the latter has a
      full-height map underneath).
- [x] Redeployed — `vercel --prod`, all three fixes re-verified live at
      `https://smart-grocery-il.vercel.app` (not just localhost), including
      confirming the Dev Login button correctly stays hidden in production.
- Each fix landed as its own commit (`git add -p` used to split fix-specific
  hunks out of files that had multiple fixes' changes interleaved).

**Phase 11 in progress — UX overhaul (2026-07-27; the user's own session
prompt called this "Phase 8", but that number was already used above for the
2026-07-21 production-smoke-test session — numbered 11 here to stay
sequential with this doc's history).** Restructures navigation/visual layout
toward a native-app feel. Steps 1-5 done, steps 6-7 not started:
- [x] **Step 1 — simplified header.** Compact icon row: app icon (opens a
      new About sheet: name/tagline/version 1.0.0/close), then 44×44
      lang/theme/notifications(badged when `priceAlerts` is non-empty)/
      profile-avatar buttons. Removed the title/subtitle text, the old
      user-name block, and the hamburger button — the profile avatar now
      opens the (still side-slide-in, pending step 6) drawer.
- [x] **Step 2 — bottom navigation bar.** Fixed 4-tab bar (Home/Scan/
      Coupons/Location — new `BottomNav` component), `height: calc(64px +
      env(safe-area-inset-bottom, 16px))`, active-tab indicator dot, always-
      visible labels. Added `SCAN`/`COUPONS` to the `View` type with stub
      content (polished in step 5). Content area got `pb-[80px]` so it's
      never hidden behind the bar. Home/Location removed from the drawer's
      item list (now bottom-nav tabs); Saved Lists/Chat/Price Updates/
      Community stay in the drawer.
- [x] **Step 3 — chain selector strip.** New `ChainSelectorStrip` above the
      Home search bar — up to 4 chains selected (`MAX_SELECTED_CHAINS`),
      persisted to localStorage `sg_selected_chains`, a `Toast` component on
      a 5th attempt. Wired through: `/api/prices/compare` now accepts an
      optional `chain_ids` array and narrows its per-chain totals to it
      (client sends `selectedChains`); the Location map's branch pins are
      filtered to selected chains via a new `visibleBranches` memo (layered
      on top of the existing distance/city filter).
- [x] **Step 4 — leaner product rows + price-per-100g.** New `BasketRow`
      component: a single ≤56px row (name + unit price / compact qty
      controls / cheapest-chain line total + a 32×32 `×` delete button),
      tapping it expands a per-chain breakdown (extracted into a shared
      `ChainPriceBreakdown` component). This *replaced* the old ~80px basket
      card **and** the side panel's separate "price per item" expandable
      list, which was now duplicate UI — removed as dead weight. The price-
      alert bell (no room in the compact row) moved into the expanded panel.
      **Key discovery:** `latest_prices.unit_type` is NOT a clean enum —
      queried live data and found real values are free-text Hebrew from the
      government feed's UnitOfMeasure field: `"100 גרם"`, `"100 מיליליטר"`,
      `"1קילוגרם"`, `"1ליטר"`, `"יחידות"`, plus `"unit"` (only on the 18
      original seed-placeholder rows) and `"מטרים"` (non-food, no per-100g
      equivalent). `formatUnitPrice()` in `page.tsx` matches these actual
      strings via substring checks rather than the idealized `'kg'`/
      `'liter'`/`'unit'` set a literal reading of the task would imply —
      otherwise the feature would render for ~0 real products. Verified
      against live data: a 250g cheese product at ₪5.87 correctly shows
      "₪2.35 ל-100 גרם". Unrecognized unit types (e.g. `"מטרים"`) show
      nothing rather than a guessed number, per the task's own instruction.
- [x] **Step 5 — Scan/Coupons placeholder views.** Scan: camera+scanner
      icon illustration, "Coming Soon" badge, and a manual barcode entry
      form that calls `/api/products/search` (now barcode-aware, see repo
      structure above) with add-to-basket on tap. Coupons: title/subtitle,
      3 illustrative dashed-border placeholder cards (no real data), and an
      email waitlist form (`handleJoinWaitlist`) that inserts into a
      `waitlist` table — **not yet migrated, see step 7 below**, so this
      insert will fail until `005_waitlist.sql` is applied.
      Mid-session note: this step's code (search-route barcode match +
      page.tsx Scan/Coupons views/state) was committed directly by the user
      as `302bc2f "Route and Page updates"` while a tool call was
      interrupted — same content, just not the usual Co-Authored-By commit
      message from this session.
- [ ] **Step 6 — Profile as bottom sheet.** Not started. Plan: convert the
      drawer from side-slide-in to a bottom sheet, remove `PROFILE` from the
      `View` type/switch, fold the old Profile view's content (avatar/
      nickname, theme+language toggle rows, edit-credentials form, household
      invite block — kept even though not in the task's shorter Step 7 list,
      to avoid silently dropping a shipped feature) directly into the sheet
      alongside Saved Lists/Chat/Price Updates/Community links and sign-out.
- [x] **Step 7 — waitlist migration + deploy.** `supabase/migrations/005_waitlist.sql`
      written this session (see "Phase 12" below for the migration text and why
      it's not applied yet); build/lint/deploy done as part of Phase 12.

## Phase 12 — chain selector dropdown, full-screen map, real barcode scanner
(2026-07-27; the user's own session prompt called this "Phase 9", reusing a
number already used above for the 2026-07-27 mobile-UI-fixes session —
numbered 12 here to stay sequential, same reasoning as the Phase 11 renumber
note above). Covers Phase 11's remaining steps 6-7 (waitlist migration,
deploy) plus new redesign work not in Phase 11's original scope: the chain
selector strip → dropdown, the Location view → full-screen map, and the Scan
view's placeholder → a real live-camera scanner.

- [x] **Chain selector: pill strip → dropdown.** `ChainSelectorStrip` in
      `app/page.tsx` no longer renders a horizontal scrollable pill row.
      Collapsed state: a 48px full-width row (bled to the viewport edge via
      the same `-mx-4 md:-mx-6 lg:-mx-8` trick the header uses) showing up to
      `MAX_SELECTED_CHAINS` (4) colored dots for the current selection —
      dashed-border placeholder circles fill unused slots — plus a
      "בחר רשתות"/"Select chains" label and a `ChevronDown` that rotates on
      open. Expanded state: an absolutely-positioned panel (`z-30`, so it
      layers above the search bar's own `z-20`) listing every row from
      `chains` with a checkmark on selected ones; tapping a row calls the
      same `toggleChainSelection` used previously (unchanged logic: max 4,
      toast on a 5th attempt, at least one stays selected, persisted to
      `localStorage` under `sg_selected_chains`); tapping outside the
      component (a `mousedown` listener, same pattern as the search
      autocomplete) or the collapsed row itself closes it. All downstream
      behavior — `/api/prices/compare`'s `chain_ids` filter, the Location
      map's `visibleBranches` filter — is unchanged, since it all reads from
      the same `selectedChains` state.
- [x] **Home: redundant location row removed.** The button that sat beside
      the search bar and navigated to the Location tab is gone (the bottom
      nav's מיקום/Location tab already does this); the search bar now spans
      the full row width, directly below the chain selector dropdown.
- [x] **Location view: full-screen map.** Redesigned from a rounded map card
      + a scrollable branch-list side panel into an edge-to-edge map that
      fills all space between the header and the bottom nav:
      - A 56px (`h-14`) distance-slider bar, bled full-width the same way as
        the chain selector, now **always visible** regardless of GPS status
        (previously it only showed once `userPosition` was set) — showing
        "טווח: X.X ק״מ"/"Range: X.X km" and the existing 0.5-50km slider.
      - The map itself sits in a `flex-1 min-h-0` sibling below the slider —
        this (plain flexbox, not a `calc(100dvh - ...)` with hardcoded
        pixel constants) is what makes it "fill all remaining space": the
        LOCATION `motion.div` is `flex flex-col`, so the map flex-item
        naturally grows to whatever's left of the viewport once the header,
        slider, and (hidden-for-this-view, see below) footer/bottom-nav
        clearance are accounted for. More robust than a magic-number calc
        since it doesn't need to know the header's exact height.
      - `BranchMapContainer` (`components/BranchMapContainer.tsx`) had its
        entire branch-list side panel deleted — it now renders only the
        full-height map plus the small "current GPS location" badge.
        Branches are still reachable via the (unchanged) Leaflet popups
        (name, basket cost, Waze link) from Phase 2/3.
      - The city-search fallback (shown when GPS is denied) moved from an
        inline row above the map to a compact absolutely-positioned overlay
        in the map's top corner (`top-3 end-3` — logical, not literal
        "top-right", to stay correct in RTL, consistent with how the rest of
        the app positions things).
      - The page footer (`בקרת מפתחים (Locked)`) is now conditionally hidden
        specifically on the LOCATION view (`currentView !== 'LOCATION'`) —
        without this, its ~50-60px would eat into the "fills ALL remaining
        space" map area, since it's a flex sibling that sits after the map
        in the same column.
      - **Bug caught during verification, not anticipated going in:** the
        map's "current GPS location" badge (top-start) and the new
        city-search overlay (top-end) both rendered unconditionally, so on a
        narrow (375px) viewport with GPS denied they visually collided/
        overflowed off-screen. Fixed by only rendering the GPS badge when
        `userPosition` is actually set (`{userPosition && (...)}` in
        `BranchMapContainer`) — the three location states (requesting/
        denied/granted) are mutually exclusive, so exactly one of
        badge/loader/city-search shows at a time now, never two at once.
- [x] **Barcode number in the basket fold-down.** `BasketItem` gained a
      `barcode: string | null` field (threaded through both places a
      `BasketItem` is constructed: `handleAddProduct`'s new-item branch, and
      the login-time basket-rehydration effect's `products` select, which now
      also selects `barcode`). In `BasketRow`'s expanded panel, the price-
      alert bell button and the barcode now share one row
      (`justify-between`): bell stays on its original side, a
      `Barcode`-icon (lucide) + monospace 11px barcode number sits on the
      other, and renders nothing if the product has no barcode.
      `ChainPriceBreakdown`'s prop signature was narrowed from `item:
      BasketItem` to `prices: Record<string, ChainPrice>` in the same pass
      (it only ever read `.prices`) — this is what let the Scan view's
      found-product card reuse it for a `ProductResult` below, without
      needing a fake `quantity` field to satisfy `BasketItem`'s shape.
- [x] **Real barcode scanner.** Installed `@zxing/browser` + `@zxing/library`.
      The Scan view's "Coming Soon" placeholder is replaced by an actual live
      decoder:
      - A `<video>` element (muted, `playsInline`, `autoPlay`) inside a
        `aspect-[3/4]` black rounded box, with a CSS-only scanning overlay
        (four corner-bracket `div`s, no images) and a small accent-colored
        badge icon — shown only while `scanStage === 'scanning'`.
      - `BrowserMultiFormatReader.decodeFromVideoDevice(undefined, videoEl,
        callback)` drives continuous decoding; the callback fires per frame
        with `(result, error)`, and a `hasHandledScanRef` guard makes sure
        only the *first* successful decode in a session is acted on (zxing
        keeps calling back after a match until you call `controls.stop()`).
      - On a match: `navigator.vibrate(100)`, stop the decoder, `scanStage`
        moves `'scanning' → 'looking-up'` (spinner + "מחפש מוצר.../Finding
        product..."), then a single-result `/api/products/search?q=
        {barcode}&limit=1` lookup drives `'found'` (product card, reusing
        `ChainPriceBreakdown`, with "הוסף לסל"/"Add to basket" — calls the
        same `handleAddProduct` as everywhere else, then navigates to HOME —
        and "סרוק שוב"/"Scan again") or `'not-found'` (barcode number shown,
        "Scan again" + "חפש ידנית"/"Search manually" which just pre-fills the
        always-visible manual-entry input below, per spec — it doesn't also
        reset the scan session).
      - **Camera lifecycle** (`useEffect` keyed on `[currentView, scanStage,
        handleLiveScanResult]`): tears the camera down (`controls.stop()`)
        and resets scan state whenever the Scan tab isn't active or the user
        taps "Scan again" (`scanStage` flips back to `'scanning'`, which is
        what re-triggers this effect — deliberately *not* a separate
        `scanSessionKey` counter, since `scanStage` transitioning back to
        `'scanning'` is already a sufficient, simpler trigger). Camera
        permission handling: a `navigator.permissions.query({name:'camera'})`
        pre-check fast-paths straight to the `'denied'` UI state without ever
        calling `getUserMedia` (and thus without a browser permission prompt)
        if it's already known to be denied; otherwise falls through to
        `decodeFromVideoDevice`, whose rejection's `err.name` (
        `NotAllowedError`/`PermissionDeniedError` → `'denied'`, anything else
        including "no camera device" → `'unavailable'`) drives the UI. A
        **hard 8-second `setTimeout` fallback** forces `'unavailable'` if
        neither path has resolved by then — added specifically because
        `getUserMedia` can hang indefinitely rather than reject on some
        devices/browsers with literally no camera hardware, which is exactly
        what this session's own verification environment does (see the
        note below).
      - `cameraStatus === 'denied'`: hides the viewfinder, shows a
        `VideoOff` icon + explanatory copy + a retry button (re-attempts the
        permission negotiation; it cannot deep-link to OS camera settings
        from a web page, so this is a "try again", not a settings shortcut).
        `cameraStatus === 'unavailable'` (no camera device, e.g. desktop):
        hides the viewfinder, shows a `Camera` icon + "use manual entry
        below" copy, nothing else.
      - Manual barcode entry (always visible below the viewfinder,
        pre-existing from Phase 11 step 5) is untouched — it's a fully
        separate code path (`handleScanSearch`, `scanBarcodeInput`/
        `scanResults`) from the live-scan result flow described above.
      - **Verification note:** this session's own Browser-pane testing tool
        runs the tab with `document.hidden === true` / `document
        .visibilityState === 'hidden'` even while actively driving it —
        confirmed directly via `javascript_tool`. This throttles/delays
        Framer Motion's rAF-driven view-transition animations and (observed,
        not fully root-caused) the camera-permission negotiation inside the
        Scan effect, sometimes by 10+ seconds. This is a property of the
        test tool's tab, not the app: a raw, unwrapped `getUserMedia()` call
        injected directly into the same page resolved/rejected normally in
        ~3s regardless. Verified working end-to-end despite the lag: manual
        barcode entry (searched a real seeded barcode, found the product,
        added it to the basket, quantity incremented correctly); the
        `cameraStatus === 'denied'` and `'unavailable'` UI branches (each
        confirmed correct by briefly forcing the initial state and
        reverting — not by completing a real getUserMedia round trip, which
        never resolved fast enough in this specific tool's tab to observe
        directly). Real foregrounded mobile browsers do not exhibit this
        throttling.
      - New dictionary keys (both `he`/`en`): `selectChainsLabel`,
        `scanAddToBasket`, `scanAgain`, `scanManually`, `scanFindingProduct`,
        `scanNotFound`, `scanCameraDeniedMsg`, `scanEnableCamera`,
        `scanNoCameraMsg`. Removed as dead code: `comingSoon` (only prior
        user was the placeholder this step replaced).
- [x] `supabase/migrations/005_waitlist.sql` written (see "Repo structure"
      above for the table shape) — **checked live via PostgREST first**
      (`waitlist?select=id` → `PGRST205`, i.e. genuinely not applied, not
      just assumed) per this repo's established migration-check convention.
      Per this session's own task instructions, migrations are written and
      documented here but **not applied** (no CLI/DB access in this
      environment — same limitation as every prior migration, see "Applying
      migrations" below); paste the file's contents into the Supabase SQL
      Editor by hand before the Coupons view's waitlist signup will work.
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
      Verified in a real browser (desktop 1280×720 and mobile 375×812):
      chain selector dropdown (all 4 chains listed, toggle + persistence +
      dot updates confirmed), Location view fills the screen edge-to-edge on
      375px with no footer/branch-list intruding, basket fold-down shows the
      barcode, and the manual-entry scan-to-basket flow works end-to-end.
      Live-camera happy path (an actual decoded barcode from the physical
      camera) was **not** verified in this session — no camera hardware is
      available in the sandboxed verification environment; the code path
      (video ref → `decodeFromVideoDevice` → `handleLiveScanResult`) is
      standard `@zxing/browser` usage and shares its lookup/add-to-basket
      logic with the already-verified manual-entry path.

## Phase 13 — production bug fixes: scanner gesture, Leaflet flexbox height, chain colors
(2026-07-27; the user's own session prompt called this "Phase 10", already used above for the
2026-07-27 bilingual-auth-error/mobile-keyboard/sticky-header-border session — numbered 13
here to stay sequential, same renumbering reasoning as Phases 11/12 above.) Three issues
reported from real production/device testing on `https://smart-grocery-il.vercel.app`.

- [x] **Scanner: camera never requested permission on a real device.** Root cause matched the
      task's own diagnosis: the live-decode `useEffect` (added Phase 12) auto-started
      `getUserMedia` as soon as the Scan tab mounted and `scanStage` defaulted to `'scanning'`
      — no user gesture at all preceded it, which iOS Safari / Android Chrome silently block
      (they don't even show a permission prompt). Fixed by adding a new `'idle'` stage: `scanStage`
      now **defaults to `'idle'`**, which renders a camera icon + "הפעל מצלמה"/"Start Camera"
      button instead of the viewfinder. The existing camera-acquisition `useEffect` was left
      almost untouched (same permission-check + `decodeFromVideoDevice` body) — the only
      structural change is that it now simply never runs until `scanStage` becomes `'scanning'`,
      which only ever happens via the new `handleStartScan()` handler wired to that button's
      `onClick` (and to the denied-state's "Try again" button, replacing its previous
      `handleScanAgain` wiring so a retry re-requests the camera directly rather than bouncing
      back to the idle button first). `handleScanAgain` (used after a found/not-found result)
      now resets to `'idle'` instead of `'scanning'`, and the tab-away cleanup effect resets to
      `'idle'` too — so leaving and returning to the Scan tab always re-shows the Start Camera
      button rather than auto-restarting. A new `hasCameraSupport` state (checked once on mount
      via `navigator.mediaDevices?.getUserMedia`) hides the button entirely in favor of the
      existing `scanNoCameraMsg` copy on devices with no camera API at all (e.g. plain desktop
      browsers), per the task's explicit ask. New dictionary key: `scanStartCamera` (he/en).
      **Verified end-to-end in a real browser against a production build:** idle state shows
      only the button (confirmed no `getUserMedia` call fires before the tap — no permission
      prompt, no `cameraStatus` change); tapping it visibly triggers the real permission flow
      (this sandboxed test environment has no camera, so it correctly lands on the existing
      `cameraStatus === 'denied'` UI, which is itself proof the call actually fired); navigating
      away to another tab and back to Scan correctly resets to the idle button rather than
      getting stuck in the denied state or auto-restarting. (Real camera hardware / an actual
      granted permission was not available to test in this environment, same limitation noted
      in Phase 12 — the granted-state code path itself was not touched by this fix.)
- [x] **Leaflet map blank in production — root cause was NOT what the task assumed.** The task's
      hypothesis was the classic "Leaflet touches `window`/`document` at import time, SSR
      crashes" bug, and asked for a dynamic import + `ssr:false` + `'use client'` + a manual
      default-marker-icon fix. All of that was checked first and ruled out: `BranchMapContainer`
      already dynamically imports `BranchLeafletMap` with `{ ssr: false }` (Phase 12), both files
      already have `'use client'` where needed, and neither ever used Leaflet's default
      `L.Icon.Default` (every marker — branch pins and the "you are here" pin — uses a custom
      `L.divIcon`), so there was no default-icon/webpack asset path to fix. The **actual** bug,
      found by building for production locally (`npm run build && npm run start`, see gotchas
      below for the harmless `output: standalone` warning that comes with that) and inspecting
      the live DOM: the Location view's map slot (`app/page.tsx`, the `flex-1 min-h-0` div
      wrapping `<BranchMapContainer>`) is a `display:block` flex item — its height comes purely
      from `flex-grow`, not an explicit CSS `height`. `BranchMapContainer`'s own root div used
      `h-full` (a percentage height) against that parent, and — confirmed directly via
      `getComputedStyle`/`getBoundingClientRect` in the running app, including forcing the same
      inline style manually to rule out a missing/purged Tailwind class — that percentage never
      resolves in this configuration; it computes to an effective 0px. Since every one of
      Leaflet's internal panes is `position:absolute` (no in-flow content), the 0px box just
      rendered as nothing. Fix: made the map slot `flex` (`className="flex-1 min-h-0 relative
      -mx-4 md:-mx-6 lg:-mx-8 flex"`) and dropped `h-full` from `BranchMapContainer`'s root div
      (now `"relative w-full flex-1 min-h-0"`) — flex layout assigns the box a real height
      directly instead of going through CSS percentage resolution. See the new gotcha below for
      the general pattern. **Verified:** confirmed broken first (blank map, `.leaflet-container`
      measured at `height: 0px` in a local production build), confirmed the fix live-patched in
      the DOM before touching source, then confirmed the actual source fix renders the map
      correctly (tiles + colored branch pins + zoom control) in a fresh production build AND
      live on `https://smart-grocery-il.vercel.app` after deploying.
- [x] **Chain selector dot colors — already correct, not actually broken.** Queried the live
      `chains` table directly via PostgREST and confirmed `color_hex` already matched the task's
      expected values exactly (`shufersal #e11d48`, `rami_levy #2563eb`, `victory #16a34a`,
      `yohananof #d97706`), and both the collapsed row and the expanded dropdown already read
      `chain.color_hex` straight from that fetched data. Verified visually in a real browser too
      (all four dot colors correct, including green for victory). Since the task explicitly
      asked for a hardcoded fallback for the pre-load window, added `CHAIN_COLOR_FALLBACKS`
      (same four hex values) and wired it into both the collapsed dots and the expanded list as
      a `?? CHAIN_COLOR_FALLBACKS[...]` fallback, and stopped the collapsed row from bailing out
      entirely (`if (chains.length === 0 && selectedChains.length === 0) return null`) so
      persisted `selectedChains` from `localStorage` can render fallback-colored dots even
      before the `chains` fetch resolves. This is defensive/as-requested, not a fix for an
      observed bug.
- [x] Each fix committed separately (`git add -p`-equivalent hunk splitting, since all three
      touched `app/page.tsx`): `fix: barcode scanner explicit start button + cleanup`,
      `fix: leaflet map blank in production (flexbox height, not SSR)`,
      `fix: chain selector dot colors from chain data`. `npx tsc --noEmit`, `npm run lint`
      (pre-existing warnings only, same two files as always — see "Applying migrations"-adjacent
      lint note elsewhere in this doc), and `npm run build` all clean. Pushed to `main` and
      redeployed via `vercel --prod`; the Leaflet fix was re-verified live on
      `https://smart-grocery-il.vercel.app` after deploy (map renders correctly).

## Phase 14 — full catalog expansion + additional chains
(2026-07-27; the user's own session prompt called this "Phase 11", already used above for
the 2026-07-27 UX-overhaul session — numbered 14 here to stay sequential, same renumbering
reasoning as Phases 11/12/13 above.) Data-engineering session: expand the Shufersal catalog
to its full feed, probe every other major chain's price-transparency feed, and integrate
whichever ones actually work.

- [x] **Step 1 — Shufersal full catalog.** `scripts/shufersal-feed.ts` gained
      `fetchShufersalTotalPages()`/`fetchShufersalFileLinksPage(page)` — the branch-file
      listing is paginated (~20 files/page), and the old code only ever fetched page 1.
      `scripts/seed-products-from-feed.ts` now walks every page (22 pages / ~424 files, one
      page = one batch), inserting new products incrementally per page rather than
      collecting everything in memory first, so a mid-run failure doesn't lose progress.
      **Products: 9,738 → 38,346 (28,608 new)**, well past the 5,000 target. One real bug
      caught and fixed along the way: the pagination links are HTML-entity-encoded
      (`&amp;page=`), so a naive `[?&]page=(\d+)` regex silently matched nothing and the
      first attempt only re-processed page 1 — fixed by dropping the anchor requirement.
- [x] **Step 2 — chain feed probes.** `scripts/probe-chain-feeds.ts` (`npm run
      probe:chains`) probes both the URLs given in this session's own task spec (all of
      which turned out to be stale guesses — none resolve or return real data, confirmed
      by actually running the probe, not assumed) and the real current endpoints, found by
      researching the public
      [OpenIsraeliSupermarkets/israeli-supermarket-scarpers](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers)
      project, which already solves this exact problem for every Food-Act-covered chain:
      | Chain | Status | Real access method |
      |---|---|---|
      | Victory | Working | `laibcatalog.co.il` — plain HTTPS JSON API, no auth (`matrixcatalog.co.il`, given in the task spec, is DNS-dead; this is its replacement) |
      | Mahsanei Hashuk | Working | Same `laibcatalog.co.il` API, different `edi`/chain-ID |
      | Yohananof | Working | Real FTP (port 21) to `url.retail.publishedprices.co.il`, username `yohananof`, blank password |
      | Osher Ad | Working | Same FTP host, username `osherad`, blank password |
      | Keshet Teamim | Working | Same FTP host, username `Keshet`, blank password |
      | Mega | Dead | The community scraper marks it "removed" as of 2025-07-01; its domain now redirects to Carrefour Israel (apparent rebrand), which Cloudflare-blocks non-browser requests (403) |
      | Co-op | Dead | `coopisrael.coop` doesn't resolve in DNS at all; not covered by any known scraper project either |

      The FTP-based logins are the platform's actual public, documented access method (see
      the scraper project above) — a chain-specific username with a blank password, not a
      credential bypass. Three of the five working chains need **real outbound FTP, not
      HTTPS** — this works from GitHub Actions (a full Ubuntu VM, already this repo's
      primary ingestion scheduler) and from local runs, but is not reliably available from
      Vercel's serverless functions, so expect those three to fail gracefully (logged to
      `ingest_log`, not blocking the others) if ever triggered through the Vercel
      `GET /api/prices/ingest` cron route instead of `npm run ingest`.
- [x] **Step 3 — parsers for all 5 working chains.** `scripts/parsers/`:
      `gov-xml.ts` (shared Food Act XML parser — every chain here publishes the identical
      `Root>Items>Item>ItemCode/ItemName/ItemPrice/...` schema as Shufersal),
      `laibcatalog.ts` (shared HTTPS client for Victory + Mahsanei Hashuk),
      `cerberus.ts` (shared FTP client, via the new `basic-ftp` dependency, for Yohananof +
      Osher Ad + Keshet Teamim — keeps only the newest price file per store/branch, since
      the server lists every historical snapshot still on disk), and five thin
      `fetchAndParse(): Promise<ParsedProduct[]>` wrappers, one per chain. All five
      integrated into `scripts/ingest-prices.ts` via a shared `ingestFromParser()` helper
      (they all reduce to the same shape, so this avoided five near-duplicates of
      `ingestShufersal()`). Added `osher_ad`, `keshet_teamim`, `mahsanei_hashuk` to
      `public.chains` (`victory`/`yohananof` rows already existed from the original seed
      data, just without a working ingest path until now). Each parser was smoke-tested
      individually against the live feed before integration — sample products actually
      returned: Victory "פיתה ידעאי ציון" ₪1.50, Mahsanei Hashuk "עמלת החזרת צ'ק" ₪26.90,
      Yohananof "קולגייט אופטיק וויט" ₪19.90, Osher Ad "חזה עוף טרי פרימה" ₪39.90, Keshet
      Teamim "אורז בסמטי טאג מאהל" ₪13.90.
- [x] **Step 4 — online/delivery branches.** `supabase/migrations/006_online_branches.sql`
      adds `branches.is_online` plus seed rows for Shufersal Online / Rami Levy Online —
      **written but NOT YET APPLIED** (confirmed live: `branches?select=is_online` returns
      `42703 column does not exist` — no DB CLI access in this environment, same limitation
      as every prior migration, see "Applying migrations" above). The Location view gained
      a "כולל משלוח"/"Include delivery" toggle (persisted to `localStorage`) that shows
      online branches as a fixed truck-icon chip row above the map instead of as map pins
      (they have no lat/lng). Online branches are explicitly excluded from the existing
      GPS/city/map-pin filter pipeline (`filteredBranches`/`visibleBranches`) rather than
      relying on the lat/lng guard alone, so they can never interfere with distance
      filtering or the "navigate to cheapest branch" pre-select — computed as their own
      `liveBranches`-derived memo instead. Degrades safely before the migration is applied:
      `BranchRow.is_online` is optional and the branches query already used `select('*')`
      (not an explicit column list), so nothing breaks — the toggle just always shows zero
      online branches until the migration runs.
      **Verification note:** this session's sandboxed browser tool could not be used to
      visually confirm the Location view / toggle in-browser — clicking the bottom-nav
      Location tab left the view stuck on Home with no console errors, reproduced
      identically on the last commit *before* this session's changes too (confirmed via
      `git stash`), so it's the same Framer-Motion rAF-throttling tab-visibility quirk this
      doc already documented in Phase 12/13 ("this session's own Browser-pane testing tool
      runs the tab with `document.hidden === true`... throttles/delays Framer Motion's
      rAF-driven view-transition animations"), not a regression from this change. Verified
      instead via `npx tsc --noEmit`, `npm run lint`, and `npm run build` (all clean) plus
      careful code review of the filter-pipeline exclusion logic above.
- [x] **Step 5 — ingest workflow.** `npm run ingest` already covers all 7 chains
      automatically once `runIngestion()` grew to include them in Step 3 — no schedule or
      step changes needed for that part.
      [.github/workflows/ingest-prices.yml](.github/workflows/ingest-prices.yml) gained a
      "Print run summary" step logging one line — `Chains ingested: X, Total products: Y,
      New prices: Z` — computed from the latest 7 `ingest_log` rows plus a live `products`
      count.
- [x] **Step 6 — full ingest run, real numbers.** `npm run ingest` end to end:
      ```
      shufersal        fetched=20139   matched=20139   inserted=20139
      rami_levy        fetched=0       matched=0       inserted=0      ERROR: HTTP 404 (unchanged, see "Price ingestion pipeline" above)
      victory          fetched=159037  matched=95650   inserted=95650
      mahsanei_hashuk  fetched=216810  matched=110688  inserted=110688
      yohananof        fetched=549     matched=130     inserted=130
      osher_ad         fetched=399     matched=199     inserted=199
      keshet_teamim    fetched=1167    matched=335     inserted=335
      ```
      **207,102 new price_history rows** inserted across the 5 newly-integrated chains in
      one run. Final state, queried live via PostgREST (not assumed):
      **38,346 products total.** `latest_prices` — **55,474 rows total**, per chain_id:
      ```
      shufersal         38,346
      mahsanei_hashuk    9,073
      victory            7,655
      osher_ad             172
      keshet_teamim        169
      yohananof             41
      rami_levy             18
      ```
      **6 of 7 chains have real price data** (all but rami_levy, whose feed URL still
      404s — unchanged from before this session, see "Price ingestion pipeline" above;
      the 18 existing rami_levy rows predate this session).
- Discovered mid-session, unrelated to the task list but corrected here: a real
  `schema_migrations` table already exists and tracks 001-005 as applied — `005_waitlist`
  is actually **CONFIRMED APPLIED** (this doc previously said NOT YET APPLIED; that was
  stale, not re-verified since Phase 12). See "Applying migrations" above for the full
  correction and how this table works.
- [x] **Step 9 — build and deploy.** `npx tsc --noEmit`, `npm run lint` (pre-existing
      warnings only, same two files as always), and `npm run build` all clean. Pushed to
      `main` and deployed via `vercel --prod`; re-verified live at
      `https://smart-grocery-il.vercel.app` (chain selector dots now reflect the expanded
      7-chain list, basket/price-comparison flow works end to end, no console errors).
- **Not done this session** (correctly withheld — needs `006_online_branches.sql` to
  actually be applied by hand first, see Step 4 above): Step 7's `schema_migrations`
  INSERT for `006_online_branches`. Adding that row before the migration's own DDL has
  run would make the tracking table lie about what's actually applied.

## Phase 15 — branch seeding, saved-lists fixes, chat improvements, Analytics view
(2026-07-28; the user's own session prompt called this "Phase 12", already used above for
the 2026-07-27 chain-selector-dropdown/full-screen-map/barcode-scanner session — numbered 15
here to stay sequential, same renumbering reasoning as Phases 11-14 above.)

- [x] **Step 1 — branch seeding extended to all 6 working chains.** `scripts/
      seed-branches.ts` (previously Shufersal-only, Phase 8) now also pulls branches from
      Victory + Mahsanei Hashuk (laibcatalog.co.il `getbranches?edi=` — returns branch
      `number` + `name`, confirmed live this session: no address/city/lat-lng field exists
      on this endpoint at all) and Yohananof + Osher Ad + Keshet Teamim (the Cerberus FTP
      platform — confirmed live this session that it publishes **no store-metadata feed of
      any kind**: the file listing has only `Price*.gz`/`Promo*.gz`, and a downloaded
      `Price*.gz`'s XML root has only `ChainID`/`SubChainID`/`StoreID`/`BikoretNo`, no
      name/address, matching the same finding Phase 8 made for Shufersal's PriceFull
      files). Those three chains' branches get a synthesized `"<chain name> - סניף
      <StoreID>"` name from the price-file StoreID instead of a real one. Dedup switched
      from the old Shufersal-only client-side `(name_he, address)` check to a real
      PostgREST upsert on a new `(chain_id, external_id)` unique index (migration
      `007_branches_external_id.sql`, see "Repo structure" above) — `external_id` is
      StoreID for Shufersal/Cerberus chains and the laibcatalog branch `number` for
      Victory/Mahsanei Hashuk.
      **Migration not yet applied, so the upsert itself hasn't landed rows yet** — running
      `npm run seed:branches` this session correctly fetched real data from all 6 chains'
      feeds (proving the fetch/parse logic works) but every upsert failed with
      `PGRST204 Could not find the 'external_id' column`, confirming `007` genuinely isn't
      applied (checked live, not assumed). Feed counts observed this session (branches
      found in each chain's live feed, not yet persisted):
      ```
      shufersal          420   (Stores feed, real name+address+city, no lat/lng)
      victory             70   (laibcatalog, real name, no address)
      mahsanei_hashuk     71   (laibcatalog, real name, no address)
      yohananof           19   (Cerberus, synthesized name from StoreID)
      osher_ad            24   (Cerberus, synthesized name from StoreID)
      keshet_teamim        2   (Cerberus, synthesized name from StoreID)
      ```
      **0 of these have lat/lng** — confirmed by downloading a live Shufersal Stores file
      and inspecting its raw XML this session: no `GPSLat`/`GPSLng`/`Latitude`/`Longitude`
      field exists anywhere in it (the task's own instructions asked to check for these).
      Total branches unchanged at 432 until `007` is applied and `npm run seed:branches`
      is re-run — see "Applying migrations" above for the exact SQL to paste.
- [x] **Step 2 — Save List no longer clears the basket.** `handleSaveList` in
      `app/page.tsx` previously deleted the active basket's `basket_items` and cleared
      local `basket` state right after copying it into a new saved-basket row — this was
      flagged as wrong behavior this session and fixed: it now only inserts the new
      `baskets` row (with `is_archived: true`, which the insert never explicitly set
      before, relying only on the column default) and the copied `basket_items` rows, then
      shows a 2.5s auto-dismissing toast (`showToast`, the same helper already used for the
      "max 4 chains" notice) reading "הרשמה נשמרה"/"List saved". Clear List is untouched.
- [x] **Step 3 — saved-list load actually restores the basket.** Root cause, found by
      reading the code rather than assumed: tapping a saved-list card only ran
      `setActiveBasketId(sb.id); setCurrentView('HOME')` — it never read that basket's
      `basket_items` into `basket` state at all, so the Home view kept showing whatever
      the *previous* working basket happened to be (empty, if nothing had been added yet).
      New `handleLoadSavedList` rebuilds full `BasketItem` rows from the saved basket's
      `basket_items` — for rows with a `product_id` it re-fetches the product + latest
      prices (same reconstruction the login-time rehydration effect already does for the
      active basket, factored the same way: current prices, not save-time prices); for
      legacy rows with no `product_id` it falls back to an `ilike` search on
      `product_name`. Shows a "הרשימה נטענה"/"List loaded" toast on completion.
- [x] **Step 4 — delete saved list.** Each `SAVED_LISTS` card gets a `Trash2` icon button
      (top-end corner) wired to a new `deleteConfirmId` state instead of a bare
      `window.confirm` — a styled confirm sheet (same visual pattern as the existing About
      sheet: dark backdrop + centered rounded panel) with a red "מחק"/"Delete" button and a
      neutral "ביטול"/"Cancel" button. Confirming calls `handleDeleteSavedList`, which
      removes the card from `savedBaskets` state immediately (optimistic) and issues
      `DELETE .../baskets?id=eq.<id>&user_id=eq.<uid>` (RLS already scopes this to the
      caller's own rows), then shows a "הרשימה נמחקה"/"List deleted" toast.
- [x] **Step 5 — chat date separators + search.** New `buildChatTimeline()` groups
      `chatMessages` into a flat render list with a centered, non-interactive date pill
      (`formatDateSeparator`: "היום"/"Today", "אתמול"/"Yesterday", else a localized
      `DD/MM/YYYY`) inserted whenever the calendar date changes between consecutive
      messages. A new search icon in the CHAT view header expands a filter input
      (`chatSearchQuery` state) that narrows the visible messages by a case-insensitive
      substring match on `content` and highlights every match inline via a new
      `HighlightMatch` component (wraps matches in `<mark>`); a clear (X) button resets the
      query and un-filters. Purely client-side over the existing local `chatMessages` mock
      state — no new query against the `messages` table (still unwired, see Phase 2 above).
- [x] **Step 6 — Analytics view.** The `PRICE_UPDATES` placeholder (shared with
      `COMMUNITY` since Phase 11) is now a real view: the `View` type value renamed to
      `ANALYTICS` and the dictionary key `navPriceUpdates` renamed to `navAnalytics`
      (displayed label: "אנליטיקס"/"Analytics"). New `AnalyticsView` component, five
      sections, each with its own skeleton loader and empty state:
      - **Savings summary** — total ₪ saved vs. the most expensive chain, across every
        `basket_items` row the signed-in user has ever had (not just the active basket).
      - **Cheapest chain this week** — a recharts horizontal `BarChart` ranking all chains
        by average `latest_prices` price, bars colored by `chain.color_hex`.
      - **Biggest price drops** — top 5 by % drop, comparing each product+chain's latest
        `price_history` snapshot in the last 7 days against its latest snapshot before
        that window.
      - **Most compared products** — top 5 products by how many `basket_items` rows
        reference them across all of the user's baskets, with current min price.
      - **Price trend for a product** — a product-name search (reuses
        `/api/products/search`) followed by a recharts `LineChart`, one line per chain,
        over the last 30 days; shows "אין מספיק היסטוריה עדיין — בדקו שוב מחר"/"Not enough
        history yet — check back tomorrow" when fewer than 2 data points exist for every
        chain (true for most real products right now, since ingestion runs daily and this
        feature only shipped this session — verified this is exactly what renders for a
        freshly-searched product on production).
      Added `recharts` as a real dependency (`package.json` — the task's own instructions
      assumed it was already installed; it wasn't, `npm install recharts` added it).
- [x] **Step 7 — analytics API.** `app/api/analytics/route.ts`, one `GET` handler keyed on
      `?type=`: `savings`, `chain_ranking`, `price_drops`, `top_products`, `price_trend` —
      see "Repo structure" above for what each computes. `supabase/migrations/
      008_analytics_indexes.sql` adds `ph_captured_chain` (`price_history(chain_id,
      captured_at DESC)`) and `bi_product` (`basket_items(product_id)`) — performance only,
      NOT YET APPLIED (same manual-paste limitation as every other migration this session).
      **Bug caught only after the first production deploy, not anticipated going in:**
      `chain_ranking` initially did a plain `.from('latest_prices').select('chain_id,
      price')` with no range — checking the live response immediately after deploying
      showed only 5 of 7 chains with implausible averages; summing every chain's
      `product_count` came to exactly 1000, proving PostgREST's server-side max-rows
      setting (1000 on this project) silently truncates any unranged select regardless of
      an explicit client-side `.limit()` — the `price_drops`/`price_trend` queries had the
      identical latent bug via `.limit(5000)`/`.limit(2000)`, which look larger but get
      capped the same way. Fixed with a `fetchAllPages()` `.range()`-pagination helper
      applied to all three queries; re-verified on production immediately after redeploying
      that `chain_ranking` now returns all 7 chains with `product_count` matching the exact
      totals already documented in "Phase 14" above (mahsanei_hashuk 9073, victory 7655,
      shufersal 38346, etc — small drift on keshet_teamim/osher_ad is just the daily
      scheduled ingest run between sessions, not a bug).
- [x] **Step 8 — migrations.** Two new migrations this session
      (`007_branches_external_id.sql`, `008_analytics_indexes.sql`) plus one correction to
      an existing one — see "Applying migrations" below for full detail and the exact SQL.
      Summary: `006_online_branches.sql` (Phase 14) was re-checked live this session and is
      actually **CONFIRMED APPLIED** (this doc previously said NOT YET APPLIED — stale, same
      pattern as the 005_waitlist correction in Phase 12/14). `007` and `008` are
      genuinely NOT YET APPLIED as of this writing.
- [x] **Step 9 — build and deploy.** `npx tsc --noEmit` (both the root config and
      `scripts/tsconfig.json`), `npm run lint` (pre-existing warnings only, same two files
      as always), and `npm run build` all clean. Pushed to `main` and deployed via
      `vercel --prod` **twice** this session — the first deploy shipped the
      `chain_ranking` 1000-row-cap bug described in Step 7 above (caught by checking the
      live endpoint immediately after deploying, not assumed fixed from local testing
      alone), the second deploy shipped the fix; re-verified live at
      `https://smart-grocery-il.vercel.app/api/analytics?type=chain_ranking` returning all
      7 chains with correct counts after the second deploy. UI verified in a real browser
      (local dev server): saved-list save/load/delete cycle, chat date separators + search
      + highlight, and all 5 Analytics sections (including the product-search-driven price
      trend chart) all confirmed working end-to-end with real data before either deploy.

## Phase 16 — location fix, basket persistence, duplicate-list handling, Analytics overhaul, custom markets
(2026-07-30; the user's own session prompt called this "Phase 13", already used above for the
2026-07-27 production-bug-fix session — numbered 16 here to stay sequential, same renumbering
reasoning as Phases 11-15 above.)

- [x] **Step 1 — Location map showing only ~8 pins, root cause was NOT a query limit.**
      Two real bugs, not one: (1) `app/page.tsx`'s branches fetch (`supabase.from('branches')
      .select('*').eq('is_active', true)`) had no `.range()` pagination, so once branches
      passed 1,000 rows it silently truncated at PostgREST's project-wide max-rows cap — same
      bug class as the Phase 15 analytics fix, just not yet applied to this query. Fixed with
      a `.range()`-paginated loop. (2) **The actual reason only ~8 pins ever showed**: 1,037 of
      1,045 branches — everything seeded from government feeds beyond the original 8 — never
      had `lat`/`lng` at all, because none of those feeds publish coordinates (already
      documented in Phase 8/15 above). Backfilled 830 of them via a new script,
      `scripts/geocode-branch-cities.ts` (`npm run geocode:branches`): resolves each branch's
      numeric settlement code (`city_he`) to a real city name via data.gov.il's official
      "רשימת ישובים בישראל" dataset (CKAN `datastore_search` API), then geocodes each of the
      ~105 unique city names once via Nominatim (OpenStreetMap), respecting its 1 req/sec
      usage policy — caches results in `scripts/.geocode-cache.json` so a re-run doesn't re-hit
      the API. This is **city-center, not address-level** geocoding (multiple branches in the
      same city share one point) — a deliberate tradeoff, since address-level geocoding of
      ~1,000 rows against Nominatim's public instance isn't practical or policy-compliant.
      **838/1,045 branches now have coordinates** (up from 8); the remaining 207 (no city code
      in their feed at all, or a code with no name in the settlements dataset — mostly the
      Cerberus-FTP-chain branches, see Phase 15) are surfaced as a plain "סניפים ללא מיקום
      מדויק"/"branches without exact location" count above the map instead of silently
      vanishing, computed alongside the existing distance/city/chain filter pipeline. The
      existing Haversine implementation (`haversineKm` in `page.tsx`) was already correct and
      untouched. **Verified: 203 branches within 10km of Tel Aviv** (direct calculation
      against live data, well past the 100+ target) and confirmed visually in a real browser.
- [x] **Step 2 — Basket persistence on refresh.** The client-side rehydration effect already
      existed (`app/page.tsx`, the "Basket load on login" effect) and, per this session's own
      testing, already worked correctly — a hard reload, including immediately after adding an
      item, always restored the basket. Per the task's specific ask, moved the products +
      latest_prices lookup into a new endpoint,
      [app/api/baskets/[id]/items/route.ts](app/api/baskets/[id]/items/route.ts)
      (`GET /api/baskets/{basketId}/items?user_id=<uid>`), so the client does one fetch instead
      of two; the route uses the service-role client and verifies the basket belongs to the
      requesting `user_id` itself, since service-role bypasses RLS. **Real bug found along the
      way**: `basket_items.product_id` has no actual FK constraint to `products.id` in the live
      schema (confirmed via a live `PGRST200` on an embedded PostgREST select) — despite being
      used as one semantically everywhere else in this codebase. Fixed by having the route run
      the products + latest_prices queries in parallel and merge in JS, same pattern the old
      client-side code already used, rather than a single embedded select. Shows a "הסל שלך
      שוחזר"/"Your basket restored" toast when a non-empty basket is restored.
- [x] **Step 3 — Duplicate saved-list name handling.** `handleSaveList` now checks for an
      existing `is_archived=true` basket with the exact same name for the user before
      inserting; if found, a styled confirm sheet (same visual pattern as the existing
      delete-list confirmation) offers **Replace** (deletes and re-inserts that basket's items,
      touches `updated_at`) / **Save as new** (the original insert-a-new-row behavior) /
      **Cancel** (re-opens the name prompt). Verified against the live DB: replacing left
      exactly one basket row with that name and its items correctly swapped, not duplicated.
- [x] **Step 4/6 — Analytics view redesign + API.** Replaced the old 5 sections (savings
      summary / chain ranking / price drops / most-compared products / price trend) with the
      new spec — see [app/api/analytics/route.ts](app/api/analytics/route.ts) and the
      `AnalyticsView` component in `app/page.tsx`:
      - **A — Spending overview**: weekly average + this-month total always visible
        (`?type=spending_overview`), computed from every `basket_items` row across all of a
        user's baskets, priced at each product's **cheapest chain** (there's no "price
        actually paid" data in this app — every basket is a planned purchase, not a receipt).
        Each basket's `created_at` stands in for a "trip" date, since there's no separate
        purchase timestamp. Expands to a 6-month total/avg-per-week/trips table, an annual
        projection (monthly average × 12), and annual total to date. Returns
        `not_enough_data: true` when the user's earliest basket is under 7 days old. Adds a
        local-markets spending line once any custom market has a logged expense.
      - **B — Cheapest chain**: kept the existing global-average bar chart, added a
        "עבורך"/"For you" (personal, default tab) vs "כללי"/"General" toggle.
        `?type=personal_chain_ranking` computes **total cost of the user's own historical
        basket_items** per chain (not an average price) — answers "which chain would've been
        cheapest for what you actually buy", a genuinely different question from the general
        ranking.
      - **C — Monthly basket summary**: `?type=monthly_basket&month=YYYY-MM` (defaults to the
        current month) — unique products + total quantities across all baskets created that
        month, grouped by category (new `CATEGORY_LABELS` map: dairy/bread/meat/beverage/
        produce/other) when expanded, with a clipboard-export button (plain-text bullet list,
        `navigator.clipboard.writeText`).
      - **D — Custom markets** (new feature, see migration below): add a market (name only),
        log expenses against it (amount/date/note), see the last 5 entries with tap-to-delete.
        Written **directly from the client** via the anon key (`supabase.from('custom_markets')
        ...`), same RLS-gated pattern already used for baskets/basket_items/price_alerts
        elsewhere in this app — there's no service-role write route for it, only the
        `?type=custom_markets` read endpoint. Degrades to an empty list (not a 500) on
        `PGRST205` if migration 009 hasn't been applied yet, same pattern as `is_online`
        (migration 006) before it landed — **verified live this session**, since 009 is
        genuinely not applied (see below): the add-market form opens and submits without any
        console error, just silently doesn't persist.
      - **E — Price trend**: unchanged, per the task's own instruction.
      - The old `PriceDropEntry`/`TopProductEntry` frontend types and their UI sections were
        removed as fully unused after this replacement. Their backend `case 'price_drops'`/
        `case 'top_products'` handlers in the analytics route were deliberately **left in
        place** rather than deleted — removing previously-shipped, working backend logic
        wasn't asked for, even though nothing calls it anymore.
      - Verified end-to-end in a real browser: spending overview expand shows real 6-month
        numbers and a correct annual projection; monthly basket expand shows category-grouped
        items with a working export (no console errors); personal/general ranking tabs both
        render; custom markets add-market form behaves exactly as designed pending the
        migration.
- [x] **Step 5 — `supabase/migrations/009_custom_markets.sql` written**, not yet applied (same
      no-DB-CLI-access limitation as every prior migration — confirmed live via PostgREST
      before writing any code against it, per this repo's established convention). Paste into
      the Supabase Dashboard SQL Editor before the Custom Markets feature will actually persist
      data — the app already degrades gracefully without it (see Step 4/6 above).
- [x] **Step 7 — build and deploy.** `npx tsc --noEmit` (both the root config and
      `scripts/tsconfig.json`), `npm run lint` (pre-existing warnings only, same two files as
      always), and `npm run build` all clean. See "Applying migrations" below for `009`'s
      status.

## Phase 17 — Rami Levy feed, address-level geocoding, basket view modes
(2026-08-04; the user's own session prompt called this "Phase 15", already used above for the
2026-07-28 branch-seeding/saved-lists/chat/Analytics-view session — numbered 17 here to stay
sequential, same renumbering reasoning as every prior phase-number collision in this doc.)

- [x] **Step 1 — Rami Levy feed: FIXED, real prices now flowing.** Research-first, per this
      session's own instructions: none of the previously-tried or newly-suggested URL guesses
      worked (`url.rami-levy.co.il/api/delivery/prices` — DNS dead; `prices.rami-levy.co.il` —
      DNS dead; `www.rami-levy.co.il/api/big/2` and `/api/delivery/prices?storeId=...` — all
      resolve but return the site's own Nuxt.js 404 SPA page, HTTP 404; the S3/GCS bucket
      guesses — no such bucket; `matrixcatalog.co.il` — DNS dead, matching the Phase 11 finding
      that it's gone entirely, not Victory-specific). The `OpenIsraeliSupermarkets/
      israeli-supermarket-scarpers` GitHub repo confirms Rami Levy is a supported chain
      (`RAMI_LEVY = all_scrappers.RamiLevy` in `scrappers_factory.py`) but its source doesn't
      expose the URL directly from what's fetchable. The actual answer came from a web search
      that surfaced Rami Levy's own price-transparency page,
      [rami-levy.co.il/he/price-transparency](https://www.rami-levy.co.il/he/price-transparency),
      which links to `https://url.retail.publishedprices.co.il/login` with username `RamiLevi`
      and no password — **the same Cerberus FTP Server platform already integrated for
      Yohananof/Osher Ad/Keshet Teamim** (see `scripts/parsers/cerberus.ts`, Phase 11), not a
      new integration at all. Confirmed live via a direct FTP login + file download + gunzip:
      real `Price7290058140886-*.gz` files, same `Root>Items>Item>ItemCode/ItemName/ItemPrice/
      UnitOfMeasure` schema as every other Cerberus/gov-XML chain.
      `scripts/parsers/rami-levy.ts` is a 5-line wrapper — `fetchCerberusItems('RamiLevi',
      STORE_LIMIT)` — identical in shape to `yohananof.ts`. Wired into
      `scripts/ingest-prices.ts`: the old JSON-based `ingestRamiLevy()`/`extractRamiLevyItems()`
      functions (which never worked — see "Price ingestion pipeline" above for what they used to
      attempt) were deleted outright rather than left as dead code, and `rami_levy` now runs
      through the same `ingestFromParser()` helper as the other five gov-XML chains.
      **`npm run ingest` end-to-end result this session:** `rami_levy fetched=17835
      matched=9787 inserted=9787` — real product names/prices (e.g. a real 250g cottage cheese
      at ₪29.90 was seen in the raw feed dump during verification). `latest_prices` now has
      **3,446 distinct Rami Levy products** (up from the 18 placeholder rows that predated any
      real feed). **All 6 working chains now have a real ingest path** — Rami Levy was the last
      one still blocked; only Mega and Co-op remain permanently dead (see Phase 14's probe
      table above, unchanged). Rami Levy branches were NOT re-seeded this session (out of this
      session's scope) — the 4 original Gush-Dan-area seed branches are still what's in
      `branches` for `chain_id=rami_levy`; extending `scripts/seed-branches.ts` to pull real
      Rami Levy branches from the same Cerberus platform (no store-metadata feed there either,
      same synthesized-name pattern as Yohananof/Osher Ad/Keshet Teamim) is a natural follow-up
      but wasn't asked for here.
- [x] **Step 2 — address-level geocoding pass.** New `scripts/geocode-branches.ts` (distinct
      from Phase 16's `geocode-branch-cities.ts`, which does city-CENTER geocoding from a
      settlement code for branches with no address at all) — this one only touches branches
      where `address IS NOT NULL AND lat IS NULL`, geocoding the real street address via
      Nominatim rather than approximating from a city. Checked live before writing any code:
      only **10 branches** qualified (`lat=is.null&address=not.is.null` → `content-range:
      0-0/10`) — nearly every address-having branch (overwhelmingly Shufersal) already got
      coordinates from Phase 8's original seed or Phase 16's city-center backfill; this pass
      only catches the remainder. Result: **6 of 10 geocoded, 4 had no Nominatim match**
      (likely addresses too sparse/non-standard for Nominatim's free-text matching — not
      investigated further, out of scope for a 4-row edge case). **Branch coordinate coverage:
      838 → 844 of 1,045 total** (80.8%). Added as `npm run geocode:branches:address` rather
      than overwriting the existing `geocode:branches` script name (which already points at
      `geocode-branch-cities.ts`) — reusing that name would have silently broken the Phase 16
      script's own npm entry point, an unrequested breaking change.
- [x] **Step 3 — basket view modes (Smart / Chain / Compare).** New segmented control
      (`BasketModeSelector`, `app/page.tsx`) directly above the basket list, persisted to
      `localStorage` under `sg_basket_mode`. All three modes read from the `prices` map every
      `BasketItem` already carries (populated when the item was added) — no new API call for
      modes 2/3, per the task's own instruction.
      - **Smart** (default): completely unchanged from before this phase — existing `BasketRow`
        + comparison panel.
      - **Chain**: new `SingleChainBasketRow` + a `ChainPicker` (`<select>`, options limited to
        `selectedChains` — the chain-selector-strip picks, not every chain in the DB) shown
        below the mode selector. Each row prices the item at only the picked chain; unavailable
        shows "לא זמין"/"N/A" + a muted `AlertCircle` icon instead of falling back to another
        chain's price (a real bug risk here: reusing the existing `basketTotal(chainId)` helper
        would have silently substituted `min_price` for unavailable items, which is exactly the
        wrong behavior the task asked to avoid — so this mode uses a new `chainOnlyTotal()`
        helper that only sums chains where the item actually has a price). The comparison panel
        is hidden; a single line below the list reads "סה״כ ב[chain]: ₪XXX"/"Total at [chain]:
        ₪XXX" instead.
      - **Compare**: new `CompareChainBasketRow`, two `ChainPicker`s side by side. Each row is a
        compact `[name] [chain A price] [chain B price] [qty]` layout — cheaper price green,
        pricier red, equal/either-unavailable neutral, "—" for unavailable, matching the task
        spec exactly. **No visible delete button** (per spec) — a 600ms long-press (via
        `onPointerDown`/`onPointerUp`/`onPointerLeave` + a `setTimeout`, works for both mouse and
        touch) reveals a small floating × in the row's corner; tapping anywhere else (a
        `mousedown` document listener, same pattern as `ChainSelectorStrip`'s outside-click
        close) dismisses it again. Below the list: two totals side by side (cheaper one
        green-highlighted) + a "חיסכון: ₪XX עם [chain]"/"Savings: ₪XX with [chain]" line, hidden
        when the two totals are equal.
      - **Chain/compare picker defaults**: cheapest (then 2nd-cheapest) chain from the current
        `/api/prices/compare` result, restricted to `selectedChains` — re-derived automatically
        whenever the existing pick becomes invalid (its chain got deselected in the chain
        selector strip) or the comparison result changes, but never overrides a still-valid
        user choice. Only the *mode* itself persists to `localStorage`, not the specific chain
        picks — matches the task's literal ask ("Save selected mode to localStorage key:
        sg_basket_mode") and re-derives sensible defaults fresh each session instead.
      - **RTL note**: the two Compare-mode pickers/columns are rendered in DOM order
        `[chain A, chain B]` using plain flex (no explicit `flex-row-reverse`), which — like
        every other multi-item row in this codebase (see the chain-selector-strip dots, e.g.) —
        places the first DOM item on the visual *right* in Hebrew's RTL layout and the visual
        *left* in English's LTR layout. This is a deliberate, existing-convention choice
        (logical "first slot" rather than literal "left") rather than a literal implementation
        of the task's "left picker / right picker" wording, which was written without
        RTL/bilingual layout in mind.
      - Verified in a real browser (dev server), both Hebrew/RTL and English/LTR: all three
        modes render and switch correctly; Chain mode's N/A state and total line verified
        against real mixed-availability basket data; Compare mode's per-item green/red
        highlighting, "—" for unavailable, and the two-totals-plus-savings line all verified
        against real numbers (a live example: ₪5.87 Mahsanei Hashuk vs ₪5.90 Rami Levy → "חיסכון:
        ₪0.03 עם מחסני השוק"); mode persists correctly across a full page reload, and picker
        defaults correctly re-derive from a fresh comparison result after reload rather than
        reusing a stale pre-reload pick. Long-press-to-delete was verified by code review (the
        `computer` tool used for this session's browser verification can't hold a press for
        600ms) rather than an interactive click.
- [x] **Step 4 — this doc.** Rami Levy status, the new geocoding script, and the basket view
      modes all documented above; branch coordinate coverage updated (838 → 844 of 1,045).
- [x] **Step 5 — build and deploy.** `npx tsc --noEmit` and `npm run build` both clean.

## Coding conventions
- All components: functional, TypeScript strict
- API routes: always use `lib/supabaseServer.ts` (service role), never the anon client
- Tailwind only for styling — no inline style except CSS variable overrides
- Hebrew is the primary language; English is secondary
- Minimum touch target: 44×44px on all interactive elements
- `@/*` path alias resolves to project root

## How to run
```bash
npm run dev            # Start dev server on localhost:3000
npm run build          # Production build
npm run lint           # ESLint check
npm run env:link       # Restore .env.local from ~/.config/smartgrocery/.env.local
npm run ingest         # Run the price ingestion pipeline (see "Price ingestion pipeline")
npm run seed:products  # Seed real products + prices from the Shufersal feed (Phase 5/8)
npm run seed:branches  # Seed real branches from the Shufersal Stores feed (Phase 8)
npm run enrich:names   # Translate name_he -> name_en via claude-haiku-4-5 (needs ANTHROPIC_API_KEY)
npm run probe:chains   # Probe candidate chain feed URLs, report status per chain (Phase 11)
npm run geocode:branches # Backfill city-center lat/lng for branches missing coordinates (Phase 16)
npm run geocode:branches:address # Backfill address-level lat/lng for branches with an address (Phase 17)
```

## How to reset the database
`supabase/schema.sql` is stale and does NOT reproduce the full live schema (see
"Repo structure" above) — running it alone will not recreate products, chains,
branches, price_history, or latest_prices. Until a current dump/migration
exists, reset via the Supabase Dashboard SQL Editor using the live schema as
reference, then refresh the materialized view:
```sql
SELECT refresh_latest_prices();
```

## Applying migrations
There is no `supabase` CLI or direct Postgres connection configured for this
repo (no `SUPABASE_DB_URL`, no linked project) — `supabase/migrations/*.sql`
files are written here but must be pasted into the Supabase Dashboard SQL
Editor by hand to actually take effect. **As of 2026-07-19 (Phase 5),
`002_price_alerts.sql`, `003_household_invite.sql`, and `004_ingest_log.sql`
are all confirmed applied** — checked directly against PostgREST with the
service-role key (see the "To check whether a migration has actually been
applied" gotcha below): `households?select=id,invite_code` and
`price_alerts?select=id` / `ingest_log?select=id` all return `200 []` (not
PGRST205), and `rpc/join_household_by_code` returns a real `P0001 "Invalid
invite code"` application error rather than PGRST202 — i.e. the function
exists and runs. The corresponding app features (price alert bell, household
invite/join, `scripts/ingest-prices.ts` writing its summary row) should all
work end-to-end now. If a future session sees PGRST205/PGRST202 again, treat
it as a regression (e.g. a project reset), not the original unapplied state.

**Phase 11 correction:** `005_waitlist.sql` — previously documented above as
NOT YET APPLIED — is actually **CONFIRMED APPLIED** (`waitlist?select=id`
returns `200 []`, and a `schema_migrations` row exists with
`applied_at: 2026-07-27T12:56:47`, the same day as this session but evidently
before it started). This doc just hadn't been updated to reflect it — a
reminder that "NOT YET APPLIED" in this file is a snapshot, not a live fact;
re-check via PostgREST before trusting it. Also discovered this session: a
real `schema_migrations` table exists (see "Database schema" above) tracking
001-005 as applied. `006_online_branches.sql` (Phase 11) is written but its
`ALTER TABLE`/seed-data statements are genuinely NOT YET APPLIED (confirmed:
`branches?select=is_online` returns `42703 column does not exist`) — do not
add a `schema_migrations` row for it until that's actually run by hand.

**Phase 15 correction:** `006_online_branches.sql` — previously documented
directly above as NOT YET APPLIED — is actually **CONFIRMED APPLIED**
(`branches?select=is_online` now returns `200` with real `false` values, not
`42703`, and `schema_migrations` has a `006_online_branches` row with
`applied_at: 2026-07-27T21:08:05`). Same lesson as the 005_waitlist
correction above: this file's "NOT YET APPLIED" notes are snapshots that go
stale the moment someone pastes the SQL into the Dashboard by hand outside of
a session — always re-check via PostgREST rather than trusting this doc.
`007_branches_external_id.sql` and `008_analytics_indexes.sql` (both Phase
15, see below) are genuinely NOT YET APPLIED as of this writing (confirmed:
`branches?select=external_id` returns `42703 column does not exist`) — paste
both into the Supabase Dashboard SQL Editor before `npm run seed:branches`
or the analytics indexes take effect.

**Phase 16 correction:** `007_branches_external_id.sql` — previously
documented directly above as NOT YET APPLIED — is actually **CONFIRMED
APPLIED** (`branches?select=external_id` now returns `200` with real values,
not `42703`). Same lesson as every prior correction in this section: re-check
via PostgREST, don't trust this doc's snapshot. `008_analytics_indexes.sql`'s
status wasn't re-checked this session (it only adds indexes, no new columns
to probe via a simple PostgREST select — there's no cheap way to verify it
live short of an actual slow-query comparison). `009_custom_markets.sql`
(Phase 16, see above) is a new migration this session and is genuinely NOT
YET APPLIED (confirmed: `custom_markets?select=id` returns `PGRST205`) —
paste it into the Supabase Dashboard SQL Editor before the Custom Markets
analytics section will persist any data.

## Scheduling the ingestion pipeline
**Option A is now wired up (Phase 6, 2026-07-21)** —
[.github/workflows/ingest-prices.yml](.github/workflows/ingest-prices.yml)
runs `npm run ingest` daily. Options B/C remain documentation-only, listed
below for context on alternatives that were considered.

**Option A — GitHub Actions scheduled workflow (free, recommended). ACTIVE.**
[.github/workflows/ingest-prices.yml](.github/workflows/ingest-prices.yml)
triggers on `schedule: cron: '0 3 * * *'` (03:00 UTC ≈ 05:00–06:00 Israel
time depending on DST) and on manual `workflow_dispatch`. Runs on
`ubuntu-latest` with Node 22, `npm ci`, then `npm run ingest` with
`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` read from **GitHub
Actions secrets** — these must be added manually under repo Settings →
Secrets and variables → Actions before the workflow can succeed (see
"GitHub Actions secrets" below). A final step queries `ingest_log` (latest 5
rows) and pretty-prints it to the Actions log regardless of whether the
ingest step succeeded (`if: always()`), so a run's outcome is visible without
opening the Supabase dashboard. Failure notification relies on GitHub's
default behavior of emailing the repo owner/watchers on a failed scheduled
workflow run (Settings → Notifications → Actions) — no separate notification
step was added; if that account-level setting is off, failures won't email
anyone.

### GitHub Actions secrets
Add these under **Settings → Secrets and variables → Actions → New repository
secret** (values are the same as `.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL       # e.g. https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY      # service-role key — do not confuse with the anon key
```
Not yet added as of this writing — the workflow will fail on its first
scheduled/manual run until both are set.

**Option B — Supabase Edge Function with `pg_cron`.** Port the ingestion logic
(or at minimum the `refresh_latest_prices()` call) into a Supabase Edge
Function, then schedule it with the `pg_cron` extension via a
`cron.schedule(...)` SQL call in the Dashboard SQL Editor. Keeps everything
inside Supabase with no external CI dependency, but means maintaining a second
copy of the fetch/parse logic in Deno (Edge Functions don't run the Node
`ts-node` script as-is) — more setup cost than Option A for this repo's
current single-script shape.

**Option C — Vercel Cron (when this app is deployed to Vercel).** A
`vercel.json` `crons` entry hitting a dedicated API route (e.g.
`/api/cron/ingest`) that runs the ingestion logic in-process, authenticated via
Vercel's automatic `Authorization: Bearer $CRON_SECRET` header check. Only
applicable once the app has a real Vercel deployment target; until then this
is aspirational.

For now, Option A is the recommended path if/when scheduling this for real —
lowest setup cost, no new infrastructure, and the repo is already on GitHub.

## Known issues / gotchas
- `overflow-x-hidden` on an ancestor silently breaks `position: sticky` on a
  descendant. Per the CSS overflow spec, setting `overflow-x` to anything
  other than `visible`/`clip` forces the browser to compute `overflow-y` as
  `auto` on that same element if it was `visible` — turning it into a scroll
  container. Since that container (the `page.tsx` root div, `min-h-screen`,
  no fixed height) never actually needs its own scrollbar and just grows to
  fit its content, the *real* scrolling happens on `body`/`html` — but any
  `position: sticky` descendant (the main-app `<header>`) is now scoped to
  the div as its containing block instead of the real scroll, so it never
  "sticks" and just scrolls away with everything else. Fix: use
  `overflow-x-clip` instead of `overflow-x-hidden` — `clip` is excluded from
  that auto-coupling rule, so it blocks horizontal overflow without hijacking
  sticky elsewhere in the tree. Found/fixed in Phase 9 (2026-07-27) on the
  page-root wrapper in `app/page.tsx`; if `overflow-x-hidden` gets
  reintroduced anywhere above a `sticky` element, expect the same bug.
- latest_prices is a materialized view — after any price_history insert, call refresh_latest_prices()
- SUPABASE_SERVICE_ROLE_KEY must be in .env.local (not just the anon key) for API routes to work
- Next.js does NOT follow symlinks for .env.local — always write the file directly
- The `households` RLS policy must be defined AFTER `household_members` table exists
- Tailwind 4 uses @tailwindcss/postcss — do not add a tailwind.config.js, it's not needed
- motion is imported from 'motion/react', not 'framer-motion'
- Leaflet needs `window`/`document` at import time — `BranchLeafletMap` is loaded via
  `next/dynamic(..., { ssr: false })` from `BranchMapContainer`; don't import react-leaflet
  directly into a component that can render server-side
- **A `h-full` (percentage height) child of a `display:block` element whose OWN height comes
  purely from `flex-grow` does not reliably resolve — it can compute to `auto`/0px even
  though the parent has a real, definite pixel height.** This caused the Location map to
  render as a blank area in production (Phase 13, 2026-07-27) — it looked exactly like the
  classic "Leaflet + SSR" bug (and the dynamic-import/`ssr:false` setup described above was
  double-checked and was NOT the cause), but was actually this pure CSS issue: Leaflet's own
  panes are all `position:absolute`, so once the percentage height fails to resolve there's no
  in-flow content to give the box an auto height, and it collapses to 0px. Confirmed by
  live-patching the DOM in a production build: forcing the parent to `display:flex` and
  removing the child's `h-full` (so flex stretch sizes it instead of a percentage) fixed it
  immediately. Fix: make the parent a flex container and drop the percentage height on the
  child — see `BranchMapContainer.tsx`'s root div and its parent in `app/page.tsx` (LOCATION
  view's map slot). If a similar "block child needs to fill a flex-grown ancestor" pattern
  shows up elsewhere and renders blank/collapsed, suspect this same issue before assuming it's
  an SSR/hydration/library bug — verify with `getComputedStyle(el).height` on the actual
  child, not just its parent
- `npm run start` prints `"next start" does not work with "output: standalone" configuration.
  Use "node .next/standalone/server.js" instead` — this is just a warning, not a hard failure;
  the server still starts and serves the built app fine, so it's a valid quick way to smoke-test
  a production build locally (as used in Phase 13) without needing the standalone server entry
  point. Vercel's own deploy pipeline doesn't go through `next start` at all, so this warning is
  irrelevant to the real production deployment
- If you edit a hook's dependency array while the dev server is running, Fast Refresh can
  throw a spurious "final argument passed to useEffect changed size between renders" error.
  It's not a real bug — restart the dev server (or hard-reload) and it clears
- Ad-hoc debug scripts (`node -e "..."` using @supabase/supabase-js) fail with a
  WebSocket error on Node 20 because realtime-js needs a native WebSocket (Node 22+).
  Either upgrade Node for scripting, or just hit the REST endpoints directly with
  `fetch(...)` + the service-role key instead of instantiating a full client
- The slide-in nav drawer's open/close spring animation (`isDrawerOpen`, damping 25/
  stiffness 200) is slow to settle — automated clicks on drawer items can silently
  land on stale coordinates mid-animation. A 3-4s wait is sometimes not enough (seen
  it still visibly sliding at 6s in one session); always take a fresh screenshot
  right before clicking to confirm it's fully settled, don't just wait-and-click
  blind, and prefer clicking by ref from a read_page taken after that screenshot
  rather than a coordinate computed earlier. Note this isn't a bug to chase:
  every `DrawerItem` calls `close()` (sets `isDrawerOpen` false) in the same
  onClick that navigates, so the drawer disappearing immediately after you
  click a nav item is the intended UX, not evidence the click failed — check
  `currentView` (or what rendered) before concluding a click didn't register
- `npm run lint` and `npx tsc --noEmit` are both clean as of the lint cleanup
  pass — if either starts failing, it's a real regression, not a known
  pre-existing tooling issue. Note: the root `tsconfig.json` (and therefore
  `npx tsc --noEmit`/`npm run lint`) does type-check/lint everything under
  `scripts/` too, even though those files are actually *run* via `ts-node
  --project scripts/tsconfig.json` (different module resolution) — check both
  `npx tsc --noEmit` and `npx tsc --project scripts/tsconfig.json --noEmit`
  after editing a script, they can disagree
- Phase 5 added `scripts/supabase-rest.ts` and `scripts/shufersal-feed.ts` as
  shared modules — `ingest-prices.ts` and `seed-products-from-feed.ts` both
  import from them rather than duplicating the env-loading/REST/Shufersal-feed
  logic. If you touch the Shufersal fetch/parse logic, both scripts are
  affected
- To check whether a `supabase/migrations/*.sql` file has actually been applied,
  don't guess from the code — hit PostgREST directly with the service-role key
  from `.env.local`: `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=id&limit=1"
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer
  $SUPABASE_SERVICE_ROLE_KEY"`. A `PGRST205` (table) or `PGRST202`/`42703` (function/
  column) response means it's not applied yet; 200 means it is. Faster and more
  reliable than logging in through the UI, and works from Bash (`set -a && source
  .env.local && set +a`) without hitting the Node 20 WebSocket issue below
- The dev server's `.next` cache can get into a bad state after enough hot-reloads in
  one session — API routes start throwing `ENOENT ... .next/server/app/api/.../route.js`
  (500s) even though the route compiles fine. Fix: stop the server, `rm -rf .next`,
  restart — don't chase it as an app bug
- To verify a Supabase RPC/table is wired correctly without going through the UI (e.g. when
  navigation is being flaky, or before a migration has been applied): read the session token
  from `localStorage["sb-<project-ref>-auth-token"].access_token` and POST directly to
  `https://<project-ref>.supabase.co/rest/v1/rpc/<fn>` with `apikey`/`Authorization` headers
  set from the anon key + that token. A `PGRST202`/`PGRST205` response confirms the call
  reached PostgREST with the right function/table name and params — it's just missing the
  migration — as opposed to a bug in the client code

## Phase 6 — Deployment (in progress, 2026-07-21)

### Production URL
**`https://smart-grocery-il.vercel.app`** — live as of Phase 8 (2026-07-21,
first `vercel --prod` run). The project was already linked (`.vercel/` present,
`vercel whoami` already authenticated) so deployment was a single command; no
manual Vercel dashboard setup was needed this session beyond what's described
below (already done previously).

### Vercel deployment steps
`vercel --prod` was actually run for the first time in Phase 8 (2026-07-21,
see below) — the steps below were done manually in an earlier session and are
kept here for reference:
1. `npm i -g vercel` (if not already installed)
2. `vercel --prod` from the repo root, follow the prompts to link/create the
   project
3. In the Vercel project dashboard (Settings → Environment Variables), add
   every variable from `.env.local`, plus `CRON_SECRET` (see below):
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   RESEND_API_KEY
   CRON_SECRET
   ```
   (`RESEND_API_KEY` isn't read by app code — see "Custom SMTP" above — but
   keep it there for parity/reference with `.env.local`. `CRON_SECRET` can be
   any random string, e.g. `openssl rand -hex 32`.)
4. Settings → General → Node.js Version → set to **22.x** (the ingestion
   script and its Node-20-WebSocket workarounds are irrelevant to the Next.js
   app itself, but Vercel's default may lag; pin it explicitly)
5. [vercel.json](vercel.json) is already in the repo root with
   `framework`/`buildCommand`/`devCommand`/`installCommand` plus a `crons`
   entry pointing at `/api/prices/ingest` — see below for what that route
   actually does now.

### `/api/prices/ingest` — real GET cron handler (Phase 6, 2026-07-21)
`app/api/prices/ingest/route.ts` originally only had the pre-Phase-4 `POST`
webhook stub (writes single-product payloads to the stale `price_snapshots`
table — kept working, unchanged, still dead/unused by the frontend). Added a
`GET` handler alongside it that runs the real ingestion pipeline in-process:

- Calls `runIngestion()`, newly exported from `scripts/ingest-prices.ts`
  (the Shufersal/Rami-Levy fetch + match + insert logic, shared with the CLI
  — see below). Returns `{ results: [{ chain, fetched, matched, inserted,
  error }, ...] }`.
- Auth: requires a `CRON_SECRET` env var to be set, and accepts either
  `x-cron-secret: <CRON_SECRET>` **or** `Authorization: Bearer
  <CRON_SECRET>` — checked in `isAuthorizedCronRequest()` in the route file.
  Two schedulers hit this route with two different header conventions:
  Vercel Cron auto-injects `Authorization: Bearer <CRON_SECRET>` on requests
  it triggers itself (no way to configure a custom header name for that), while
  a manual/GitHub-Actions-style caller would use `x-cron-secret`. Accepting
  both means the literal `x-cron-secret` contract holds *and* Vercel's own
  cron mechanism actually works, rather than 401-ing itself. Missing
  `CRON_SECRET` env var → always 401 (fails closed).

**`scripts/ingest-prices.ts` refactor:** the module no longer auto-runs or
calls `process.exit`/`requireEnv()` at import time — those were moved to a
new `scripts/run-ingest-cli.ts`, now the actual `npm run ingest` target
(`package.json` updated). Reason: `ingest-prices.ts` is now imported by the
Next.js route above, and a `process.exit()` reached via that import path
would kill the whole serverless function, not just fail one request; the
original `if (require.main === module)` guard was also dropped as unreliable
once Next.js bundles the module (its output format isn't guaranteed to be
CommonJS, so `require`/`module` aren't guaranteed to exist at runtime).
`ingest-prices.ts` now exports only `runIngestion()` (pure, side-effect-free
at import time) plus the existing chain-specific functions.

Verified: `npx tsc --noEmit`, `npx tsc --project scripts/tsconfig.json
--noEmit`, `npm run lint`, and `npm run build` are all clean after this
refactor; `/api/prices/ingest` appears as a normal dynamic route in the
build output.

### Production readiness audit (Phase 6 step 4, 2026-07-21)
Checked and found clean — no code changes needed:
- **Sensitive data in `console.log`/`console.error`:** none found. All error
  logging across `app/api/*` and `components/AuthModal.tsx` logs generic
  `Error` objects/messages, never raw keys, tokens, or user PII by name.
- **`/api/dev/login` production guard:** already correctly implemented —
  `if (process.env.NODE_ENV !== 'development') return 404` is the first line
  of the handler (`app/api/dev/login/route.ts:11`). No fix needed.
- **Stack traces exposed to the client:** none found. Every API route catch
  block returns only `error.message` (a short description), never
  `error.stack`, in its JSON error response.
- **Hardcoded URLs that should be env vars:** none found needing a fix. The
  only genuinely environment-specific URLs (`NEXT_PUBLIC_SUPABASE_URL`, etc.)
  are already env vars. Everything else hardcoded is either a fixed
  third-party integration URL (Waze deep link, WhatsApp `wa.me` link,
  OpenStreetMap tile server, a Cloudinary default-avatar image) or a public
  government price-feed URL (`RAMI_LEVY_URL`, `SHUFERSAL_LISTING_URL`) that's
  the same across all environments by definition — making these env vars
  would add indirection without benefit. The WhatsApp support link's phone
  number (previously a `972500000000` all-zeros placeholder, flagged here as
  a follow-up) was updated to a real number in a later session.

## Phase 8 — production smoke-test fixes (2026-07-21)
Five issues found during a production smoke test, fixed and deployed in one
session. Each landed as a separate commit; all verified in-browser on both
localhost and production (`https://smart-grocery-il.vercel.app`).

**1. Product catalog widened.** `scripts/seed-products-from-feed.ts` read only
3-5 Shufersal branch files by default; bumped to 20 and switched from
upsert-everything to insert-only-new-barcodes (skip existing, dedupe within
the batch) so re-running it is additive and safe. 218 → 9,648 products (9,430
new). Also stopped writing `price_history` for already-existing products on
re-run — only new products get a price row now. See "Repo structure" and
"Seeded data" above.

**2. Per-product price breakdown — verified working, not touched.** The
Phase-3 tap-to-expand breakdown in the comparison panel (`expandedPriceItemId`
state in `page.tsx`) was fully intact; nothing to fix.

**3. Distance slider widened.** Was a discrete 1/3/5/10 km stepper
(`DISTANCE_OPTIONS` array + index-mapped `<input type="range">`); replaced
with a plain continuous range: `min={0.5} max={50} step={0.5}`, default still
5, displayed as `X.X ק"מ`/`X.X km` (`.toFixed(1)`). The `DISTANCE_OPTIONS`
constant was removed as dead code. Filtering logic (`_distKm <= distanceKm`)
didn't need to change.

**4. Real branches seeded — see `scripts/seed-branches.ts` in "Repo
structure" above.** Key discovery: the task's assumption that branch
metadata lived in the PriceFull XML headers was wrong — those only contain
`ChainID`/`SubChainID`/`StoreID`/`BikoretNo`, no name/address/city (confirmed
by dumping a raw file). The real metadata lives in a separate feed category:
Shufersal's `FileObject/UpdateCategory` listing endpoint takes a `catID` query
param, and probing `catID=1` through `8` found `catID=5` returns exactly one
`Stores*.gz` file per chain (`catID=1/6/7/8` all alias `Price`, `2` is
`PriceFull`, `3` is `Promo`, `4` is `PromoFull`) shaped as
`Chain > SubChains > SubChain > Stores > Store`, each with `StoreID`,
`StoreName`, `Address`, `City`, `ZIPCode` — no `lat`/`lng`. 8 → 428 branches
(420 new). **`City` is not a city name** — it's Israel's numeric government
settlement code (סמל יישוב, e.g. `5000`), and there's no code→name lookup
table in this repo, so it's stored as-is in `city_he` rather than guessed at
(see "Seeded data" above for the UI impact — no map pin or GPS-distance match
for these rows, since both need `lat`/`lng`).

**5. Auth gate added, guest mode removed.** The app previously let anyone
browse/search/basket without signing in. Now: a new `isAuthChecked` state
gates the initial render (spinner) until `supabase.auth.getUser()` resolves;
if there's no `currentUser`, the component early-returns a minimal screen with
just the language toggle + a non-dismissable `<AuthModal dismissible={false}>`
(new prop, hides the X button) instead of the full app. Signing in/up (or Dev
Login) populates `currentUser` and the full app renders; signing out clears it
and the gate reappears. Removed as dead code: the drawer's guest
sign-in-button/ternary (currentUser is now always truthy inside the full-app
render branch) and a second, now-unreachable `<AuthModal>` instance that used
to sit at the bottom of the main return.
  - **Bug caught during verification, not anticipated going in:** the gate's
    full-screen `<AuthModal>` backdrop (`fixed inset-0 z-50`) sat in a higher
    stacking context than the gate's own `<header>` (plain `position: static`,
    so `z-index` was a no-op on it) — clicks on the visually-still-showing
    language toggle behind the dimmed backdrop were silently swallowed by the
    backdrop `div`, not reaching the button underneath. Fixed by adding
    `relative z-[60]` to the gate's `<header>`. General lesson: a `fixed`
    overlay always wins stacking over a `static` sibling regardless of DOM
    order or visual dimming — anything meant to stay clickable "through" or
    "above" a full-screen modal needs its own explicit position + z-index.

**6. Sign-up "red brackets" bug — root cause found, one layer fixed.**
Reported as a mystery red-bordered panel appearing after submitting sign-up.
Reproduced directly: `AuthModal`'s error box was displaying the literal string
`"{}"`. Root cause, traced into `@supabase/auth-js`'s `handleError()`
(`node_modules/@supabase/auth-js/dist/module/lib/fetch.js`): for any 5xx
response it throws `AuthRetryableFetchError(_getErrorMessage(error), ...)`
where `error` is the **raw, unparsed** `fetch` `Response` object — never
`await error.json()`'d in that branch — and `_getErrorMessage` falls through
to `JSON.stringify(err)`, which for a `Response` object (no enumerable own
properties) is exactly `"{}"`. `getErrorMessage()` in `AuthModal.tsx` now
special-cases this via `isAuthRetryableFetchError()` (re-exported by
`@supabase/supabase-js` from `auth-js`) and shows a real bilingual message
instead. **The underlying trigger is the broken SMTP delivery described in
"Custom SMTP (Resend)" above** — a Supabase/Resend Dashboard configuration
issue, not fixable from application code, and still unresolved: every sign-up
attempt this session got the same 500, so the fix here addresses the
error-display bug, not the ability to actually complete a sign-up yet.

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all
clean. `vercel --prod` deployed successfully (first production deploy) and
aliased to `https://smart-grocery-il.vercel.app`; all fixes re-verified live
in production, not just localhost.
