/**
 * Address-level geocoding pass (Phase 15) for branches that have a real
 * street address but still lack lat/lng — distinct from
 * scripts/geocode-branch-cities.ts (Phase 16), which backfills city-CENTER
 * coordinates from a settlement code for branches with no address at all
 * (most Cerberus/laibcatalog chains). This script only touches the smaller
 * set of branches where address IS NOT NULL — real per-store precision,
 * not a city-wide approximation.
 *
 * Safe to re-run: only selects rows where lat IS NULL, so already-geocoded
 * branches are never re-queried.
 *
 * Run with: npm run geocode:branches:address
 */
import { restFetch, requireEnv, sleep } from './supabase-rest';

const NOMINATIM_USER_AGENT = 'SmartGroceryIL/1.0';

interface Branch {
  id: string;
  address: string;
  city_he: string | null;
}

async function fetchBranchesMissingCoords(): Promise<Branch[]> {
  const res = await restFetch('branches?select=id,address,city_he&lat=is.null&address=not.is.null&order=id');
  if (!res.ok) throw new Error(`branches fetch failed: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ q: query, format: 'json', limit: '1' });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': NOMINATIM_USER_AGENT },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function main() {
  requireEnv();

  const countBefore = await countBranchesWithCoords();
  console.log(`Branches with coordinates before: ${countBefore}`);

  const branches = await fetchBranchesMissingCoords();
  console.log(`${branches.length} branches have an address but no lat/lng — geocoding...`);

  let geocoded = 0;
  let notFound = 0;

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const query = `${branch.address}, ${branch.city_he ?? ''}, Israel`;
    const coords = await geocodeAddress(query);

    if (coords) {
      const res = await restFetch(`branches?id=eq.${branch.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ lat: coords.lat, lng: coords.lng }),
      });
      if (res.ok) {
        geocoded++;
      } else {
        console.error(`  PATCH failed for branch ${branch.id}: HTTP ${res.status} ${await res.text()}`);
      }
    } else {
      notFound++;
    }

    if ((i + 1) % 10 === 0 || i === branches.length - 1) {
      console.log(`  Progress: ${i + 1}/${branches.length} (${geocoded} geocoded, ${notFound} not found)`);
    }

    await sleep(1000); // Nominatim usage policy: max 1 request/second
  }

  const countAfter = await countBranchesWithCoords();
  console.log(`\nDone. Geocoded ${geocoded} branches, ${notFound} had no Nominatim result.`);
  console.log(`Branches with coordinates: ${countBefore} -> ${countAfter}`);
}

async function countBranchesWithCoords(): Promise<number> {
  const res = await restFetch('branches?select=id&lat=not.is.null&limit=1', {
    headers: { Prefer: 'count=exact' },
  });
  const contentRange = res.headers.get('content-range'); // "0-0/N"
  return contentRange ? Number(contentRange.split('/')[1]) : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
