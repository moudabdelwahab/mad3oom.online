-- ============================================================================
-- 012_customer_reopen_ticket.sql   —   إعادة فتح التذكرة بردّ العميل
--
-- الوضع قبل التعديل
--   البنية كلها لإعادة الفتح موجودة وشغالة بالفعل:
--     • tickets.reopen_count و tickets.last_reopened_at
--     • log_ticket_changes_before()  → بيزوّد العدّاد ويسجّل الوقت
--     • log_ticket_changes_after()   → بيكتب حدث 'reopen' في ticket_activity
--   وكلها بتشتغل تلقائيًا لحظة ما الحالة تتغيّر من resolved إلى open.
--
--   الناقص: **مفيش أي مسار يخلي العميل يوصل للحالة دي**.
--   العميل ممنوع من تعديل tickets.status على مستوى القاعدة
--   (trg_enforce_customer_ticket_update)، وهو منع صحيح ومقصود.
--   والـtrigger الموجود على الردود (unarchive_ticket_on_external_reply)
--   بيتعامل مع ردّ الموظف فقط، مش ردّ العميل.
--
--   النتيجة: تذكرة اتقفلت وفيها مشكلة لسه قايمة = العميل لازم يفتح تذكرة
--   جديدة ويفقد كل سياق المحادثة.
--
-- الحل
--   trigger واحد على ticket_replies: لما **مالك التذكرة** يضيف ردًّا عامًا
--   على تذكرة حالتها 'resolved'، الحالة ترجع 'open'.
--   الـtrigger هو المسار المصرّح به (SECURITY DEFINER)، فالعميل نفسه يفضل
--   ممنوع من تعديل الحالة مباشرةً — القيد الأصلي ما اتفكّش.
--
-- حدود مقصودة
--   • 'confirmed' و'rejected' مستثناة: دي نتائج قرارات (شراء اتأكد / طلب
--     اترفض)، وردّ عليها ما ينفعش يرجّعها لطابور الدعم تلقائيًا.
--   • الردود الداخلية (is_internal) متجاهَلة تمامًا.
--   • ردّ الموظف ما بيغيّرش الحالة — ده قرار الموظف من لوحة الإدارة.
-- ============================================================================

-- ── 1) توسيع بوابة التجاوز الموجودة لتشمل الحارس الثاني ────────────────────
--
-- على tickets في حارسان BEFORE UPDATE بيمنعا العميل من تغيير الحالة:
--   enforce_customer_ticket_update_restrictions  ← فيه بوابة تجاوز صريحة
--                                                  (app.bypass_ticket_restrictions)
--   restrict_customer_ticket_update              ← مفيهاش بوابة
--
-- الحارسان بيتنفذوا على أي UPDATE مهما كان مصدره — حتى لو جاي من دالة
-- SECURITY DEFINER، لأن auth.uid() بتفضل هي هوية الجلسة. يعني من غير التعديل
-- ده، الـtrigger اللي تحت هيترفض بنفس رسالة "غير مسموح للعميل بتعديل هذا الحقل".
--
-- الحل بيتبع النمط اللي المشروع أقرّه أصلاً: نفس بوابة التجاوز، بنفس المفتاح،
-- تتضاف للحارس التاني. المفتاح ده متغيّر جلسة (GUC) ما ينفعش يتضبط من العميل
-- عبر PostgREST — الكود السيرفري بس اللي يقدر يضبطه، ولمدة المعاملة فقط.
create or replace function public.restrict_customer_ticket_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  is_caller_admin boolean;
BEGIN
  -- بوابة التجاوز المصرّح بها (نفس مفتاح enforce_customer_ticket_update_restrictions)
  IF current_setting('app.bypass_ticket_restrictions', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_caller_admin;

  IF is_caller_admin THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.image_url IS DISTINCT FROM OLD.image_url
       OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number THEN
      RAISE EXCEPTION 'العميل غير مسموح له بتعديل هذه الحقول، يمكنه فقط أرشفة التذكرة';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2) إعادة الفتح بردّ المالك ──────────────────────────────────────────────
create or replace function public.reopen_ticket_on_owner_reply()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner  uuid;
  v_status text;
begin
  -- الردود الداخلية لا تخص العميل ولا تعيد فتح شيء
  if new.is_internal is true then
    return new;
  end if;

  select t.user_id, t.status into v_owner, v_status
    from public.tickets t
   where t.id = new.ticket_id;

  -- الردّ من مالك التذكرة نفسه، والتذكرة محلولة → ترجع مفتوحة
  if v_owner is not null
     and new.user_id = v_owner
     and v_status = 'resolved'
  then
    -- التجاوز مفتوح لجملة واحدة بس، وبيتقفل فورًا بعدها. حتى لو حصل استثناء
    -- في الـUPDATE، القيمة محليّة للمعاملة (is_local = true) فبتتلاشى معاها.
    perform set_config('app.bypass_ticket_restrictions', 'on', true);

    update public.tickets
       set status = 'open'
     where id = new.ticket_id
       and status = 'resolved';

    perform set_config('app.bypass_ticket_restrictions', 'off', true);
    -- من هنا تكمّل الـtriggers الموجودة أصلاً:
    --   log_ticket_changes_before → reopen_count + last_reopened_at
    --   log_ticket_changes_after  → حدث 'reopen' ثم 'status_change'
  end if;

  return new;
end;
$function$;

comment on function public.reopen_ticket_on_owner_reply() is
  'يعيد فتح التذكرة المحلولة عندما يضيف مالكها ردًا جديدًا. المسار المصرّح به الوحيد لإعادة الفتح من جهة العميل.';

drop trigger if exists trg_reopen_ticket_on_owner_reply on public.ticket_replies;
create trigger trg_reopen_ticket_on_owner_reply
  after insert on public.ticket_replies
  for each row execute function public.reopen_ticket_on_owner_reply();
