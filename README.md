# Exploratory Fund Ledger

A small internal tool for tracking an "exploratory fund": team members submit
requests, a approver director approves/declines/sends back for revision, and
everyone can see remaining balance + where money is going.

Stack: **Supabase** (Postgres + Auth + Edge Functions) + **Netlify**
(static React/Vite frontend) + **Resend** (email).

---

## Migrating an existing deployment (access control / allowlist)

If you already ran an earlier version of `schema.sql`, run this migration to
add the allowlist/approval system without dropping any data:

```sql
alter table profiles add column if not exists status text not null default 'active'
  check (status in ('pending','active','disabled'));

create table if not exists allowed_emails (
  email text primary key,
  added_by uuid references profiles(id),
  added_at timestamptz default now()
);
alter table allowed_emails enable row level security;
```

Existing users default to `status = 'active'` so nothing breaks for them.
New signups from here on default to `pending` unless their email is on
`allowed_emails`.

Next, re-run (from the current `schema.sql`): the updated `handle_new_user()`
function/trigger, the `is_active_user()` / `is_active_admin()` helper
functions, and the new/updated RLS policies (`profiles_update_admin`,
`allowed_emails_admin_all`, `fund_select_active`, `requests_select_active`,
`requests_insert_own`, `requests_update_reviewer`, `receipts_reviewer_select`,
and the `fund_summary` view). If Postgres complains a policy already exists,
drop the old one first, e.g. `drop policy if exists fund_select_all on fund_pool;`.

Finally, add trusted teammates to the allowlist so future re-logins stay approved:

```sql
insert into allowed_emails (email) values ('you@gmail.com'), ('teammate@gmail.com');
```

---

## Migrating an existing deployment (role rename: deputy → approver)

If you already have users with `role = 'deputy'`, rename it:

```sql
alter table requests drop constraint if exists requests_status_check; -- no-op safeguard
alter table profiles drop constraint if exists profiles_role_check;
update profiles set role = 'approver' where role = 'deputy';
alter table profiles add constraint profiles_role_check
  check (role in ('requester','approver','admin'));
```

Then re-run the updated policies/functions from `schema.sql` that reference
roles (`is_active_admin`, `requests_update_reviewer`,
`receipts_reviewer_select`), and redeploy the `notify` Edge Function (it now
emails everyone with role `approver` or `admin`).

---

## 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com) (free tier is fine to start).
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`. This creates:
   - `profiles`, `fund_pool`, `requests`, `audit_log` tables
   - the `fund_summary` view (total / approved / pending / remaining)
   - the auto-decline trigger for over-budget requests
   - RLS policies (read-all, owner-edit-while-pending, reviewer-can-decide, admin-only fund edits)

3. **Enable Google OAuth** (detailed steps):
   1. Go to [Google Cloud Console](https://console.cloud.google.com) → create a new project (or reuse one).
   2. **APIs & Services > OAuth consent screen**: choose "Internal" if everyone is on your Google Workspace org (simplest, no verification needed), or "External" + add your team's emails as test users if not.
   3. **APIs & Services > Credentials > Create Credentials > OAuth client ID** → Application type: "Web application".
   4. Under **Authorized redirect URIs**, add:
      ```
      https://<your-project-ref>.supabase.co/auth/v1/callback
      ```
      (find `<your-project-ref>` in Supabase Project Settings > API)
   5. Copy the **Client ID** and **Client Secret**.
   6. In Supabase: **Authentication > Providers > Google** → paste in Client ID + Secret → enable.
   7. In Supabase: **Authentication > URL Configuration** → set **Site URL** to your Netlify URL (you can update this after deploying the frontend), and add it under **Redirect URLs** too.

4. **Set initial fund + roles** — once you've signed in once via the deployed
   app (so your profile row exists), run:
   ```sql
   update fund_pool set total_fund = 5000 where id = 1; -- your starting amount
   update profiles set role = 'admin'  where email = 'you@yourorg.com';
   update profiles set role = 'approver' where email = 'approver@yourorg.com';

   update fund_pool set total_fund = 5000 where id = 1;
update profiles set role = 'admin', status = 'active' where email = 'you@gmail.com';
   ```
   You can have multiple admins — just run the `admin` update for each.

---

## 2. Set up email (Resend)

1. Create a free account at [resend.com](https://resend.com) (3,000 emails/month free).
2. Verify a sending domain (or use their test domain while developing).
3. Grab an API key.

### Deploy the notify Edge Function

```bash
cd supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy notify

supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set FROM_EMAIL="Fund Tracker <fund@yourdomain.com>"
supabase secrets set APP_URL="https://your-app.netlify.app"
```

### Wire up the Database Webhook

In the Supabase dashboard: **Database > Webhooks > Create a new webhook**
- Table: `requests`
- Events: `INSERT`, `UPDATE`
- Type: HTTP request to your Edge Function
  (`https://<project-ref>.functions.supabase.co/notify`)

This is what fires the emails:
- New request → email to all `approver`/`admin` profiles
- Auto-declined on submit → email to requester immediately
- Resubmission after "needs revision" → email to reviewers again
- Approve / decline / needs-revision decision → email to requester

> Note: the email links to the app's main URL, where the approver/admin signs in
> with Google and uses the **Review** tab — true one-click "approve from
> email" links aren't included here for security (anyone forwarding the email
> could approve), but the link gets them straight to the right place after login.

---

## 3. Deploy the frontend to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site > Import from Git**, pick the repo.
   - `netlify.toml` already sets `base = frontend`, build command, and SPA redirects.
3. Add environment variables (Site settings > Environment variables):
   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your anon/public key>
   ```
4. Deploy. Add the Netlify URL to your Google OAuth client's **Authorized
   redirect URIs** and as Supabase's **Site URL** (Authentication > URL Configuration).

---

## 4. Local development

```bash
cd frontend
cp .env.example .env   # fill in your Supabase URL + anon key
npm install
npm run dev
```

---

## Env vars checklist (all in one place)

| Where | Variable | Value |
|---|---|---|
| Netlify (Site settings > Environment variables) | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| Netlify | `VITE_SUPABASE_ANON_KEY` | Supabase Project Settings > API > `anon` `public` key |
| Supabase Edge Function secrets (`supabase secrets set ...`) | `RESEND_API_KEY` | from resend.com dashboard |
| Supabase | `FROM_EMAIL` | e.g. `"Fund Tracker <fund@yourdomain.com>"` |
| Supabase | `APP_URL` | your Netlify URL |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the Edge Function are
auto-injected by Supabase — no need to set those yourself.

---

## How it works, in brief

- **Everyone** (any signed-in Google account) can submit a request, see the
  full ledger of all requests, and view the Utilization tab.
- **Remaining balance** = total fund − approved total − pending total
  (pending requests "reserve" funds so two people can't double-spend the same
  dollars before either is decided).
- **Auto-decline**: a Postgres trigger checks on insert/resubmit — if the
  amount exceeds the remaining balance, it's immediately set to `declined`
  with an explanatory note, and the requester gets an email right away.
- **Needs revision**: the approver can send a request back with a comment
  (e.g. "reduce to $X"); the requester edits the same request and resubmits,
  which sets it back to `pending` and re-notifies reviewers.
- **Admin** (role = `admin`, can be more than one person) is the only role
  that can change the total fund amount — everything else (approved/pending/
  remaining) is derived automatically.
- **Receipts/invoices**: any requester can attach a receipt to their own
  request — at submission time or later, even after it's approved (the
  purchase often happens after approval). The file goes to a private
  Storage bucket and is only viewable by the request's owner and by
  admin/approver, enforced via Storage RLS — other requesters (e.g. Mithra)
  can see Helen's request but never her receipt.
