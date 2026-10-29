-- 021 — APPLIED 2026-10-29. Plan v2, phase 3: shared live list + real household chat.
--
--   * Lists belong to the household: members can read and change baskets /
--     basket_items whose household_id is theirs (owners keep access to their
--     own). Each user's current list is attached to their household.
--   * messages: were readable/writable by ANY signed-in user across all
--     households. Now per household (household_id), with an optional photo
--     (image_path in the private chat-photos bucket); members read and post,
--     authors delete their own.
--   * chat-photos bucket: PRIVATE; path <household_id>/<file>; members only.
--     The app shows photos through short-lived signed URLs.
--   * Realtime: basket_items, messages, product_overrides, custom_products are
--     published; REPLICA IDENTITY FULL so updates carry the full row.
--   * Joining a household by code now leaves your previous household, and
--     get_or_create_own_household() returns your newest membership.

-- ─── Shared lists ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users access their own baskets" ON public.baskets;
DROP POLICY IF EXISTS "own or household baskets" ON public.baskets;
CREATE POLICY "own or household baskets" ON public.baskets FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (household_id IS NOT NULL AND public.is_household_member(household_id)))
  WITH CHECK (user_id = auth.uid() OR (household_id IS NOT NULL AND public.is_household_member(household_id)));

DROP POLICY IF EXISTS "Users access items in their baskets" ON public.basket_items;
DROP POLICY IF EXISTS "items of own or household baskets" ON public.basket_items;
CREATE POLICY "items of own or household baskets" ON public.basket_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baskets b WHERE b.id = basket_id
                 AND (b.user_id = auth.uid() OR (b.household_id IS NOT NULL AND public.is_household_member(b.household_id)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.baskets b WHERE b.id = basket_id
                 AND (b.user_id = auth.uid() OR (b.household_id IS NOT NULL AND public.is_household_member(b.household_id)))));

UPDATE public.baskets b SET household_id = hm.household_id
FROM public.household_members hm
WHERE hm.user_id = b.user_id AND b.household_id IS NULL;

-- ─── Household chat ─────────────────────────────────────────────────────────
DELETE FROM public.messages WHERE true;  -- 0 rows: the old chat never saved anything
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ALTER COLUMN message_text DROP NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_text_or_photo;
ALTER TABLE public.messages ADD CONSTRAINT messages_text_or_photo
  CHECK (coalesce(length(trim(message_text)), 0) > 0 OR image_path IS NOT NULL);
CREATE INDEX IF NOT EXISTS messages_household_idx ON public.messages(household_id, created_at DESC);

DROP POLICY IF EXISTS "Authenticated users read and write messages" ON public.messages;
DROP POLICY IF EXISTS "members read household messages" ON public.messages;
DROP POLICY IF EXISTS "members post as themselves" ON public.messages;
DROP POLICY IF EXISTS "authors delete own messages" ON public.messages;
CREATE POLICY "members read household messages" ON public.messages FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));
CREATE POLICY "members post as themselves" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_household_member(household_id));
CREATE POLICY "authors delete own messages" ON public.messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-photos', 'chat-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "chat photos: members read" ON storage.objects;
CREATE POLICY "chat photos: members read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-photos' AND public.is_household_member(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "chat photos: members upload" ON storage.objects;
CREATE POLICY "chat photos: members upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-photos' AND public.is_household_member(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "chat photos: owner deletes" ON storage.objects;
CREATE POLICY "chat photos: owner deletes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-photos' AND owner_id = auth.uid()::text);

-- ─── Realtime ───────────────────────────────────────────────────────────────
ALTER TABLE public.basket_items REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['basket_items', 'messages', 'product_overrides', 'custom_products'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ─── Households: one at a time ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_own_household()
RETURNS TABLE(id uuid, name text, invite_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_household_id UUID;
BEGIN
  SELECT hm.household_id INTO target_household_id
  FROM household_members hm
  WHERE hm.user_id = auth.uid()
  ORDER BY hm.created_at DESC
  LIMIT 1;

  IF target_household_id IS NULL THEN
    INSERT INTO households (name) VALUES ('המשק בית שלי')
    RETURNING households.id INTO target_household_id;
    INSERT INTO household_members (household_id, user_id, role)
    VALUES (target_household_id, auth.uid(), 'ADMIN');
  END IF;

  IF (SELECT h.invite_code FROM households h WHERE h.id = target_household_id) IS NULL THEN
    UPDATE households SET invite_code = generate_invite_code() WHERE households.id = target_household_id;
  END IF;

  RETURN QUERY SELECT h.id, h.name, h.invite_code FROM households h WHERE h.id = target_household_id;
END;
$$;

-- Joining moves you (and your current list) into the new household; your
-- previous household keeps its own data.
CREATE OR REPLACE FUNCTION public.join_household_by_code(code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_household_id UUID;
BEGIN
  SELECT h.id INTO target_household_id FROM households h WHERE h.invite_code = upper(code);
  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  DELETE FROM household_members hm WHERE hm.user_id = auth.uid() AND hm.household_id <> target_household_id;
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (target_household_id, auth.uid(), 'MEMBER')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  -- If the household already has a current list, yours becomes a saved list;
  -- otherwise your current list becomes the household's.
  UPDATE baskets b SET is_archived = true
  WHERE b.user_id = auth.uid() AND b.is_archived = false AND b.household_id IS DISTINCT FROM target_household_id
    AND EXISTS (SELECT 1 FROM baskets hb WHERE hb.household_id = target_household_id AND hb.is_archived = false);
  UPDATE baskets b SET household_id = target_household_id
  WHERE b.user_id = auth.uid() AND b.is_archived = false;

  RETURN QUERY SELECT h.id, h.name FROM households h WHERE h.id = target_household_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_or_create_own_household() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_household_by_code(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_or_create_own_household() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household_by_code(text) TO authenticated;
