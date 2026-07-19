# Smart Grocery IL — Claude Code Context

## What this project is
A mobile-first, real-time grocery price comparison app for the Israeli market.
Users build a shopping basket, the app compares total cost across 4 supermarket chains
(Shufersal, Rami Levy, Victory, Yohananof), and routes them to the cheapest nearby branch.

## Stack
- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL + Realtime + Auth)
- **Auth:** Supabase OTP (email + phone), profiles auto-created via DB trigger
- **Styling:** 4 switchable color palettes via CSS variables, RTL/LTR Hebrew/English toggle
- **Animation:** motion (framer-motion v12)
- **Map:** react-leaflet + leaflet (client-only, dynamically imported — see gotchas)

## Repo structure
```
app/
  page.tsx                        # Main UI — all views (HOME, LOCATION, PROFILE, CHAT, SAVED_LISTS)
  layout.tsx                      # Root layout, RTL support, CSS skin variables
  api/
    products/search/route.ts      # GET ?q=<query> — returns products + latest prices per chain
    prices/compare/route.ts       # POST {items:[{product_id,quantity}]} — returns cost per chain
    baskets/sync/route.ts         # Basket UPSERT/sync — NOT called from the frontend (dead code);
                                   # page.tsx writes to basket_items directly via the anon client
    dev/login/route.ts            # Dev-only: get-or-creates a fixed pre-confirmed test user via
                                   # the admin API and returns its credentials. 404s unless
                                   # NODE_ENV=development. Never sends real email.
    prices/ingest/route.ts        # Old webhook-style endpoint writing to the STALE
                                   # `price_snapshots` table (see schema.sql note below). Not
                                   # part of the real ingestion pipeline — see
                                   # scripts/ingest-prices.ts instead. Unused/dead, predates
                                   # Phase 4, left as-is.
scripts/
  ingest-prices.ts                # Standalone Phase 4 ingestion script — see "Price ingestion
                                   # pipeline" below. Run with `npm run ingest`.
  seed-products-from-feed.ts      # Phase 5 — pulls the first 200 unique real products (barcode/
                                   # name/price) from the live Shufersal feed and upserts them into
                                   # products + price_history. Run with `npm run seed:products`.
  enrich-product-names.ts         # Phase 5 — batches products missing name_en 50 at a time and
                                   # asks claude-haiku-4-5 to translate name_he to English. Run
                                   # with `npm run enrich:names`. Needs ANTHROPIC_API_KEY in
                                   # .env.local (not currently configured in this repo).
  shufersal-feed.ts               # Shared Shufersal fetch/gunzip/XML-parse logic, used by both
                                   # ingest-prices.ts and seed-products-from-feed.ts.
  supabase-rest.ts                # Shared env-loading + PostgREST client helpers (restFetch,
                                   # fetchWithRetry, chunk, refreshLatestPrices), used by all three
                                   # scripts above.
  tsconfig.json                   # Overrides module/moduleResolution to commonjs/node for
                                   # ts-node; the root tsconfig targets Next.js's bundler
                                   # resolution, which ts-node can't execute directly.
components/
  AuthModal.tsx                   # OTP sign-in / sign-up modal + "Dev Login" button (dev only)
  BranchMapContainer.tsx          # Branch list + map layout; dynamically imports BranchLeafletMap
  BranchLeafletMap.tsx            # Actual react-leaflet map — pins colored by chain color_hex,
                                   # popups with Waze deep link, flyTo on active-pin change,
                                   # optional userPosition prop renders a blue "you are here" pin
                                   # and flies the map to it on first fix
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

## Database schema (key tables)
```sql
chains         — id (text PK), name_he, name_en, color_hex
products       — id (uuid), barcode (unique), name_he, name_en, category
branches       — id, chain_id, name_he, name_en, city_he, city_en, lat, lng, is_active
price_history  — id, product_id, chain_id, branch_id, price, captured_at, source
latest_prices  — MATERIALIZED VIEW: latest price per (product_id, chain_id)
profiles       — id (= auth.users.id), nickname, phone_number, avatar_url, selected_skin
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
- 200 real products added in Phase 5 via `npm run seed:products` — real
  barcodes, names, and prices pulled directly from the live Shufersal feed
  (218 products total as of this writing). `name_en` is null for all 200 until
  `npm run enrich:names` is run
- 4 chains: shufersal, rami_levy, victory, yohananof
- 8 branches across Gush Dan area with real coordinates
- 72 price rows (18 original products × 4 chains) with realistic ILS prices,
  plus one real `shufersal` price_history row per Phase-5 product
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
(`dev@smartgrocery.local`) via `supabase.auth.admin.createUser` with
`email_confirm: true`, upserts its `profiles` row, and returns credentials for the
client to call `signInWithPassword` with. No email is ever sent by this path, and the
route 404s outside development — use this instead of real signups when testing basket/
profile/UI flows locally.

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
npm run seed:products  # Seed real products + prices from the Shufersal feed (Phase 5)
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
`npm run ingest` (`scripts/ingest-prices.ts`) is not currently run on any
schedule — it's a manual `npm run` command. Three ways to automate it,
documentation only, nothing below is wired up yet:

**Option A — GitHub Actions scheduled workflow (free, recommended).** A
`.github/workflows/ingest.yml` with a `schedule: cron:` trigger, checking out
the repo, running `npm ci`, and `npm run ingest` with
`SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` supplied via GitHub
Actions secrets (Settings → Secrets and variables → Actions). No new
infrastructure, generous free minutes for a repo this size, and the run log
is visible directly in the Actions tab. Cron is UTC — pick a time that's late
night in Israel (UTC+2/+3) to avoid overlapping site traffic, e.g.
`cron: '0 1 * * *'` for ~03:00/04:00 Israel time.

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
  rather than a coordinate computed earlier
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
