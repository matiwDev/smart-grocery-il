-- 018 — APPLIED 2026-10-29. Plan v2, phase 2: list v2 + trip estimates.
--
--   * Products get an aisle category from their Hebrew name (categorize_product,
--     below); a trigger keeps new products categorized. "other" went from 80%
--     of the catalog to ~24%. Any item's category can still be edited.
--   * basket_items: checked flag, and own category / price / photo for
--     free-text items (product_id IS NULL).
--   * product_overrides: a household's edits to a catalog product (name,
--     category, price, photo). Apply everywhere for that household only.
--   * shopping_trips + trip_items: each "Done shopping at…", with an
--     ESTIMATED total and how many items had a price.
--   * Storage bucket item-photos (public read, 5 MB, images); each user
--     uploads into a folder named after their user id.

-- Aisle category from a product's Hebrew name (Plan v2, phase 2). First match
-- wins; order matters: baby, pets, strong personal-care words, household,
-- weaker personal-care words, then food. "B" patterns use (^|[^א-ת]) as a word
-- boundary so short words like בקר don't match inside בקרטון.
CREATE OR REPLACE FUNCTION public.categorize_product(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN n ~ '(חיתול|האגיס|פמפרס|מטרנה|סימילאק|נוטרילון|מוצץ|מוצצים|לתינוק|לתינוקות|מגבוני תינוק|מחית תינוק|בייבי ביס)' THEN 'baby'
    WHEN n ~ '(לחתול|לחתולים|לכלב|לכלבים|לגור|לגורים|חול לחתול|פיין קט|פריסקיז|ויסקס|פרו פלאן|רויאל קנין|בונזו|פדיגרי)' THEN 'household'
    WHEN n ~ '(מייקאפ|מייק-אפ|מסקרה|שפתון|ליפסטיק|שפתיים|גלוס|אייליינר|איליינר|צללית|סומק|קונסילר|פודרה|ברונזר|פריימר|גבות|ריסים|ציפורנ|בושם|אדפ|אדט|א\.ד\.פ|א\.ד\.ט|קולון|לשיער|שיער|תלתלים|פנים|איפור|סרום|טונר|גילוח|אפטר|דאודורנט|רול און|תחבושות|טמפון|שעווה|צבע סמי|קולסטון|קולור נטורלס|אקסלנס|ויטמין|ויט ?[A-Z]|לגוף|גל גוף|קרם גוף|לידיים|לחות)' THEN 'personal_care'
    WHEN n ~ '(כביסה|אקונומיקה|ניקוי|לניקוי|מנקה|נוזל כלים|נ\.כלים|סבון כלים|מדיח|רצפות|אשפה|אשפתון|שקיות|נייר טואלט|נייר מגבת|מגבת נייר|טישו|ממחטות|כפפות|נייר אפייה|נייר כסף|נייר סופג|רדיד|ניילון נצמד|צלחות|צלחת|כוסות|כוסיות|קערה|קערות|מגש|מזלגות|מפיות|נרות|סוללות|סוללת|מטהר|מקלות ריחניים|מנטרל ריחות|ריחני|קינוחית|סלטיות|קופסאות|תבנית|תבניות|ספוג|מגב|מטאטא|מטליות|אטבי|לנעל|נעליים|תיק |בקבוק ספורט|מצית|גפרורים|פלסטיק|חד פעמי|חד"פ|צעצוע|גביע|מילוי גז)'
      OR n ~ '(^|[^א-ת])נר([^א-ת]|$)' THEN 'household'
    WHEN n ~ '(שמפו|מרכך|סבון|משחת|מברשת|ליסטרין|מי פה|קרם|תחליב|פדים|טופ פד|סכיני|עדשות|פצירה|פצירות|טיפוח|תוסף תזונה|אומגה|פלסטר|גזה|קונדום|דורקס|מגנוקס|אקמול|נורופן|אופטלגין|דקסמול|קצף|ספריי)' THEN 'personal_care'
    WHEN n ~ '(קפוא|קפואה|קפואים|קפואות|מוקפא|גלידה|גלידת|שלגון|ארטיק|קרטיב)' THEN 'frozen'
    WHEN n ~ '(לחם|לחמני|פיתה|פיתות|בגט|באגט|חלות|טורטי|לאפה|מאפה|קרואסון|בורקס|עוגה|עוגת|רוגלך|מאפינס|פוקאצ|כעך|קרקר|פריכיות|ג''בטה|ג׳בטה)' OR n ~ '(^|[^א-ת])(חלה|בייגל)([^א-ת]|$)' THEN 'bread'
    WHEN n ~ '(שוקולד|שוק\.|סוכרי|במבה|ביסלי|צ''יפס|צ׳יפס|חטיף|עוגיות|עוגייה|וופל|גומי|ליקריץ|טופי|מסטיק|מנטוס|קרמבו|פופקורן|בייגלה|מקלות מלוחים|אפרופו|דוריטוס|תפוצ|פרינגלס|חלבה|מרשמלו|ממתק|קינדר|מקופלת|פסק זמן|כיף כף|לקקן|טבלת|פרלינ|מרציפן|נוגט|קראנץ|בינס)' OR n ~ '(^|[^א-ת])ופל' THEN 'snacks'
    WHEN n ~ '(משקה|מיץ|מיצוי|נקטר|לימונדה|קולה|פפסי|ספרייט|מירינדה|פאנטה|שוופס|סודה|נביעות|מי עדן|בירה|בירות|וודקה|ויסקי|ליקר|קוניאק|טקילה|מרלו|קברנה|שרדונה|סוביניון|מוסקטו|למברוסקו|שמפניה|יקב|קפה|אספרסו|קפסולות|חליטת|חליטה|אייס|פריגת|תפוזינה|ספרינג|פחית|פחיות|קינלי|רד בול|אנרגיה)'
      OR n ~ '(^|[^א-ת])(מים|יין|תה|ערק|רום|נס)([^א-ת]|$)' THEN 'drinks'
    WHEN n ~ '(^|[^ס])חלב' OR n ~ '(גבינ|גב\.|יוגורט|לבנה|שמנת|חמאה|קוטג|מעדן|ביצים|ביצה|דנונה|יופלה|בולגרית|צפתית|מוצרלה|פרמזן|ריקוטה|מסקרפונה|מילקי|פודינג|שוקו|פטה|קפיר|נעם|טל העמק|עמק|גילי|אשל)' THEN 'dairy_eggs'
    WHEN n ~ '(עוף|כבש|הודו|שניצל|קציצ|נקניק|פילה|סלמון|אמנון|לברק|דניס|בורי|מוסר|בקלה|הרינג|מטיאס|כתף|צלי|אנטריקוט|סינטה|פרגית|חזה|שוקיים|כנפיים|קבב|המבורגר|כבד|אוסובוקו|זרוע|פיקניה|שייטל|ספריבס|טחון|נתחי|פסטרמה|סלמי|קורנדביף|אסאדו|מוכשר|צלעות|צלע|כרעיים|ירכיים|פרגיות|שווארמה|שוארמה|קורקבן|לבבות|אווז|ברווז|עגל|סטייק)'
      OR n ~ '(^|[^א-ת])(דג|דגים|בקר)([^א-ת]|$)' THEN 'meat_fish'
    WHEN n ~ '(אורז|פסטה|ספגטי|מקרוני|קמח|סוכר|מלח|טונה|שימור|משומר|בסירופ|עדשים|שעועית|חומוס|גרגירי|אפונה|קטניות|תבלין|פפריקה|קינמון|כמון|כורכום|זעתר|אורגנו|בזיליקום|רוטב|קטשופ|מיונז|חרדל|טחינה|דבש|ריבה|ממרח|נוטלה|גרנולה|שיבולת שועל|קורנפלקס|דגני|אגוז|שקדים|צימוקים|פקאן|קשיו|פיסטוק|גרעיני|זרעי|שומשום|זיתים|חמוצים|קוסקוס|בורגול|קינואה|פתיתים|אטריות|מרק|אבקת|תמצית|שמרים|קקאו|מלבי|תערובת|שמן|חומץ|סויה|תמרים|מיובשים|פירורי|קרוטונים|ג''לי|ג׳לי|רסק|נודלס|בצק|מטבוחה|נאצ''וס|נאצ׳וס)' OR n ~ '(^|[^א-ת])פנה([^א-ת]|$)' THEN 'pantry'
    WHEN n ~ '(עגבני|מלפפון|בצל|תפוח אדמה|תפוחי אדמה|תפו"א|בטטה|גזר|חסה|כרוב|פלפל|חציל|קישוא|דלעת|ברוקולי|כרובית|תפוז|תפוח|בננה|ענב|אבטיח|מלון|אפרסק|נקטרינה|שזיף|אגס|לימון|אבוקדו|תות|אוכמניות|פטל|דובדבן|מנגו|אננס|קיווי|רימון|אשכולית|קלמנטינה|פטרוזיליה|כוסברה|שמיר|נענע|סלרי|תירס|פטריות|פטריית|ירקות|ירק|פירות|סלק|צנון|קולרבי|שטוף|לקט|נבטים|ג''ינג''ר|ג׳ינג׳ר|זנגביל|ארטישוק|שומר|כרישה|סלט)'
      OR n ~ '(^|[^א-ת])שום([^א-ת]|$)' THEN 'produce'
    ELSE 'other'
  END
  FROM (SELECT coalesce(p_name, '') AS n) x;
$$;

UPDATE public.products SET category = public.categorize_product(name_he);

CREATE OR REPLACE FUNCTION public.set_product_category()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.category := public.categorize_product(NEW.name_he);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_set_category ON public.products;
CREATE TRIGGER products_set_category
  BEFORE INSERT OR UPDATE OF name_he ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_product_category();

-- Household membership check usable from RLS without recursive policies.
CREATE OR REPLACE FUNCTION public.is_household_member(p_household uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_members
                 WHERE household_id = p_household AND user_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid) TO authenticated;

-- ─── List items ─────────────────────────────────────────────────────────────
ALTER TABLE public.basket_items
  ADD COLUMN IF NOT EXISTS checked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS custom_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ─── Household edits to catalog products ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_overrides (
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name         TEXT,
  category     TEXT,
  price        NUMERIC(10,2),
  image_url    TEXT,
  updated_by   UUID DEFAULT auth.uid(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, product_id)
);
ALTER TABLE public.product_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "household members manage overrides" ON public.product_overrides;
CREATE POLICY "household members manage overrides" ON public.product_overrides
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- ─── Shopping trips ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shopping_trips (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
  chain_id     TEXT REFERENCES public.chains(id),
  store_label  TEXT,
  done_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  est_total    NUMERIC(10,2) NOT NULL DEFAULT 0,
  item_count   INT NOT NULL DEFAULT 0,
  priced_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS shopping_trips_household_idx ON public.shopping_trips(household_id, done_at DESC);
CREATE INDEX IF NOT EXISTS shopping_trips_user_idx ON public.shopping_trips(user_id, done_at DESC);

CREATE TABLE IF NOT EXISTS public.trip_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES public.shopping_trips(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  category     TEXT,
  quantity     NUMERIC NOT NULL DEFAULT 1,
  unit_price   NUMERIC(10,2),
  price_source TEXT NOT NULL DEFAULT 'none' CHECK (price_source IN ('chain', 'custom', 'cheapest', 'none'))
);
CREATE INDEX IF NOT EXISTS trip_items_trip_idx ON public.trip_items(trip_id);

ALTER TABLE public.shopping_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "see own and household trips" ON public.shopping_trips;
CREATE POLICY "see own and household trips" ON public.shopping_trips FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (household_id IS NOT NULL AND public.is_household_member(household_id)));
DROP POLICY IF EXISTS "create own trips" ON public.shopping_trips;
CREATE POLICY "create own trips" ON public.shopping_trips FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (household_id IS NULL OR public.is_household_member(household_id)));
DROP POLICY IF EXISTS "delete own trips" ON public.shopping_trips;
CREATE POLICY "delete own trips" ON public.shopping_trips FOR DELETE TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "see items of visible trips" ON public.trip_items;
CREATE POLICY "see items of visible trips" ON public.trip_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shopping_trips t WHERE t.id = trip_id));
DROP POLICY IF EXISTS "add items to own trips" ON public.trip_items;
CREATE POLICY "add items to own trips" ON public.trip_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.shopping_trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));

-- ─── Item photos ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('item-photos', 'item-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "item photos: upload own folder" ON storage.objects;
CREATE POLICY "item photos: upload own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "item photos: delete own" ON storage.objects;
CREATE POLICY "item photos: delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'item-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Debug status: add trips ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.debug_db_stats()
RETURNS JSON LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT json_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'db_limit_bytes', 500 * 1024 * 1024,
    'tables', (SELECT json_object_agg(relname, json_build_object('rows', reltuples::bigint, 'bytes', pg_total_relation_size(oid)))
               FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'),
    'chains', (SELECT json_agg(json_build_object(
                 'id', c.id, 'status', c.status,
                 'prices', (SELECT count(*) FROM chain_prices cp WHERE cp.chain_id = c.id),
                 'last_price_at', (SELECT max(captured_at) FROM chain_prices cp WHERE cp.chain_id = c.id),
                 'last_ingest', (SELECT json_build_object('started_at', l.started_at, 'finished_at', l.finished_at,
                                   'fetched', l.products_fetched, 'matched', l.products_matched, 'error', l.error_text)
                                 FROM ingest_log l WHERE l.chain_id = c.id ORDER BY l.started_at DESC LIMIT 1)
               ) ORDER BY c.status, c.id) FROM chains c),
    'categories', (SELECT json_object_agg(coalesce(category, 'none'), n) FROM (SELECT category, count(*) n FROM products GROUP BY 1) x),
    'trips', (SELECT count(*) FROM shopping_trips),
    'overrides', (SELECT count(*) FROM product_overrides),
    'tracked_products', (SELECT count(*) FROM tracked_products),
    'monthly_rows', (SELECT count(*) FROM product_price_monthly),
    'months', (SELECT json_agg(m ORDER BY m) FROM (SELECT DISTINCT month m FROM product_price_monthly) x)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.debug_db_stats() FROM anon, authenticated, public;
