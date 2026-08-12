/**
 * One-off retry for Victory + Mahsanei Hashuk after the full Phase 18 ingest
 * run's own attempt hit `laibcatalog.co.il` while it was returning empty
 * responses (confirmed via direct curl during that session: HTTP 000/timeout
 * on both getfiles and getbranches at that moment, recovered minutes later).
 * Not a permanent script — scripts/run-ingest-cli.ts already covers these
 * chains on every regular run; this just avoids re-running the other 5
 * chains (Shufersal alone is ~2.3M items) just to pick up the two that hit
 * a transient third-party outage.
 */
import { requireEnv } from './supabase-rest';
import { ingestFromParser } from './ingest-prices';
import { fetchAndParse as fetchAndParseVictory } from './parsers/victory';
import { fetchAndParse as fetchAndParseMahsaneiHashuk } from './parsers/mahsanei-hashuk';

requireEnv();

async function main() {
  const results = [];
  results.push(await ingestFromParser('victory', fetchAndParseVictory));
  results.push(await ingestFromParser('mahsanei_hashuk', fetchAndParseMahsaneiHashuk));
  console.log('\n─── Retry summary ───');
  for (const r of results) {
    console.log(`${r.chainId}  fetched=${r.fetched}  matched=${r.matched}  inserted=${r.inserted}${r.errorText ? `  ERROR: ${r.errorText}` : ''}`);
  }
}

main().catch((err) => {
  console.error('ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
