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
    002_price_alerts.sql          # price_alerts table (see below). NOT YET APPLIED to the live
                                   # project — run it in the Supabase Dashboard SQL Editor (no
                                   # `supabase` CLI/DB connection is configured for this repo, so
                                   # these migration files are applied manually, not automatically).
    003_household_invite.sql      # households.invite_code column + get_or_create_own_household()/
                                   # join_household_by_code() RPC functions (see below). Also NOT
                                   # YET APPLIED — same manual SQL Editor step required.
    004_ingest_log.sql            # ingest_log table (see "Price ingestion pipeline" below). Also
                                   # NOT YET APPLIED — same manual SQL Editor step required. The
                                   # ingest script tolerates this (logs a warning, doesn't crash).
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
households     — id, name, invite_code (unique, nullable — migration 003, NOT YET APPLIED)
household_members — household_id, user_id, role
baskets        — id, user_id, household_id, name, is_archived
basket_items   — id, basket_id, product_id, product_name, quantity_value
messages       — id, user_id, nickname, message_text, created_at
price_alerts   — id, product_id, user_id, target_price, chain_id, is_active
                 (migration 002, NOT YET APPLIED — see below)
ingest_log     — id, chain_id, started_at, finished_at, products_fetched,
                 products_matched, products_inserted, error_text
                 (migration 004, NOT YET APPLIED — see below)
```

RPC functions (migration 003, NOT YET APPLIED):
```
generate_invite_code()             — internal helper, 6-char alphanumeric code
get_or_create_own_household()      — lazily creates the caller's household + invite
                                      code on first call, returns (id, name, invite_code)
join_household_by_code(code text)  — inserts a household_members row for the caller
                                      into the household matching invite_code
```

## Seeded data
- 18 real Israeli products with Hebrew + English names and real barcodes
- 4 chains: shufersal, rami_levy, victory, yohananof
- 8 branches across Gush Dan area with real coordinates
- 72 price rows (18 products × 4 chains) with realistic ILS prices
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
Rami Levy:  https://url.rami-levy.co.il/api/delivery/prices
```

**Shufersal** — that URL is not itself an XML feed; it's an HTML page listing
one gzipped `PriceFull*.gz` XML file per branch (Azure Blob Storage links with
short-lived SAS signatures, ~hundreds of branches, paginated). The script
fetches that listing, regexes out the blob URLs, downloads + gunzips the first
`SHUFERSAL_STORE_LIMIT` files (default 3, override via env var), and parses
each with `fast-xml-parser`. Each `<Item>` has `ItemCode` (barcode), `ItemName`,
`ItemPrice`, `Quantity`, `UnitOfMeasure`. Verified working end to end against
the live feed.

**Rami Levy** — the URL given for this chain does not resolve (DNS failure as
of this writing). The script still has a JSON ingestion path for it (guesses
a `{items:[...]}` / `{products:[...]}` / bare-array shape and reads
`barcode`/`price`-ish fields), but this is unverified against a real payload
since the endpoint isn't reachable. Treat it as a starting point, not a tested
integration, if the real URL is ever found.

**Barcode match rate with the current seed data is 0.** Verified by manually
downloading and grepping ~20 real Shufersal branch files (~125k line items,
all realistic 13-digit `729...` EAN-13 codes) for all 18 seeded
`products.barcode` values — none appear anywhere in Shufersal's real catalog.
The seeded barcodes are plausible-looking placeholders, not live retailer
SKUs. The ingestion mechanics (fetch → parse → barcode lookup → insert →
`refresh_latest_prices()`) are confirmed correct (verified the REST
`barcode=in.(...)` filter directly matches a real seeded barcode when given
one), but a real test run against live Shufersal data will report
`matched=0, inserted=0` until the seed data is replaced with barcodes that
actually exist in a chain's real catalog.

Run manually: `npm run ingest` (uses `SUPABASE_SERVICE_ROLE_KEY` from
`.env.local`, same as everything else). Retries once per attempt on
HTTP 429/503 (3 attempts, 2s delay); any other feed failure is logged per-chain
and the script continues rather than crashing. Prints a summary line per chain
and writes a row to `ingest_log` (skipped with a warning if migration 004
hasn't been applied yet).

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
- [ ] Apply `004_ingest_log.sql` via the Supabase SQL Editor
- [ ] Victory (zipped XML) and Yohananof ingestion — not started
- [ ] Replace seed barcodes with real ones (or seed against a chain's actual
      catalog) so ingestion runs produce non-zero matches or set up
      seed products with real barcodes for a full end to end test

## Coding conventions
- All components: functional, TypeScript strict
- API routes: always use `lib/supabaseServer.ts` (service role), never the anon client
- Tailwind only for styling — no inline style except CSS variable overrides
- Hebrew is the primary language; English is secondary
- Minimum touch target: 44×44px on all interactive elements
- `@/*` path alias resolves to project root

## How to run
```bash
npm run dev        # Start dev server on localhost:3000
npm run build      # Production build
npm run lint       # ESLint check
npm run env:link   # Restore .env.local from ~/.config/smartgrocery/.env.local
npm run ingest     # Run the price ingestion pipeline (see "Price ingestion pipeline")
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
Editor by hand to actually take effect. As of this writing, `002_price_alerts.sql`,
`003_household_invite.sql`, and `004_ingest_log.sql` are unapplied; the
corresponding app features (price alert bell, household invite/join,
`scripts/ingest-prices.ts` writing its summary row) are wired correctly
end-to-end but will fail with PostgREST "not found" errors (PGRST205/PGRST202)
until those are run. The ingest script specifically tolerates 004 being
missing (catches the PGRST205 and logs a warning instead of crashing).

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
  pre-existing tooling issue
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
