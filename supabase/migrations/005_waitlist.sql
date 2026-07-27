-- Coupons "notify me" waitlist (Phase 11 step 7). Write-only from the client —
-- same pattern as price_alerts/ingest_log: no select policy, so only an insert
-- (via the authenticated anon-key client) is possible, never a read-back.

CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    feature TEXT NOT NULL DEFAULT 'coupons',
    user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(email, feature)
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can join the waitlist"
ON waitlist FOR INSERT
TO authenticated
WITH CHECK (true);
