-- Phase 16 step 5: local/independent market spending tracker.
--
-- Unlike every other table in this schema, custom_markets/custom_market_entries
-- are written directly from the client (anon key), same pattern already used
-- for baskets/basket_items/price_alerts — RLS is the only thing enforcing
-- per-user isolation here, there's no service-role API route in front of it.

CREATE TABLE public.custom_markets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id)
             ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE public.custom_market_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id   UUID NOT NULL REFERENCES public.custom_markets(id)
              ON DELETE CASCADE,
  amount      NUMERIC(8,2) NOT NULL,
  note        TEXT,
  spent_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custom_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_market_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own markets"
  ON public.custom_markets FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own market entries"
  ON public.custom_market_entries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.custom_markets cm
    WHERE cm.id = custom_market_entries.market_id
    AND cm.user_id = auth.uid()
  ));
