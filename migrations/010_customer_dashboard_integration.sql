-- ============================================================================
-- 010_customer_dashboard_integration.sql
--   ربط لوحة العميل فعليًا بإعدادات لوحة الإدارة (بدون فتح أي بيانات إدارية)
--
-- المشكلة (تم إثباتها بالفحص قبل التعديل)
--   1) لوحة الإدارة بتكتب في advanced_settings مفاتيح مخصّصة أصلًا للعميل:
--        - customer_experience  (رسالة الترحيب، تفعيل المكافآت، السماح بالمرفقات،
--                                السماح بالتقييم، إظهار حالة الدعم)
--        - sla_config           (أهداف زمن الرد)
--        - communication_control(أقصى عدد تذاكر مفتوحة، منع التذاكر المكررة)
--        - data_retention       (مدة الاحتفاظ بالتذاكر)
--        - branding             (اسم المنصة/اللون)
--      ولا يقرأها أي كود في لوحة العميل — الإعدادات دي فعليًا "بتتحفظ وبس".
--      السبب إن RLS على advanced_settings بيقصر القراءة على الأدمن (ما عدا
--      registration_mode)، وهو قرار صحيح لأن نفس الجدول فيه
--      ticket_notify_function_secret و accounting_integration.
--
--      => الحل مش فتح الجدول، لكن دالة SECURITY DEFINER بترجّع الحقول
--         الآمنة للعميل فقط (allow-list صريحة)، فتفضل الأسرار محجوبة.
--
--   2) working_hours (ساعات عمل الدعم) admin-only برضه، والعميل مش شايف
--      إمتى الدعم متاح. نفس الدالة بترجّعها (بدون auto_reply_text الداخلي).
--
--   3) ticket_activity: سياسة SELECT الوحيدة كانت للـstaff فقط، رغم إن كود
--      لوحة العميل بينده fetchTicketActivity() ويرسم "سجل التذكرة".
--      النتيجة: السجل بيرجع فاضي دايمًا للعميل (ميزة ميتة).
--      => سياسة جديدة تسمح لصاحب التذكرة يقرأ سجل تذكرته هو فقط،
--         مع استثناء أنواع الأحداث الداخلية على مستوى قاعدة البيانات
--         (مش فلترة في الواجهة زي دلوقتي — الفلترة في الواجهة تجميل مش أمان).
--
-- ما الذي لم يتغيّر
--   * مفيش أي سياسة قديمة اتشالت أو اتعدلت — إضافة فقط.
--   * advanced_settings و working_hours فضلوا admin-only بالكامل.
--   * صلاحيات الـstaff على ticket_activity زي ما هي.
-- ============================================================================

-- ── 1) الإعدادات الآمنة للعميل ──────────────────────────────────────────────
-- SECURITY DEFINER عشان تعدي RLS الإدارية، لكنها بترجّع allow-list ثابتة
-- مكتوبة بالاسم — أي مفتاح جديد يضيفه الأدمن في advanced_settings مش هيتسرّب
-- من هنا تلقائيًا. مفيش أي مُعامل input، فمفيش سطح لتمرير مفاتيح تانية.
create or replace function public.get_customer_platform_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_customer_exp jsonb;
  v_sla          jsonb;
  v_comm         jsonb;
  v_retention    jsonb;
  v_branding     jsonb;
  v_hours        jsonb;
  v_today        int;
  v_now_time     time;
  v_online       boolean := false;
begin
  -- مسموح فقط للمستخدمين المسجّلين (مش anon)
  if auth.uid() is null then
    return null;
  end if;

  select value into v_customer_exp from advanced_settings where key = 'customer_experience';
  select value into v_sla          from advanced_settings where key = 'sla_config';
  select value into v_comm         from advanced_settings where key = 'communication_control';
  select value into v_retention    from advanced_settings where key = 'data_retention';
  select value into v_branding     from advanced_settings where key = 'branding';

  -- ساعات العمل: الحقول المعروضة للعميل فقط.
  -- auto_reply_text و transfer_to_bot إعدادات تشغيل داخلية ومش بتترجّع.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'day_of_week',    wh.day_of_week,
               'is_working_day', wh.is_working_day,
               'start_time',     wh.start_time,
               'end_time',       wh.end_time
             ) order by wh.day_of_week
           ),
           '[]'::jsonb
         )
    into v_hours
    from working_hours wh;

  -- هل الدعم متاح دلوقتي؟ الحساب هنا (سيرفر) عشان ميعتمدش على ساعة الجهاز.
  v_today    := extract(dow from now())::int;
  v_now_time := now()::time;
  select coalesce(bool_or(
           wh.is_working_day
           and v_now_time >= wh.start_time
           and v_now_time <  wh.end_time
         ), false)
    into v_online
    from working_hours wh
   where wh.day_of_week = v_today;

  return jsonb_build_object(
    'customer_experience', jsonb_build_object(
      'welcome_message',           coalesce(v_customer_exp->>'customer_welcome_message', ''),
      'enable_rewards_system',     coalesce((v_customer_exp->>'enable_rewards_system')::boolean, true),
      'allow_ticket_attachments',  coalesce((v_customer_exp->>'allow_ticket_attachments')::boolean, true),
      'allow_ticket_rating',       coalesce((v_customer_exp->>'allow_ticket_rating')::boolean, true),
      'show_support_online_status',coalesce((v_customer_exp->>'show_support_online_status')::boolean, true),
      'support_whatsapp',          coalesce(v_customer_exp->>'support_whatsapp', '')
    ),
    'sla', jsonb_build_object(
      'enabled',      coalesce((v_sla->>'enabled')::boolean, false),
      'high_hours',   nullif(v_sla->>'high_hours','')::numeric,
      'medium_hours', nullif(v_sla->>'medium_hours','')::numeric,
      'low_hours',    nullif(v_sla->>'low_hours','')::numeric
    ),
    -- الحدود اللي العميل محتاج يعرفها قبل ما يفتح تذكرة. banned_words متعمّد
    -- إنها مش هنا: قايمة الكلمات الممنوعة معلومة تشغيل داخلية.
    'limits', jsonb_build_object(
      'max_open_tickets',          nullif(v_comm->>'max_open_tickets','')::int,
      'prevent_duplicate_tickets', coalesce((v_comm->>'prevent_duplicate_tickets')::boolean, false),
      'ticket_retention_days',     case when coalesce((v_retention->>'enabled')::boolean, false)
                                        then nullif(v_retention->>'ticket_retention_days','')::int
                                        else null end
    ),
    'branding', jsonb_build_object(
      'site_name',     coalesce(nullif(v_branding->>'site_name',''), 'مدعوم'),
      'primary_color', coalesce(nullif(v_branding->>'primary_color',''), '#0077CC')
    ),
    'support', jsonb_build_object(
      'working_hours', v_hours,
      'is_online_now', v_online
    )
  );
end;
$function$;

comment on function public.get_customer_platform_settings() is
  'الإعدادات التي يضبطها الأدمن ويجب أن يراها العميل (allow-list صريحة). لا تُرجع أي أسرار من advanced_settings.';

revoke all on function public.get_customer_platform_settings() from public, anon;
grant execute on function public.get_customer_platform_settings() to authenticated;


-- ── 2) العميل يقرأ سجل تذكرته هو ────────────────────────────────────────────
-- الأحداث الداخلية (تعيين موظف / ملاحظة داخلية) مستثناة هنا في القاعدة نفسها،
-- مش في الواجهة، عشان متبقاش مجرد فلترة شكلية.
drop policy if exists "Owner can view own ticket activity" on public.ticket_activity;
create policy "Owner can view own ticket activity"
  on public.ticket_activity
  for select
  using (
    action_type not in ('assignee_change', 'assigned', 'internal_note')
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_activity.ticket_id
        and t.user_id = auth.uid()
    )
  );
