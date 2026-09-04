-- اختبار تنفيذي لـ migrations/010_customer_dashboard_integration.sql
--
-- بيبني نموذج مصغّر للجزء المعني من قاعدة البيانات الحقيقية (auth.uid()
-- المستخرَجة من الـJWT، وadvanced_settings بسياسته الحقيقية، وworking_hours،
-- وtickets/ticket_activity بسياساتهم) وبيثبّت حاجتين:
--
--   1) get_customer_platform_settings() بترجّع للعميل الإعدادات المسموح بيها
--      فقط، ومش بتسرّب أي سر من advanced_settings مهما كان في الجدول.
--   2) العميل يقرأ سجل تذكرته هو، مش سجل تذاكر غيره، ومن غير الأحداث
--      الداخلية (ملاحظة داخلية / تعيين موظف).
\set ON_ERROR_STOP on
\pset tuples_only on

CREATE SCHEMA IF NOT EXISTS auth;

-- تعريف Supabase الحقيقي
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.profiles (
  id    uuid PRIMARY KEY,
  email text,
  role  text NOT NULL DEFAULT 'user'
);

CREATE TABLE public.advanced_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,
  value       jsonb,
  description text,
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE public.working_hours (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week     int NOT NULL,
  is_working_day  boolean NOT NULL DEFAULT true,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  auto_reply_text text,
  transfer_to_bot boolean DEFAULT false
);

CREATE TABLE public.tickets (
  id      uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  title   text
);

CREATE TABLE public.ticket_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL,
  actor_id    uuid,
  action_type text NOT NULL,
  from_value  text,
  to_value    text,
  created_at  timestamptz DEFAULT now()
);

-- أدوار Supabase (موجودة في الإنتاج، ننشئها هنا قبل أي سياسة تشير إليها)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
END $$;

-- السياسات الحقيقية (المنسوخة من الإنتاج) قبل تطبيق الترحيل
ALTER TABLE public.advanced_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage advanced_settings" ON public.advanced_settings
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY advanced_settings_public_read_registration_mode ON public.advanced_settings
  FOR SELECT TO anon, authenticated USING (key = 'registration_mode');

ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage working_hours" ON public.working_hours
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_select_policy ON public.tickets
  FOR SELECT USING (user_id = auth.uid());

ALTER TABLE public.ticket_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view activity" ON public.ticket_activity
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND role = ANY (ARRAY['admin','support','super_user'])));

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, anon;

INSERT INTO public.profiles (id, email, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'customer@example.com', 'user'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.com',    'user');

INSERT INTO public.advanced_settings (key, value) VALUES
  ('customer_experience', '{"customer_welcome_message":"أهلاً","enable_rewards_system":false,"allow_ticket_attachments":false,"allow_ticket_rating":true,"show_support_online_status":true,"support_whatsapp":"201234567890"}'),
  ('sla_config',          '{"enabled":true,"high_hours":"1","medium_hours":"2","low_hours":"4"}'),
  ('communication_control','{"banned_words":"كلمة-سرية-ممنوعة","max_open_tickets":"5","prevent_duplicate_tickets":true}'),
  ('data_retention',      '{"enabled":true,"ticket_retention_days":"365"}'),
  ('branding',            '{"site_name":"","primary_color":"#03cc00"}'),
  -- السرّان اللي لازم ما يوصلوش للعميل بأي حال
  ('ticket_notify_function_secret', '"21ea327a762d9318b37c8a5e11b205802fa08fdd62fce31a2a3ccb65e3b7abac"'),
  ('accounting_integration', '{"billing_author_id":"dcd13822-d424-460d-9ad7-9bb5b8ab270f"}');

INSERT INTO public.working_hours (day_of_week, is_working_day, start_time, end_time, auto_reply_text)
SELECT d, d <> 5, '09:00', '17:00', 'نص رد آلي داخلي' FROM generate_series(0,6) d;

INSERT INTO public.tickets (id, user_id, title) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'تذكرة العميل'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'تذكرة عميل آخر');

INSERT INTO public.ticket_activity (ticket_id, action_type) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'create'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'status_change'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'internal_note'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'assignee_change'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'assigned'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'create');

\echo '--- applying migrations/010 ---'
\i migrations/010_customer_dashboard_integration.sql

\echo ''
\echo '=== A) العميل: يقرأ الإعدادات المسموح بها عبر الدالة فقط ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

DO $$
DECLARE s jsonb; BEGIN
  s := public.get_customer_platform_settings();
  IF s IS NULL THEN RAISE EXCEPTION 'FAIL A1: الدالة رجّعت NULL لمستخدم مسجّل'; END IF;
  IF s->'customer_experience'->>'welcome_message' <> 'أهلاً' THEN
    RAISE EXCEPTION 'FAIL A1: رسالة الترحيب لم تصل'; END IF;
  IF (s->'customer_experience'->>'enable_rewards_system')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL A1: إطفاء المكافآت لم ينتقل'; END IF;
  IF (s->'customer_experience'->>'allow_ticket_attachments')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL A1: إطفاء المرفقات لم ينتقل'; END IF;
  RAISE NOTICE 'PASS A1: إعدادات تجربة العميل تصل كما ضبطها الأدمن';
END $$;

DO $$
DECLARE s jsonb; BEGIN
  s := public.get_customer_platform_settings();
  IF (s->'sla'->>'enabled')::boolean IS DISTINCT FROM true
     OR (s->'sla'->>'high_hours')::numeric <> 1
     OR (s->'sla'->>'medium_hours')::numeric <> 2 THEN
    RAISE EXCEPTION 'FAIL A2: أهداف SLA لم تصل بشكل صحيح'; END IF;
  IF (s->'limits'->>'max_open_tickets')::int <> 5
     OR (s->'limits'->>'prevent_duplicate_tickets')::boolean IS DISTINCT FROM true
     OR (s->'limits'->>'ticket_retention_days')::int <> 365 THEN
    RAISE EXCEPTION 'FAIL A2: حدود التواصل لم تصل بشكل صحيح'; END IF;
  RAISE NOTICE 'PASS A2: SLA والحدود تصل كما ضبطها الأدمن';
END $$;

DO $$
DECLARE s jsonb; BEGIN
  s := public.get_customer_platform_settings();
  IF jsonb_array_length(s->'support'->'working_hours') <> 7 THEN
    RAISE EXCEPTION 'FAIL A3: ساعات العمل لم تصل (الجدول admin-only)'; END IF;
  IF s::text LIKE '%نص رد آلي داخلي%' THEN
    RAISE EXCEPTION 'FAIL A3: نص الرد الآلي الداخلي تسرّب للعميل'; END IF;
  IF s->'branding'->>'site_name' <> 'مدعوم' THEN
    RAISE EXCEPTION 'FAIL A3: الاسم الافتراضي لم يُطبَّق عند فراغ الإعداد'; END IF;
  RAISE NOTICE 'PASS A3: ساعات العمل تصل بدون الحقول الداخلية';
END $$;

\echo ''
\echo '=== B) العميل: لا يصل لأي سر في advanced_settings ==='
DO $$
DECLARE s jsonb; leaked int; BEGIN
  s := public.get_customer_platform_settings();
  IF s::text LIKE '%21ea327a762d9318b37c8a5e11b2058%' THEN
    RAISE EXCEPTION 'FAIL B1: سر دالة الإشعارات تسرّب عبر الدالة'; END IF;
  IF s::text LIKE '%billing_author_id%' THEN
    RAISE EXCEPTION 'FAIL B1: إعداد المحاسبة تسرّب عبر الدالة'; END IF;
  IF s::text LIKE '%كلمة-سرية-ممنوعة%' THEN
    RAISE EXCEPTION 'FAIL B1: قائمة الكلمات الممنوعة تسرّبت عبر الدالة'; END IF;
  RAISE NOTICE 'PASS B1: لا أسرار في مخرجات الدالة';

  -- القراءة المباشرة للجدول لازم تفضل محجوبة كما هي
  SELECT count(*) INTO leaked FROM public.advanced_settings WHERE key <> 'registration_mode';
  IF leaked <> 0 THEN
    RAISE EXCEPTION 'FAIL B2: العميل قرأ % صف من advanced_settings مباشرة', leaked; END IF;
  RAISE NOTICE 'PASS B2: القراءة المباشرة لـadvanced_settings ما زالت محجوبة';

  SELECT count(*) INTO leaked FROM public.working_hours;
  IF leaked <> 0 THEN
    RAISE EXCEPTION 'FAIL B3: العميل قرأ working_hours مباشرة'; END IF;
  RAISE NOTICE 'PASS B3: القراءة المباشرة لـworking_hours ما زالت محجوبة';
END $$;

\echo ''
\echo '=== C) سجل التذكرة: العميل يرى سجل تذكرته فقط وبدون الأحداث الداخلية ==='
DO $$
DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.ticket_activity;
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL C1: العميل رأى % صف، والمتوقع 2 (create + status_change)', n; END IF;
  RAISE NOTICE 'PASS C1: العميل يرى أحداث تذكرته المسموح بها فقط';

  SELECT count(*) INTO n FROM public.ticket_activity
   WHERE action_type IN ('internal_note','assignee_change','assigned');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL C2: % حدث داخلي وصل للعميل', n; END IF;
  RAISE NOTICE 'PASS C2: الأحداث الداخلية محجوبة على مستوى القاعدة';

  SELECT count(*) INTO n FROM public.ticket_activity
   WHERE ticket_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL C3: العميل قرأ سجل تذكرة عميل آخر'; END IF;
  RAISE NOTICE 'PASS C3: لا وصول لسجل تذاكر عملاء آخرين';
END $$;

\echo ''
\echo '=== D) الزائر غير المسجّل لا يحصل على شيء ==='
RESET request.jwt.claim.sub;
DO $$
DECLARE s jsonb; BEGIN
  s := public.get_customer_platform_settings();
  IF s IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL D1: الدالة رجّعت بيانات لمستخدم غير مسجّل'; END IF;
  RAISE NOTICE 'PASS D1: لا بيانات لغير المسجّلين';
END $$;

RESET ROLE;

\echo ''
\echo '=== E) صلاحيات التنفيذ ==='
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.get_customer_platform_settings()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL E1: anon يقدر ينفّذ الدالة';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_customer_platform_settings()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL E2: authenticated لا يقدر ينفّذ الدالة';
  END IF;
  RAISE NOTICE 'PASS E: التنفيذ متاح للمسجّلين فقط';
END $$;

\echo ''
\echo 'ALL CUSTOMER DASHBOARD INTEGRATION TESTS PASSED'
