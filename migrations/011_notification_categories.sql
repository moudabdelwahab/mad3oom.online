-- ============================================================================
-- 011_notification_categories.sql   —   تصنيف حقيقي للإشعارات
--
-- المشكلة
--   notifications.type بيحمل "شدّة" مش "مصدر": القيم الفعلية في الإنتاج هي
--   info / success / error / warning / chat / chat_start / subdomain.
--   يعني العميل مش قادر يعرف الإشعار جاي من تذكرة ولا اشتراك ولا رصيد واتساب.
--   وreference_id موجود كعمود لكنه NULL في كل الصفوف (0 من 1696).
--
--   الحل الغلط: نستنتج التصنيف من نص العنوان في الواجهة كل مرة (هشّ، ومكرر
--   في كل شاشة، وبيتكسر مع أي تغيير في الصياغة).
--
--   الحل هنا: عمود category حقيقي + دالة اشتقاق واحدة + trigger بيملاه
--   تلقائيًا عند الإدراج لو المُرسِل ما حدّدش. كده:
--     • الصفوف القديمة (1696) بتتعبّى بأثر رجعي مرة واحدة.
--     • الـ15 موضع اللي بينادوا createNotification ما يحتاجوش أي تعديل.
--     • أي مُرسِل جديد يقدر يمرّر category صراحةً ويتخطى الاشتقاق.
--
-- الأمان
--   مفيش تغيير في أي سياسة RLS. العمود بيتقرا بنفس سياسة الجدول الحالية
--   (المستخدم يقرأ إشعاراته هو فقط).
-- ============================================================================

alter table public.notifications
  add column if not exists category text;

comment on column public.notifications.category is
  'مصدر الإشعار (tickets/subscription/whatsapp/…) — مختلف عن type الذي يصف الشدّة. يُملأ تلقائيًا عبر trg_notifications_set_category.';

-- ── دالة الاشتقاق ───────────────────────────────────────────────────────────
-- IMMUTABLE ومبنية على المدخلات فقط، فتصلح للـbackfill وللـtrigger معًا.
-- الترتيب من الأخص للأعم: أول شرط يتحقق هو الناتج.
create or replace function public.derive_notification_category(
  p_type  text,
  p_title text,
  p_link  text
) returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    -- الشارة أولاً: عنوانها بيسمّي الإنجاز اللي اتحقق، والإنجاز ده ساعات
    -- بيكون "أول تذكرة" — فلو اتفحصت قاعدة التذاكر قبلها هتتصنّف غلط.
    when coalesce(p_title,'') ilike '%شارة%'               then 'rewards'

    -- تذاكر: الرابط بيحمل ?ticket= أو العنوان بيذكر التذكرة صراحةً
    when coalesce(p_link,'')  ilike '%ticket=%'            then 'tickets'
    when coalesce(p_title,'') ilike '%تذكرة%'              then 'tickets'
    when coalesce(p_title,'') ilike '%تذكرت%'              then 'tickets'

    -- باقي إشعارات المكافآت
    when coalesce(p_title,'') ilike '%نقاط%'               then 'rewards'
    when coalesce(p_title,'') ilike '%مكافأ%'              then 'rewards'
    when coalesce(p_title,'') ilike '%بلاغ%'               then 'rewards'

    -- فوترة ورصيد (قبل الاشتراك: "شحن رصيد" أقرب للفوترة)
    when coalesce(p_title,'') ilike '%رصيد%'               then 'billing'
    when coalesce(p_title,'') ilike '%فاتورة%'             then 'billing'
    when coalesce(p_title,'') ilike '%محفظة%'              then 'billing'
    when coalesce(p_title,'') ilike '%دفع%'                then 'billing'

    -- اشتراكات
    when coalesce(p_link,'')  ilike '%subscription%'       then 'subscription'
    when coalesce(p_title,'') ilike '%اشتراك%'             then 'subscription'
    when coalesce(p_title,'') ilike '%باقة%'               then 'subscription'

    -- واتساب
    when coalesce(p_title,'') ilike '%واتساب%'             then 'whatsapp'
    when coalesce(p_title,'') ilike '%whatsapp%'           then 'whatsapp'
    when coalesce(p_link,'')  ilike '%whatsapp%'           then 'whatsapp'

    -- المحرك الذكي
    when coalesce(p_title,'') ilike '%المحرك الذكي%'       then 'sie'
    when coalesce(p_title,'') ilike '%SIE%'                then 'sie'

    -- أمان الحساب
    when coalesce(p_title,'') ilike '%كلمة المرور%'        then 'security'
    when coalesce(p_title,'') ilike '%تسجيل الدخول%'       then 'security'
    when coalesce(p_title,'') ilike '%جهاز%'               then 'security'
    when coalesce(p_title,'') ilike '%تحقق بخطوتين%'       then 'security'
    when coalesce(p_title,'') ilike '%أمان%'               then 'security'

    -- محادثة مباشرة
    when coalesce(p_type,'')  in ('chat','chat_start')     then 'chat'
    when coalesce(p_link,'')  ilike '%chat-%'              then 'chat'

    -- الحساب (نطاق فرعي، ملف شخصي، تفعيل خدمة)
    when coalesce(p_type,'')  = 'subdomain'                then 'account'
    when coalesce(p_title,'') ilike '%نطاق%'               then 'account'
    when coalesce(p_title,'') ilike '%حساب%'               then 'account'

    -- أعطال وحالة النظام
    when coalesce(p_type,'')  in ('error','warning')       then 'system'

    else 'system'
  end;
$function$;

comment on function public.derive_notification_category(text, text, text) is
  'يشتق تصنيف الإشعار من النوع والعنوان والرابط. مصدر واحد للاشتقاق يستخدمه الـbackfill والـtrigger معًا.';

-- ── الملء التلقائي عند الإدراج ──────────────────────────────────────────────
create or replace function public.set_notification_category()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.category is null or btrim(new.category) = '' then
    new.category := public.derive_notification_category(new.type, new.title, new.link);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notifications_set_category on public.notifications;
create trigger trg_notifications_set_category
  before insert on public.notifications
  for each row execute function public.set_notification_category();

-- ── ملء الصفوف الموجودة ─────────────────────────────────────────────────────
update public.notifications
   set category = public.derive_notification_category(type, title, link)
 where category is null;

-- ── فهرس للتصفية حسب التصنيف داخل إشعارات المستخدم ─────────────────────────
create index if not exists idx_notifications_user_category
  on public.notifications (user_id, category, created_at desc);
