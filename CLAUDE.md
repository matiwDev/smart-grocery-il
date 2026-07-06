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

## Repo structure
```
app/
  page.tsx                        # Main UI — all views (HOME, LOCATION, PROFILE, CHAT, SAVED_LISTS)
  layout.tsx                      # Root layout, RTL support, CSS skin variables
  api/
    products/search/route.ts      # GET ?q=<query> — returns products + latest prices per chain
    prices/compare/route.ts       # POST {items:[{product_id,quantity}]} — returns cost per chain
    baskets/sync/route.ts         # Basket UPSERT/sync
components/
  AuthModal.tsx                   # OTP sign-in / sign-up modal
  BranchMapContainer.tsx          # Branch list + map placeholder
lib/
  supabaseServer.ts               # Service-role Supabase client (API routes only)
utils/
  supabase.ts                     # Anon Supabase client (browser only)
supabase/
  FULL_RESET_v2.sql               # Full schema — run this to reset the DB
```

## Environment variables
Located at `.env.local` (gitignored). If missing, run: `npm run env:link`
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Database schema (key tables)
```sql
chains         — id (text PK), name_he, name_en, color_hex
products       — id (uuid), barcode (unique), name_he, name_en, category
branches       — id, chain_id, name_he, name_en, city_he, city_en, lat, lng, is_active
price_history  — id, product_id, chain_id, branch_id, price, captured_at, source
latest_prices  — MATERIALIZED VIEW: latest price per (product_id, chain_id)
profiles       — id (= auth.users.id), nickname, phone_number, avatar_url, selected_skin
households     — id, name
household_members — household_id, user_id, role
baskets        — id, user_id, household_id, name, is_archived
basket_items   — id, basket_id, product_id, product_name, quantity_value
messages       — id, user_id, nickname, message_text, created_at
```

## Seeded data
- 18 real Israeli products with Hebrew + English names and real barcodes
- 4 chains: shufersal, rami_levy, victory, yohananof
- 8 branches across Gush Dan area with real coordinates
- 72 price rows (18 products × 4 chains) with realistic ILS prices
- latest_prices materialized view populated

## RLS rules
- products, chains, branches, price_history, latest_prices: public SELECT (authenticated + anon)
- baskets, basket_items: user owns their own rows (auth.uid() = user_id)
- profiles: user owns their own row
- price writes: service_role only

## Current roadmap phase
**Phase 0 complete** — schema, seed data, API routes in place.

**Phase 1 in progress:**
- [ ] Fix product search returning empty results (suspect: RLS on latest_prices or missing service role key)
- [ ] Verify /api/products/search?q=חלב returns 4 products with prices
- [ ] Verify /api/prices/compare returns chain totals for a test basket
- [ ] Wire basket_items.product_id to real products.id on add
- [ ] Load saved basket items back into UI state on login
- [ ] Replace BranchMapContainer placeholder with real Leaflet map

**Phase 2 next:**
- Leaflet map showing branches coloured by basket cost
- Waze/Google Maps deep link from cheapest branch

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
```

## How to reset the database
Go to Supabase Dashboard → SQL Editor → paste and run `supabase/FULL_RESET_v2.sql`
Then refresh the latest_prices view:
```sql
SELECT refresh_latest_prices();
```

## Known issues / gotchas
- latest_prices is a materialized view — after any price_history insert, call refresh_latest_prices()
- SUPABASE_SERVICE_ROLE_KEY must be in .env.local (not just the anon key) for API routes to work
- Next.js does NOT follow symlinks for .env.local — always write the file directly
- The `households` RLS policy must be defined AFTER `household_members` table exists
- Tailwind 4 uses @tailwindcss/postcss — do not add a tailwind.config.js, it's not needed
- motion is imported from 'motion/react', not 'framer-motion'
