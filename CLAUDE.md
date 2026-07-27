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
- **Map:** react-leaflet + leaflet (client-only, dynamically imported — see gotchas)
- **Barcode scanning:** @zxing/browser + @zxing/library (`BrowserMultiFormatReader`,
  live camera decode — see "Phase 12" below)

## Repo structure
```
app/
  page.tsx                        # Main UI — all views (HOME, LOCATION, PROFILE, CHAT, SAVED_LISTS,
                                   # SCAN, COUPONS — the latter two added Phase 11, see below).
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
                                   # @zxing/browser (see "Phase 12" below).
  layout.tsx                      # Root layout, RTL support, pre-hydration theme-init script (see
                                   # "Theme system" below)
  api/
    products/search/route.ts      # GET ?q=<query> — returns products + latest prices per chain.
                                   # Phase 11: the `.or(...)` filter also matches `barcode.eq.<q>`
                                   # (exact match), so the Scan view's manual barcode entry works
                                   # against this same endpoint instead of needing a new one.
    prices/compare/route.ts       # POST {items:[{product_id,quantity}], chain_ids?:[...]} — returns
                                   # cost per chain, optionally narrowed to chain_ids (Phase 11 chain
                                   # selector strip; client omits it until the user deselects a chain)
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
  seed-products-from-feed.ts      # Phase 5, widened Phase 8 — pulls unique real products (barcode/
                                   # name/price) from the first 20 Shufersal branch files (was 3-5)
                                   # and inserts new ones into products + price_history, skipping
                                   # barcodes already present (safe to re-run — see Phase 8 below).
                                   # Run with `npm run seed:products`.
  seed-branches.ts                # Phase 8 — pulls real store metadata (StoreID/StoreName/Address/
                                   # City) from the Shufersal "Stores" feed category (catID=5, a
                                   # single chain-wide file, distinct from the per-branch PriceFull
                                   # files) and inserts new branches, deduping client-side on
                                   # (name_he, address) since branches has no unique constraint to
                                   # on_conflict against. See "Phase 8" below for the City-field
                                   # caveat. Run with `npm run seed:branches`.
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
                                   # below). Dynamically imports BranchLeafletMap
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
                                   # below). Written this session — checked live via PostgREST
                                   # (`waitlist?select=id` → PGRST205) and confirmed NOT YET
                                   # APPLIED. Needs to be pasted into the Supabase SQL Editor by
                                   # hand before the Coupons view's waitlist signup will work.
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
branches       — id, chain_id, name_he, name_en, city_he, city_en, lat, lng, is_active
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
                 (migration 005, NOT YET APPLIED — see "Repo structure" above)
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
- **9,648 products total as of Phase 8** (2026-07-21) — grew from 218 (Phase 5)
  to 9,648 (9,430 new) after widening `seed-products-from-feed.ts` from 3 to 20
  branch files. `name_en` is null for all real-feed products until
  `npm run enrich:names` is run
- 4 chains: shufersal, rami_levy, victory, yohananof
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
Rami Levy:  https://www.rami-levy.co.il/api/delivery/prices
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

**Rami Levy** — the original `url.rami-levy.co.il` host had a DNS failure.
`www.rami-levy.co.il/api/delivery/prices` (used above) resolves, but as of
this writing (2026-07-19) returns **HTTP 404** rather than JSON — verified via
a direct `curl`. The script parses a `{data: [{id, name, price}]}` shape
(`id` = barcode) per the current integration spec, plus a couple of other
plausible shapes, but this is still unverified against a real payload since no
endpoint has actually returned data yet. Treat it as a starting point, not a
tested integration, until a working URL is found.

**Rami Levy — Phase 6 dead end (2026-07-21).** Tried three more variants
against the live site, all still HTTP 404:
- `/api/delivery/prices` with a `User-Agent: Mozilla/5.0 (compatible;
  SmartGroceryIL/1.0)` header added
- `/api/marketplace/v2/prices`
- `/api/delivery/prices?storeId=331`

All three returned the *identical* Nuxt.js SPA "404" HTML page (title `רמי
לוי אונליין- 404`), not a JSON error and not even distinguishable 404 bodies
from each other — i.e. these are wrong routes at the framework level, not a
User-Agent block or a missing query param. This means guessing plausible REST
paths isn't converging; finding the real endpoint needs either inspecting the
site's actual network requests in a browser (devtools, while browsing
rami-levy.co.il's own product pages) or Rami Levy publishing the Food-Act
transparency feed at a documented URL (the other three chains' feeds — e.g.
Shufersal's — are typically linked from a "מחירי שקיפות"/price-transparency
page rather than an app-internal API). `ingestRamiLevy()` in
`scripts/ingest-prices.ts` is left as-is: it still attempts
`www.rami-levy.co.il/api/delivery/prices`, fails gracefully, logs the error to
`ingest_log`, and does not block Shufersal ingestion. Skipped for Phase 6 —
revisit with real network-traffic inspection before trying more URL guesses.

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
