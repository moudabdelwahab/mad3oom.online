-- اختبار تنفيذي لـ migrations/011 (تصنيف الإشعارات) و012 (إعادة فتح التذكرة).
--
-- الاتنين بيغيّروا سلوكًا في قاعدة البيانات نفسها، فلازم يتّختبروا على
-- Postgres حقيقي مش في المتصفح:
--   011: العمود بيتملأ تلقائيًا للصفوف القديمة والجديدة، والاشتقاق صحيح.
--   012: ردّ العميل بيعيد فتح التذكرة المحلولة **فقط**، ومن غير ما يفتح
--        ثغرة تخليه يعدّل الحالة بنفسه.
\set ON_ERROR_STOP on
\pset tuples_only on

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.profiles (
  id    uuid PRIMARY KEY,
  email text,
  role  text NOT NULL DEFAULT 'user'
);

CREATE TABLE public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  title        text,
  message      text,
  type         text DEFAULT 'info',
  is_read      boolean DEFAULT false,
  link         text,
  created_at   timestamptz DEFAULT now(),
  reference_id uuid
);

CREATE TABLE public.tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  title            text,
  status           text NOT NULL DEFAULT 'open',
  reopen_count     integer DEFAULT 0,
  last_reopened_at timestamptz,
  resolved_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE public.ticket_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL,
  user_id     uuid NOT NULL,
  message     text,
  is_internal boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
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

-- نسخة مطابقة من مسجّلات التغيير في الإنتاج: 012 بيعتمد عليها في
-- تحديث العدّاد وكتابة حدث reopen، فلازم تكون موجودة هنا كما هي.
CREATE OR REPLACE FUNCTION public.log_ticket_changes_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('resolved','rejected','confirmed') AND NEW.status IN ('open','in-progress') THEN
      NEW.reopen_count := COALESCE(OLD.reopen_count, 0) + 1;
      NEW.last_reopened_at := now();
    END IF;
    IF NEW.status IN ('resolved','confirmed') AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.log_ticket_changes_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('resolved','rejected','confirmed') AND NEW.status IN ('open','in-progress') THEN
      INSERT INTO public.ticket_activity(ticket_id, actor_id, action_type, from_value, to_value)
      VALUES (NEW.id, actor, 'reopen', OLD.status, NEW.status);
    END IF;
    INSERT INTO public.ticket_activity(ticket_id, actor_id, action_type, from_value, to_value)
    VALUES (NEW.id, actor, 'status_change', OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_ticket_changes_before BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION log_ticket_changes_before();
CREATE TRIGGER trg_log_ticket_changes_after AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION log_ticket_changes_after();

-- القيدان الحقيقيان: الاتنين موجودان في الإنتاج على نفس الجدول، والاتنين
-- بيمنعا العميل من تغيير الحالة. لازم يتنمذجوا هنا سوا عشان الاختبار يثبت
-- إن مسار إعادة الفتح بيعدّي منهما فعلاً.
CREATE OR REPLACE FUNCTION public.enforce_customer_ticket_update_restrictions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE is_admin boolean;
BEGIN
  IF current_setting('app.bypass_ticket_restrictions', true) = 'on' THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') INTO is_admin;
  IF COALESCE(is_admin, false) THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'غير مسموح للعميل بتعديل هذا الحقل في التذكرة';
  END IF;
  RETURN NEW;
END; $$;

-- النسخة الأصلية بدون بوابة تجاوز — migrations/012 هو اللي بيضيفها
CREATE OR REPLACE FUNCTION public.restrict_customer_ticket_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE is_caller_admin boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') INTO is_caller_admin;
  IF is_caller_admin THEN RETURN NEW; END IF;
  IF auth.uid() = OLD.user_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'العميل غير مسموح له بتعديل هذه الحقول، يمكنه فقط أرشفة التذكرة';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_customer_ticket_update BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION enforce_customer_ticket_update_restrictions();
CREATE TRIGGER trg_restrict_customer_ticket_update BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION restrict_customer_ticket_update();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;

INSERT INTO public.profiles (id, email, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'customer@example.com', 'user'),
  ('99999999-9999-4999-8999-999999999999', 'admin@example.com',    'admin');

-- صفوف قديمة موجودة قبل الترحيل (category لسه مش موجود كعمود)
INSERT INTO public.notifications (id, user_id, title, message, type, link) VALUES
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'رد جديد على تذكرتك', 'رد الدعم', 'success', 'customer-dashboard.html?ticket=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   '🎫 شارة جديدة: أول تذكرة', 'مبروك', 'success', '/customer-dashboard.html'),
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'تم رفض طلب اشتراكك', 'راجع التفاصيل', 'info', '/customer-subscriptions.html'),
  ('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'رصيد الواتساب منخفض', 'اشحن رصيدك', 'warning', NULL),
  ('a0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   'رسالة جديدة من الدعم الفني', 'محادثة', 'chat', '/chat-customer.html'),
  ('a0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111',
   'تم تغيير كلمة المرور', 'من جهاز جديد', 'info', NULL),
  ('a0000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111',
   'تنبيه عام', 'رسالة بلا تصنيف واضح', 'info', NULL);

\echo '--- applying migrations/011 ---'
\i migrations/011_notification_categories.sql

\echo ''
\echo '=== A) الصفوف القديمة اتصنّفت بأثر رجعي ==='
DO $$
DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.notifications WHERE category IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A1: % صف بلا تصنيف بعد الترحيل', n; END IF;
  RAISE NOTICE 'PASS A1: كل الصفوف القديمة اتصنّفت';
END $$;

DO $$
DECLARE v text; BEGIN
  SELECT category INTO v FROM public.notifications WHERE id='a0000000-0000-4000-8000-000000000001';
  IF v <> 'tickets' THEN RAISE EXCEPTION 'FAIL A2: رابط التذكرة اتصنّف %', v; END IF;

  SELECT category INTO v FROM public.notifications WHERE id='a0000000-0000-4000-8000-000000000002';
  IF v <> 'rewards' THEN RAISE EXCEPTION 'FAIL A2: الشارة اتصنّفت %', v; END IF;

  SELECT category INTO v FROM public.notifications WHERE id='a0000000-0000-4000-8000-000000000003';
  IF v <> 'subscription' THEN RAISE EXCEPTION 'FAIL A2: الاشتراك اتصنّف %', v; END IF;

  SELECT category INTO v FROM public.notifications WHERE id='a0000000-0000-4000-8000-000000000004';
  IF v <> 'billing' THEN RAISE EXCEPTION 'FAIL A2: الرصيد اتصنّف %', v; END IF;

  SELECT category INTO v FROM public.notifications WHERE id='a0000000-0000-4000-8000-000000000005';
  IF v <> 'chat' THEN RAISE EXCEPTION 'FAIL A2: المحادثة اتصنّفت %', v; END IF;

  SELECT category INTO v FROM public.notifications WHERE id='a0000000-0000-4000-8000-000000000006';
  IF v <> 'security' THEN RAISE EXCEPTION 'FAIL A2: الأمان اتصنّف %', v; END IF;

  SELECT category INTO v FROM public.notifications WHERE id='a0000000-0000-4000-8000-000000000007';
  IF v <> 'system' THEN RAISE EXCEPTION 'FAIL A2: الافتراضي اتصنّف %', v; END IF;

  RAISE NOTICE 'PASS A2: الاشتقاق صحيح لكل الأنماط الحقيقية';
END $$;

\echo ''
\echo '=== B) الإشعارات الجديدة تتصنّف تلقائيًا بدون تعديل المُرسِلين ==='
DO $$
DECLARE v text; BEGIN
  -- نفس شكل النداء الحالي من createNotification() بدون category
  INSERT INTO public.notifications (id, user_id, title, message, type, link)
  VALUES ('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
          'تحديث حالة التذكرة', 'تم الحل', 'success',
          'customer-dashboard.html?ticket=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  SELECT category INTO v FROM public.notifications WHERE id='b0000000-0000-4000-8000-000000000001';
  IF v <> 'tickets' THEN RAISE EXCEPTION 'FAIL B1: الإدراج الجديد اتصنّف %', v; END IF;
  RAISE NOTICE 'PASS B1: الـtrigger بيملأ التصنيف تلقائيًا';

  -- مُرسِل صريح: التصنيف الممرَّر بيتحترم ومش بيتكتب فوقه
  INSERT INTO public.notifications (id, user_id, title, message, type, category)
  VALUES ('b0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
          'أي عنوان', 'أي رسالة', 'info', 'sie');
  SELECT category INTO v FROM public.notifications WHERE id='b0000000-0000-4000-8000-000000000002';
  IF v <> 'sie' THEN RAISE EXCEPTION 'FAIL B2: التصنيف الصريح اتكتب فوقه بـ%', v; END IF;
  RAISE NOTICE 'PASS B2: التصنيف الصريح له الأولوية';

  -- تصنيف فاضي = زي الغياب
  INSERT INTO public.notifications (id, user_id, title, message, type, category)
  VALUES ('b0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
          'رصيد الواتساب منخفض', 'x', 'warning', '   ');
  SELECT category INTO v FROM public.notifications WHERE id='b0000000-0000-4000-8000-000000000003';
  IF v <> 'billing' THEN RAISE EXCEPTION 'FAIL B3: التصنيف الفاضي اتحسب %', v; END IF;
  RAISE NOTICE 'PASS B3: التصنيف الفاضي يُشتق تلقائيًا';
END $$;

\echo ''
\echo '--- applying migrations/012 ---'
\i migrations/012_customer_reopen_ticket.sql

INSERT INTO public.tickets (id, user_id, title, status) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'تذكرة محلولة', 'resolved'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'تذكرة مكتملة', 'confirmed'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'تذكرة مرفوضة', 'rejected'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'تذكرة مفتوحة', 'open'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'محلولة لاختبار ردّ الموظف', 'resolved'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', 'محلولة لاختبار الردّ الداخلي', 'resolved');

\echo ''
\echo '=== C) ردّ العميل يعيد فتح المحلولة فقط ==='
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

DO $$
DECLARE v text; c int; BEGIN
  INSERT INTO public.ticket_replies (ticket_id, user_id, message)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'المشكلة رجعت');

  SELECT status, reopen_count INTO v, c FROM public.tickets WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF v <> 'open' THEN RAISE EXCEPTION 'FAIL C1: التذكرة المحلولة ما اتفتحتش (الحالة %)', v; END IF;
  IF c <> 1 THEN RAISE EXCEPTION 'FAIL C1: عدّاد إعادة الفتح %', c; END IF;
  RAISE NOTICE 'PASS C1: ردّ العميل أعاد فتح التذكرة المحلولة وزوّد العدّاد';

  SELECT count(*) INTO c FROM public.ticket_activity
   WHERE ticket_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND action_type='reopen';
  IF c <> 1 THEN RAISE EXCEPTION 'FAIL C2: حدث reopen ما اتسجّلش (%)', c; END IF;
  RAISE NOTICE 'PASS C2: حدث reopen اتسجّل عبر المسجّلات الموجودة';
END $$;

DO $$
DECLARE v text; BEGIN
  INSERT INTO public.ticket_replies (ticket_id, user_id, message)
  VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'تعليق');
  SELECT status INTO v FROM public.tickets WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF v <> 'confirmed' THEN RAISE EXCEPTION 'FAIL C3: التذكرة المكتملة اتفتحت (%)', v; END IF;

  INSERT INTO public.ticket_replies (ticket_id, user_id, message)
  VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'تعليق');
  SELECT status INTO v FROM public.tickets WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  IF v <> 'rejected' THEN RAISE EXCEPTION 'FAIL C3: التذكرة المرفوضة اتفتحت (%)', v; END IF;

  RAISE NOTICE 'PASS C3: المكتملة والمرفوضة ما بيتفتحوش بردّ';
END $$;

DO $$ BEGIN
  -- بعد فتح بوابة التجاوز، العميل نفسه لازم يفضل ممنوع من تغيير الحالة يدويًا
  UPDATE public.tickets SET status='resolved' WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  RAISE EXCEPTION 'FAIL C4: العميل قدر يغيّر الحالة مباشرةً';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL C4%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS C4: العميل ما زال ممنوعًا من تعديل الحالة مباشرةً';
END $$;

DO $$
DECLARE v text; BEGIN
  -- وبوابة التجاوز نفسها مقفولة بعد ما الـtrigger خلّص
  SELECT current_setting('app.bypass_ticket_restrictions', true) INTO v;
  IF v = 'on' THEN RAISE EXCEPTION 'FAIL C4b: بوابة التجاوز فضلت مفتوحة'; END IF;
  RAISE NOTICE 'PASS C4b: بوابة التجاوز تُقفل بعد الاستخدام مباشرةً';
END $$;

DO $$
DECLARE v text; BEGIN
  -- ردّ الموظف على تذكرة محلولة ما بيفتحهاش (قرار الموظف من لوحته)
  INSERT INTO public.ticket_replies (ticket_id, user_id, message)
  VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '99999999-9999-4999-8999-999999999999', 'رد الدعم');
  SELECT status INTO v FROM public.tickets WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  IF v <> 'resolved' THEN RAISE EXCEPTION 'FAIL C5: ردّ الموظف أعاد الفتح (%)', v; END IF;
  RAISE NOTICE 'PASS C5: ردّ الموظف لا يعيد الفتح';
END $$;

DO $$
DECLARE v text; BEGIN
  INSERT INTO public.ticket_replies (ticket_id, user_id, message, is_internal)
  VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', 'ملاحظة', true);
  SELECT status INTO v FROM public.tickets WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff';
  IF v <> 'resolved' THEN RAISE EXCEPTION 'FAIL C6: الردّ الداخلي أعاد الفتح (%)', v; END IF;
  RAISE NOTICE 'PASS C6: الردّ الداخلي متجاهَل';
END $$;

\echo ''
\echo 'ALL CUSTOMER PORTAL MIGRATION TESTS PASSED'
