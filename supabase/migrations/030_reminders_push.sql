-- 030: reminders + web push (bell → Notifications panel, 2 Nov 2026).
--
-- push_subscriptions  one row per browser/phone that allowed notifications (own rows only).
-- reminders           per user: fill_list | shopping | plan_meals, on chosen weekdays
--                     (0 = Sunday) at a local time, Shabbat pause, language. Own rows only.
-- Every 10 minutes pg_cron asks the app to send what's due:
--   POST https://smart-grocery-il.vercel.app/api/reminders/run  (x-cron-secret)
-- The secret lives in Supabase Vault as 'reminders_cron_secret' (set once with
-- vault.create_secret; NOT written here) and must equal REMINDERS_CRON_SECRET in Vercel.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_ok_at  timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "own push subscriptions" ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.push_subscriptions FROM anon;

CREATE TABLE IF NOT EXISTS public.reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id  uuid REFERENCES public.households(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('fill_list', 'shopping', 'plan_meals')),
  enabled       boolean NOT NULL DEFAULT true,
  days          int[] NOT NULL DEFAULT '{}' CHECK (days <@ ARRAY[0,1,2,3,4,5,6]),
  at_time       time NOT NULL DEFAULT '18:00',
  tz            text NOT NULL DEFAULT 'Asia/Jerusalem',
  skip_shabbat  boolean NOT NULL DEFAULT true,
  lang          text NOT NULL DEFAULT 'he' CHECK (lang IN ('he', 'en')),
  last_sent_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own reminders" ON public.reminders;
CREATE POLICY "own reminders" ON public.reminders FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.reminders FROM anon;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Once, by hand:  SELECT vault.create_secret('<REMINDERS_CRON_SECRET>', 'reminders_cron_secret');

SELECT cron.unschedule('reminders-run') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reminders-run');
SELECT cron.schedule('reminders-run', '*/10 * * * *', $job$
  SELECT net.http_post(
    url := 'https://smart-grocery-il.vercel.app/api/reminders/run',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$job$);

INSERT INTO public.schema_migrations (version) VALUES ('030_reminders_push') ON CONFLICT DO NOTHING;
