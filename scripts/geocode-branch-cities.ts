/**
 * One-time (re-runnable) backfill: branches seeded from government feeds
 * (scripts/seed-branches.ts) store `city_he` as Israel's numeric settlement
 * code (סמל יישוב), not a name or coordinates — the feeds themselves never
 * publish lat/lng (confirmed in Phase 8/15, see CLAUDE.md). This script
 * resolves that code to a real city name via data.gov.il's official
 * settlements dataset, geocodes each unique city name once via Nominatim
 * (OpenStreetMap), and backfills `branches.lat/lng` at city-center
 * resolution for every branch that's still missing them.
 *
 * City-center, not address-level: multiple branches in the same city land on
 * the same point. That's a deliberate tradeoff — address-level geocoding of
 * ~1000 rows against Nominatim's public instance (1 req/sec, no bulk
 * geocoding without permission per its usage policy) isn't practical, while
 * there are only ~100 unique city codes among these branches, which is.
 *
 * Safe to re-run: only touches rows where lat IS NULL, and resumes from
 * scripts/.geocode-cache.json if interrupted (Nominatim lookups are cached
 * by settlement code so a re-run doesn't re-hit the API for cities it
 * already resolved).
 *
 * Run with: npx ts-node --project scripts/tsconfig.json scripts/geocode-branch-cities.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { restFetch, requireEnv, sleep } from './supabase-rest';

const SETTLEMENTS_RESOURCE_ID = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba'; // data.gov.il "רשימת ישובים בישראל"
const CACHE_PATH = join(__dirname, '.geocode-cache.json');
const NOMINATIM_USER_AGENT = 'SmartGroceryIL-BranchGeocode/1.0 (one-time settlement-level backfill)';

interface CityCoords {
  name: string;
  lat: number;
  lng: number;
}

function loadCache(): Record<string, CityCoords> {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CityCoords>): void {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function fetchSettlementCodeToName(): Promise<Record<string, string>> {
  const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${SETTLEMENTS_RESOURCE_ID}&limit=1500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.gov.il settlements fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  const map: Record<string, string> = {};
  for (const rec of json.result.records as Array<Record<string, string>>) {
    const code = (rec['סמל_ישוב'] || '').trim();
    const name = (rec['שם_ישוב'] || '').trim();
    if (code && name) map[code] = name;
  }
  return map;
}

async function fetchDistinctCityCodesWithoutCoords(): Promise<Set<string>> {
  const codes = new Set<string>();
  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await restFetch(
      `branches?select=city_he&lat=is.null&order=id&limit=${PAGE_SIZE}&offset=${offset}`
    );
    if (!res.ok) throw new Error(`branches fetch failed: HTTP ${res.status}`);
    const rows: Array<{ city_he: string | null }> = await res.json();
    for (const r of rows) if (r.city_he) codes.add(r.city_he.trim());
    if (rows.length < PAGE_SIZE) break;
  }
  return codes;
}

async function geocodeCity(name: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ format: 'json', q: `${name}, ישראל`, limit: '1' });
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

  console.log('Fetching settlement code -> name table from data.gov.il...');
  const codeToName = await fetchSettlementCodeToName();

  console.log('Fetching distinct city codes among branches missing lat/lng...');
  const branchCodes = await fetchDistinctCityCodesWithoutCoords();
  console.log(`${branchCodes.size} distinct city codes to resolve`);

  const cache = loadCache();
  let geocoded = 0;
  let skippedNoName = 0;

  for (const code of branchCodes) {
    if (cache[code]) continue;
    const name = codeToName[code];
    if (!name) {
      skippedNoName++;
      continue;
    }
    const coords = await geocodeCity(name);
    if (coords) {
      cache[code] = { name, ...coords };
      geocoded++;
      console.log(`  ${code} ${name} -> ${coords.lat}, ${coords.lng}`);
    } else {
      console.log(`  ${code} ${name} -> no geocode result`);
    }
    saveCache(cache);
    await sleep(1050); // Nominatim usage policy: max 1 request/second
  }

  console.log(`Geocoded ${geocoded} new cities this run (${skippedNoName} codes have no name in the settlements table).`);
  console.log('Applying lat/lng to branches...');

  let totalUpdated = 0;
  for (const code of branchCodes) {
    const entry = cache[code];
    if (!entry) continue;
    const res = await restFetch(
      `branches?city_he=eq.${encodeURIComponent(code)}&lat=is.null`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ lat: entry.lat, lng: entry.lng }),
      }
    );
    if (!res.ok) {
      console.error(`  PATCH failed for city ${code} (${entry.name}): HTTP ${res.status}`);
      continue;
    }
    const rows = await res.json();
    totalUpdated += rows.length;
  }

  console.log(`Done. ${totalUpdated} branch rows backfilled with city-center lat/lng.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
