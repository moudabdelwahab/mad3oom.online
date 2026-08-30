-- ============================================================
-- 005 — تكامل النظام المحاسبي مع منصة مدعوم
--
-- النظام المحاسبي على مشروع Supabase منفصل. عند إصدار فاتورة
-- هناك تُسجَّل نسخة منها هنا، وتُضاف داخل التذكرة كرد مرفق،
-- ويصير لها رابط عام يؤكد أنها صادرة عن منصة مدعوم.
-- ============================================================

-- ---------- نسخة الفواتير الصادرة ----------
create table if not exists public.accounting_invoices (
  id                  uuid primary key default gen_random_uuid(),
  external_invoice_id uuid not null unique,
  invoice_number      text not null,
  ticket_id           uuid references public.tickets (id) on delete set null,
  user_id             uuid references public.profiles (id) on delete set null,
  subscription_id     uuid,
  plan                text,
  billing_cycle       text,
  subtotal            numeric(14,2) not null default 0,
  tax_amount          numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  currency            text not null default 'USD',
  issue_date          date,
  due_date            date,
  status              text,
  public_token        text not null unique
                        default encode(extensions.gen_random_bytes(24), 'hex'),
  reply_id            uuid references public.ticket_replies (id) on delete set null,
  attachment_id       uuid references public.ticket_attachments (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists accounting_invoices_ticket_idx on public.accounting_invoices (ticket_id);
create index if not exists accounting_invoices_user_idx   on public.accounting_invoices (user_id);

alter table public.accounting_invoices enable row level security;

-- العميل يرى فواتيره، والأدمن يرى الكل. الزائر لا يرى شيئاً مباشرة —
-- التحقق العام يمر عبر get_public_invoice() وحدها.
drop policy if exists "own_invoices_select" on public.accounting_invoices;
create policy "own_invoices_select" on public.accounting_invoices
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.role in ('admin', 'super_user')
    )
  );

-- ---------- إعدادات التكامل ----------
insert into public.advanced_settings (key, value)
select 'accounting_integration',
       jsonb_build_object(
         'billing_author_id', (
           select id::text from public.profiles
            where role = 'admin' and full_name = 'الدعم الفني' limit 1
         ),
         'public_invoice_base_url', 'https://mad3oom.online/invoice.html'
       )
 where not exists (select 1 from public.advanced_settings where key = 'accounting_integration');

-- ---------- التحقق العام من الفاتورة ----------
-- يقرأها الزائر عبر رمز الـ QR. لا تكشف بريداً ولا هاتفاً.
create or replace function public.get_public_invoice(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row record;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select ai.invoice_number, ai.issue_date, ai.due_date,
         ai.subtotal, ai.tax_amount, ai.total, ai.currency, ai.status,
         ai.plan, ai.billing_cycle, ai.created_at,
         t.ticket_number,
         coalesce(p.full_name, p.username) as customer_name
    into v_row
    from public.accounting_invoices ai
    left join public.tickets  t on t.id = ai.ticket_id
    left join public.profiles p on p.id = ai.user_id
   where ai.public_token = p_token;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'verified',       true,
    'issuer',         'منصة مدعوم',
    'issuer_domain',  'mad3oom.online',
    'invoice_number', v_row.invoice_number,
    'issue_date',     v_row.issue_date,
    'due_date',       v_row.due_date,
    'subtotal',       v_row.subtotal,
    'tax_amount',     v_row.tax_amount,
    'total',          v_row.total,
    'currency',       v_row.currency,
    'status',         v_row.status,
    'plan',           v_row.plan,
    'billing_cycle',  v_row.billing_cycle,
    'ticket_number',  v_row.ticket_number,
    'customer_name',  v_row.customer_name
  );
end;
$$;

revoke all on function public.get_public_invoice(text) from public;
grant execute on function public.get_public_invoice(text) to anon, authenticated;

-- ---------- استقبال فاتورة من النظام المحاسبي ----------
-- تُستدعى بمفتاح service_role من مزامنة النظام المحاسبي.
-- عملية واحدة: تسجّل الفاتورة، وتضيفها داخل التذكرة كرد مرفق.
-- قابلة لإعادة الاستدعاء بأمان (idempotent) عبر external_invoice_id.
create or replace function public.record_accounting_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings   jsonb;
  v_author     uuid;
  v_base_url   text;
  v_existing   public.accounting_invoices;
  v_invoice    public.accounting_invoices;
  v_ticket_id  uuid;
  v_user_id    uuid;
  v_reply_id   uuid;
  v_attach_id  uuid;
  v_url        text;
  v_message    text;
  v_plan_label text;
begin
  if p_payload is null or p_payload->>'external_invoice_id' is null then
    raise exception 'external_invoice_id مطلوب';
  end if;

  -- إعادة استدعاء لنفس الفاتورة: أعِد ما هو مسجَّل دون تكرار الرد
  select * into v_existing from public.accounting_invoices
   where external_invoice_id = (p_payload->>'external_invoice_id')::uuid;

  if found then
    return jsonb_build_object(
      'status',       'already_recorded',
      'invoice_id',   v_existing.id,
      'public_token', v_existing.public_token,
      'public_url',   coalesce(
        (select value->>'public_invoice_base_url' from public.advanced_settings where key = 'accounting_integration'),
        'https://mad3oom.online/invoice.html'
      ) || '?t=' || v_existing.public_token,
      'reply_id',     v_existing.reply_id
    );
  end if;

  select value into v_settings from public.advanced_settings where key = 'accounting_integration';
  v_author   := nullif(v_settings->>'billing_author_id', '')::uuid;
  v_base_url := coalesce(v_settings->>'public_invoice_base_url', 'https://mad3oom.online/invoice.html');

  v_ticket_id := nullif(p_payload->>'ticket_id', '')::uuid;
  v_user_id   := nullif(p_payload->>'user_id', '')::uuid;

  -- استنتاج العميل من التذكرة إن لم يُمرَّر
  if v_user_id is null and v_ticket_id is not null then
    select user_id into v_user_id from public.tickets where id = v_ticket_id;
  end if;

  insert into public.accounting_invoices (
    external_invoice_id, invoice_number, ticket_id, user_id, subscription_id,
    plan, billing_cycle, subtotal, tax_amount, total, currency,
    issue_date, due_date, status
  ) values (
    (p_payload->>'external_invoice_id')::uuid,
    coalesce(p_payload->>'invoice_number', '—'),
    v_ticket_id,
    v_user_id,
    nullif(p_payload->>'subscription_id', '')::uuid,
    p_payload->>'plan',
    p_payload->>'billing_cycle',
    coalesce((p_payload->>'subtotal')::numeric, 0),
    coalesce((p_payload->>'tax_amount')::numeric, 0),
    coalesce((p_payload->>'total')::numeric, 0),
    coalesce(p_payload->>'currency', 'USD'),
    nullif(p_payload->>'issue_date', '')::date,
    nullif(p_payload->>'due_date', '')::date,
    p_payload->>'status'
  ) returning * into v_invoice;

  v_url := v_base_url || '?t=' || v_invoice.public_token;

  -- الرد المرفق داخل التذكرة
  if v_ticket_id is not null and v_author is not null then
    v_plan_label := coalesce(
      (select coalesce(name_ar, name) from public.subscription_plans where key = v_invoice.plan),
      v_invoice.plan
    );

    v_message :=
      'تم إصدار فاتورة لهذا الطلب.' || E'\n\n' ||
      'رقم الفاتورة: ' || v_invoice.invoice_number || E'\n' ||
      case when v_plan_label is not null then 'الباقة: ' || v_plan_label || E'\n' else '' end ||
      'الإجمالي: ' || trim(to_char(v_invoice.total, 'FM999999990.00')) || ' ' || v_invoice.currency || E'\n' ||
      case when v_invoice.due_date is not null
           then 'تاريخ الاستحقاق: ' || to_char(v_invoice.due_date, 'YYYY-MM-DD') || E'\n' else '' end ||
      E'\n' || 'لعرض الفاتورة والتحقق منها: ' || v_url;

    -- محفّز track_first_response يعدّل التذكرة، وحارس التذاكر يرفض ذلك
    -- لغير الأدمن. هذا هو مخرج المنصة القياسي للعمليات الموثوقة من
    -- الخادم، نفسه المستعمل في wf_update_ticket_status و mcp_admin_update_ticket.
    perform set_config('app.bypass_ticket_restrictions', 'on', true);

    insert into public.ticket_replies (ticket_id, user_id, message, is_internal)
    values (v_ticket_id, v_author, v_message, false)
    returning id into v_reply_id;

    insert into public.ticket_attachments (
      ticket_id, reply_id, file_url, file_name, mime_type, uploaded_by
    ) values (
      v_ticket_id, v_reply_id, v_url,
      'فاتورة ' || v_invoice.invoice_number,
      'text/html', v_author
    ) returning id into v_attach_id;

    update public.accounting_invoices
       set reply_id = v_reply_id, attachment_id = v_attach_id, updated_at = now()
     where id = v_invoice.id;

    perform set_config('app.bypass_ticket_restrictions', 'off', true);
  end if;

  return jsonb_build_object(
    'status',       'recorded',
    'invoice_id',   v_invoice.id,
    'public_token', v_invoice.public_token,
    'public_url',   v_url,
    'reply_id',     v_reply_id,
    'attachment_id', v_attach_id
  );
end;
$$;

-- لا تُستدعى إلا بمفتاح service_role من المزامنة
revoke all on function public.record_accounting_invoice(jsonb) from public, anon, authenticated;

-- الزائر لا يحتاج قراءة الجدول إطلاقاً: التحقق العام يمر عبر
-- get_public_invoice() وحدها. سدّ المنفذ صراحةً بدل الاعتماد على RLS فقط.
revoke all on table public.accounting_invoices from anon;
