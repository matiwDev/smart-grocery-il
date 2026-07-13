-- Price alerts: notify a user (future work) when a product drops to/below a target
-- price, optionally scoped to one chain. For now this table is write-only from the
-- client (no email/notification worker reads it yet).

CREATE TABLE price_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_price NUMERIC NOT NULL,
    chain_id TEXT REFERENCES chains(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, user_id, chain_id)
);

ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own price alerts"
ON price_alerts FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
