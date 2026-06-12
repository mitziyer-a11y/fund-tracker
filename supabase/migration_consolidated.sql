-- ============================================================
-- ONE-SHOT MIGRATION: run this whole script in Supabase SQL Editor.
-- Safe to run even if some of this already exists.
-- Covers: status/allowlist (approval gate), role rename
-- deputy -> approver, and receipts.
-- ============================================================

-- ---------- 1. status + allowlist ----------
alter table profiles add column if not exists status text not null default 'active'
  check (status in ('pending','active','disabled'));

create table if not exists allowed_emails (
  email text primary key,
  added_by uuid references profiles(id),
  added_at timestamptz default now()
);
alter table allowed_emails enable row level security;

-- ---------- 2. rename role 'deputy' -> 'approver' ----------
alter table profiles drop constraint if exists profiles_role_check;
update profiles set role = 'approver' where role = 'deputy';
alter table profiles add constraint profiles_role_check
  check (role in ('requester','approver','admin'));

-- ---------- 3. helper functions ----------
create or replace function is_active_admin()
returns boolean as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$ language sql security definer stable;

create or replace function is_active_user()
returns boolean as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.status = 'active'
  );
$$ language sql security definer stable;

-- ---------- 4. handle_new_user (approval-aware) ----------
create or replace function handle_new_user()
returns trigger as $$
declare
  v_status text := 'pending';
begin
  if exists (select 1 from allowed_emails a where lower(a.email) = lower(new.email)) then
    v_status := 'active';
  end if;

  insert into public.profiles (id, email, full_name, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), v_status);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------- 5. drop old policies (ignore errors if they don't exist) ----------
drop policy if exists "profiles_select_all" on profiles;
drop policy if exists "profiles_update_own_name" on profiles;
drop policy if exists "profiles_update_admin" on profiles;
drop policy if exists "fund_select_all" on fund_pool;
drop policy if exists "fund_select_active" on fund_pool;
drop policy if exists "fund_update_admin_only" on fund_pool;
drop policy if exists "requests_select_all" on requests;
drop policy if exists "requests_select_active" on requests;
drop policy if exists "requests_insert_own" on requests;
drop policy if exists "requests_update_own_when_editable" on requests;
drop policy if exists "requests_update_reviewer" on requests;
drop policy if exists "allowed_emails_admin_all" on allowed_emails;
drop policy if exists "receipts_owner_insert" on storage.objects;
drop policy if exists "receipts_owner_select" on storage.objects;
drop policy if exists "receipts_reviewer_select" on storage.objects;

-- ---------- 6. recreate policies ----------
create policy "profiles_select_all" on profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_own_name" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_update_admin" on profiles
  for update using (is_active_admin());

create policy "allowed_emails_admin_all" on allowed_emails
  for all using (is_active_admin()) with check (is_active_admin());

create policy "fund_select_active" on fund_pool
  for select using (is_active_user());

create policy "fund_update_admin_only" on fund_pool
  for update using (is_active_admin());

create policy "requests_select_active" on requests
  for select using (is_active_user());

create policy "requests_insert_own" on requests
  for insert with check (auth.uid() = user_id and is_active_user());

create policy "requests_update_own_when_editable" on requests
  for update using (
    auth.uid() = user_id
    and status in ('pending','needs_revision')
  )
  with check (
    auth.uid() = user_id
    and status in ('pending')
  );

create policy "requests_update_reviewer" on requests
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('approver','admin') and p.status = 'active')
  );

-- ---------- 7. receipts (column, bucket, policies, RPC) ----------
alter table requests add column if not exists receipt_path text;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and exists (
      select 1 from requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.user_id = auth.uid()
    )
  );

create policy "receipts_owner_select" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and exists (
      select 1 from requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.user_id = auth.uid()
    )
  );

create policy "receipts_reviewer_select" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('approver','admin') and p.status = 'active')
  );

create or replace function attach_receipt(p_request_id uuid, p_path text)
returns void as $$
begin
  update requests
  set receipt_path = p_path
  where id = p_request_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Not permitted: you can only attach receipts to your own requests';
  end if;
end;
$$ language plpgsql security definer;

-- ---------- 8. fund_summary view (security_invoker so RLS applies) ----------
create or replace view fund_summary
  with (security_invoker = on)
as
select
  f.total_fund,
  coalesce(sum(r.amount) filter (where r.status = 'approved'), 0) as approved_total,
  coalesce(sum(r.amount) filter (where r.status in ('pending','needs_revision')), 0) as pending_total,
  f.total_fund
    - coalesce(sum(r.amount) filter (where r.status = 'approved'), 0)
    - coalesce(sum(r.amount) filter (where r.status in ('pending','needs_revision')), 0) as remaining
from fund_pool f
left join requests r on true
where f.id = 1
group by f.total_fund;

-- ---------- 9. set yourself as active admin + seed allowlist ----------
-- EDIT the email below to your own, then run this last part:
update profiles set role = 'admin', status = 'active' where email = 'mitziyer@gmail.com';
insert into allowed_emails (email) values ('mitziyer@gmail.com') on conflict do nothing;
