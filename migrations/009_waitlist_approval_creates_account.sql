-- ============================================================
-- Waitlist approval -> real account
-- ============================================================
-- Before this migration, approving a waitlist entry only flipped
-- `waitlist_entries.status` to 'approved'. Nothing ever created the
-- corresponding auth user / profile, so an approved visitor was never
-- added to the database and could never sign in. The provisioning now
-- happens in the `approve-waitlist-entry` edge function (service role);
-- this migration only adds the link back from the entry to the account
-- it produced, so approval is idempotent and auditable.
-- ============================================================

alter table public.waitlist_entries
    add column if not exists approved_user_id uuid references public.profiles(id) on delete set null;

comment on column public.waitlist_entries.approved_user_id is
    'الحساب الذي تم إنشاؤه عند الموافقة على هذا الطلب (يُملأ بواسطة edge function: approve-waitlist-entry).';

create index if not exists waitlist_entries_approved_user_id_idx
    on public.waitlist_entries (approved_user_id)
    where approved_user_id is not null;
