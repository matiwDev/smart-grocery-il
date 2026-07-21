/**
 * CLI entry point for `npm run ingest`. Thin wrapper around runIngestion()
 * (scripts/ingest-prices.ts) — adds the env-var presence check, console
 * output, and process.exit. Kept separate from ingest-prices.ts so that
 * module (also imported by app/api/prices/ingest/route.ts's cron GET
 * handler) has no CLI-only process side effects.
 */
import { requireEnv } from './supabase-rest';
import { runIngestion } from './ingest-prices';

requireEnv();

async function main() {
  const results = await runIngestion();

  console.log('\n─── Summary ───────────────────────────────────────');
  for (const r of results) {
    console.log(
      `${r.chainId.padEnd(12)} fetched=${r.fetched}  matched=${r.matched}  inserted=${r.inserted}` +
        (r.errorText ? `  ERROR: ${r.errorText}` : '')
    );
  }

  const anyFailed = results.some((r) => r.errorText);
  process.exit(anyFailed ? 1 : 0);
}

main();
