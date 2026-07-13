-- Tracks each run of scripts/ingest-prices.ts: one row per chain per run,
-- written after the run completes (success or failure) so ingestion health
-- can be audited without grepping script output.

CREATE TABLE ingest_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain_id TEXT REFERENCES chains(id),
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    products_fetched INT NOT NULL DEFAULT 0,
    products_matched INT NOT NULL DEFAULT 0,
    products_inserted INT NOT NULL DEFAULT 0,
    error_text TEXT
);

ALTER TABLE ingest_log ENABLE ROW LEVEL SECURITY;

-- Written only by the ingest script (service_role, which bypasses RLS).
-- No client-facing policy is defined, so anon/authenticated get no access.
