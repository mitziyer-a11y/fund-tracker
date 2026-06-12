-- ============================================================
-- Exploratory Fund Tracker — Supabase schema
-- Run this in the Supabase SQL editor (Project > SQL Editor)
-- ============================================================

-- ---------- PROFILES ----------
-- One row per authenticated user, auto-created on first login
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'requester' check (role in ('requester','approver','admin')),
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz default now()
);

-- Emails that are auto-approved on first sign-in. Manage via the Admin tab.
create table if not exists allowed_emails (
  email text primary key,
  added_by uuid references profiles(id),
  added_at timestamptz default now()
);

-- Auto-create a profile row when a new auth user signs up via Google OAuth.
-- Status is 'active' immediately if their email is on the allowlist,
-- otherwise 'pending' until an admin approves them.
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

-- ---------- FUND POOL ----------
-- Single-row table holding the current total exploratory fund.
-- Only admins can update this (enforced via RLS below).
create table if not exists fund_pool (
  id int primary key default 1,
  total_fund numeric not null default 0,
  updated_by uuid references profiles(id),
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into fund_pool (id, total_fund) values (1, 0)
  on conflict (id) do nothing;

-- ---------- REQUESTS ----------
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  amount numeric not null check (amount > 0),
  category text not null check (category in (
    'LLM tokens', 'Other AI tools', 'Books / Courses', 'Compute / Hosting', 'Hardware', 'Other'
  )),
  details text not null check (length(trim(details)) > 0),
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'declined', 'needs_revision'
  )),
  reviewer_comment text,
  reviewer_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- AUDIT LOG ----------
create table if not exists audit_log (
  id bigserial primary key,
  event_type text not null,
  actor_id uuid references profiles(id),
  request_id uuid references requests(id) on delete set null,
  detail jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- HELPER VIEW: fund usage summary
-- remaining = total - approved - pending(+needs_revision, reserved)
-- ============================================================
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

-- ============================================================
-- AUTO-REJECT TRIGGER
-- If a new/edited request's amount exceeds the *remaining* fund
-- (excluding this request itself), auto-decline it.
-- ============================================================
create or replace function check_request_amount()
returns trigger as $$
declare
  v_remaining numeric;
begin
  select
    f.total_fund
      - coalesce(sum(r.amount) filter (where r.status = 'approved' and r.id <> new.id), 0)
      - coalesce(sum(r.amount) filter (where r.status in ('pending','needs_revision') and r.id <> new.id), 0)
  into v_remaining
  from fund_pool f
  left join requests r on true
  where f.id = 1
  group by f.total_fund;

  if new.amount > v_remaining then
    new.status := 'declined';
    new.reviewer_comment := coalesce(new.reviewer_comment, '')
      || format(' [Auto-declined: requested $%s exceeds remaining balance of $%s]', new.amount, v_remaining);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_request_amount on requests;
create trigger trg_check_request_amount
  before insert or update of amount on requests
  for each row
  -- only re-run the check when status is (re)set to pending/needs_revision,
  -- i.e. on new submissions or resubmissions — not on approver approve/decline edits
  when (new.status in ('pending','needs_revision'))
  execute procedure check_request_amount();

-- keep updated_at fresh
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_requests_touch on requests;
create trigger trg_requests_touch
  before update on requests
  for each row execute procedure touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table fund_pool enable row level security;
alter table requests enable row level security;
alter table audit_log enable row level security;
alter table allowed_emails enable row level security;

-- Helper: is the current user an active admin?
create or replace function is_active_admin()
returns boolean as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$ language sql security definer stable;

-- Helper: is the current user active (any role)?
create or replace function is_active_user()
returns boolean as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.status = 'active'
  );
$$ language sql security definer stable;

-- PROFILES: everyone (logged in) can read all profiles — needed to show
-- "requested by" names, and so a pending user can at least see their own
-- pending status. Users can update their own full_name; admins can update
-- ANY profile's role/status (approve, disable, promote).
create policy "profiles_select_all" on profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_own_name" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_update_admin" on profiles
  for update using (is_active_admin());

-- ALLOWED_EMAILS: admins only.
create policy "allowed_emails_admin_all" on allowed_emails
  for all using (is_active_admin()) with check (is_active_admin());

-- FUND POOL: any ACTIVE user can read; only admins can update.
create policy "fund_select_active" on fund_pool
  for select using (is_active_user());

create policy "fund_update_admin_only" on fund_pool
  for update using (is_active_admin());

-- REQUESTS: any ACTIVE user can read all requests.
create policy "requests_select_active" on requests
  for select using (is_active_user());

-- Active users can insert their own request.
create policy "requests_insert_own" on requests
  for insert with check (auth.uid() = user_id and is_active_user());

-- Owners can update their own request ONLY while it's pending or
-- needs_revision (i.e. editing/resubmitting). They cannot set status
-- to approved/declined themselves — but they CAN set it back to 'pending'
-- when resubmitting after a revision request.
create policy "requests_update_own_when_editable" on requests
  for update using (
    auth.uid() = user_id
    and status in ('pending','needs_revision')
  )
  with check (
    auth.uid() = user_id
    and status in ('pending')   -- resubmission moves it back to pending
  );

-- Deputies/admins (if active) can update ANY request's status/comment.
create policy "requests_update_reviewer" on requests
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('approver','admin') and p.status = 'active')
  );

-- AUDIT LOG: everyone can read (transparency); inserts happen via
-- security-definer function below so direct insert isn't needed from clients.
create policy "audit_select_all" on audit_log
  for select using (auth.role() = 'authenticated');

create policy "audit_insert_authenticated" on audit_log
  for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- NOTES
-- ============================================================
-- 1. After creating your first real user via Google OAuth, manually set
--    their role in `profiles`:
--      update profiles set role = 'admin'  where email = 'you@yourorg.com';
--      update profiles set role = 'approver' where email = 'approver@yourorg.com';
--
-- 2. Set the initial fund amount:
--      update fund_pool set total_fund = 5000 where id = 1;
--
-- 3. To trigger emails, set up a Database Webhook (Database > Webhooks)
--    on the `requests` table for INSERT and UPDATE events, pointing at
--    the `notify` Edge Function (see supabase/functions/notify).

-- ============================================================
-- RECEIPTS / INVOICES (optional, admin & approver only)
-- ============================================================

-- Link each request to an optional uploaded receipt/invoice
alter table requests add column if not exists receipt_path text;

-- Private bucket for receipts (not publicly readable)
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Storage objects are stored as "<request_id>/<filename>"
-- Owners can upload/view files for their own requests
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

-- Admin/approver can view ALL receipts
create policy "receipts_reviewer_select" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('approver','admin') and p.status = 'active')
  );

-- RPC so owners can attach/replace a receipt on their OWN request at any
-- time — including after it's already been approved (e.g. the purchase
-- happened later and the invoice arrives afterwards). This bypasses the
-- normal "editable only while pending" update policy, but only ever
-- touches receipt_path on a request the caller owns.
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

