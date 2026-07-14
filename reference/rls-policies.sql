-- HYBRID — Row Level Security policies (defense-in-depth).
-- Run once in the Supabase SQL Editor.
--
-- The app reads/writes via Prisma (the privileged postgres role, which BYPASSES
-- RLS), so these policies don't change app behaviour. They protect against
-- direct PostgREST / anon-key access and encode the permission model in the DB:
--   * a user sees only their own Session/Macrocycle/Biometric rows
--   * a coach may READ a client's sessions only via an ACTIVE CoachLink
--   * private CoachNotes are never visible to the client
--   * the Plan library is readable by any signed-in user

-- ---- helpers -------------------------------------------------------------
create or replace function public.app_user_id() returns text
  language sql stable security definer set search_path = public as $$
  select id from "User" where "authId" = auth.uid()::text
$$;

create or replace function public.is_active_coach(client_id text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "CoachLink"
    where "coachId" = public.app_user_id()
      and "clientId" = client_id
      and status = 'ACTIVE'
  )
$$;

-- ---- User ----------------------------------------------------------------
-- SECURITY: PostgREST enforces column GRANTs, NOT policy intent. A row-only
-- policy would still let a signed-in user PATCH their own role/entitlement via
-- the anon key (self-escalation to ADMIN + free paywall bypass). So we (1) revoke
-- table-wide UPDATE from the API roles and (2) re-grant only the safe profile
-- columns. The app itself writes via Prisma (the privileged role), which is
-- unaffected by these grants.
revoke update on "User" from anon, authenticated;
grant  update ("name", "language") on "User" to authenticated;

drop policy if exists user_self_select on "User";
create policy user_self_select on "User" for select
  using ("authId" = auth.uid()::text or id = public.app_user_id());
drop policy if exists user_self_update on "User";
create policy user_self_update on "User" for update
  using ("authId" = auth.uid()::text)
  with check ("authId" = auth.uid()::text);

-- ---- Session -------------------------------------------------------------
drop policy if exists session_own on "Session";
create policy session_own on "Session" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists session_coach_read on "Session";
create policy session_coach_read on "Session" for select
  using (public.is_active_coach("userId"));

-- ---- Macrocycle ----------------------------------------------------------
drop policy if exists macro_own on "Macrocycle";
create policy macro_own on "Macrocycle" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ---- Biometric -----------------------------------------------------------
drop policy if exists bio_own on "Biometric";
create policy bio_own on "Biometric" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ---- CoachLink -----------------------------------------------------------
drop policy if exists link_read on "CoachLink";
create policy link_read on "CoachLink" for select
  using ("coachId" = public.app_user_id() or "clientId" = public.app_user_id());
-- SECURITY: consent must be enforced at the DB layer, not just the API. A coach
-- may only CREATE a PENDING link (never a pre-accepted ACTIVE one), and only the
-- CLIENT may transition it to ACTIVE (accept). Otherwise anyone could insert
-- {coachId: me, clientId: victim, status: ACTIVE} via the anon key and read the
-- victim's training data through is_active_coach().
drop policy if exists link_insert on "CoachLink";
create policy link_insert on "CoachLink" for insert
  with check ("coachId" = public.app_user_id() and status = 'PENDING');
drop policy if exists link_update on "CoachLink";
create policy link_update on "CoachLink" for update
  using ("coachId" = public.app_user_id() or "clientId" = public.app_user_id())
  with check (
    ("coachId" = public.app_user_id() or "clientId" = public.app_user_id())
    -- only the client may move a link INTO the ACTIVE state
    and (status <> 'ACTIVE' or "clientId" = public.app_user_id())
  );

-- ---- CoachNote -----------------------------------------------------------
drop policy if exists note_read on "CoachNote";
create policy note_read on "CoachNote" for select
  using (
    exists (select 1 from "CoachLink" l where l.id = "linkId" and l."coachId" = public.app_user_id())
    or (
      not "private"
      and exists (select 1 from "CoachLink" l where l.id = "linkId" and l."clientId" = public.app_user_id())
    )
  );
drop policy if exists note_insert on "CoachNote";
create policy note_insert on "CoachNote" for insert
  with check (
    exists (
      select 1 from "CoachLink" l
      where l.id = "linkId" and l."coachId" = public.app_user_id() and l.status = 'ACTIVE'
    )
  );

-- ---- Plan (public library) ----------------------------------------------
drop policy if exists plan_read on "Plan";
create policy plan_read on "Plan" for select using (auth.role() = 'authenticated');

-- ---- ProcessedWebhookEvent (Stripe idempotency ledger) -------------------
-- Server-only. Without RLS the anon key could pre-seed the ledger to make a
-- real Stripe event be skipped as "already processed" (defeating entitlement
-- provisioning) or delete rows to force double-processing. RLS on + no policy =
-- deny-all to PostgREST; Prisma (privileged role) still writes it normally.
alter table if exists "ProcessedWebhookEvent" enable row level security;

-- ---- Blanket hardening: no anonymous PostgREST access to app tables --------
-- Every client reads/writes application data through the /api layer (Prisma).
-- No client uses the anon key against PostgREST for table data (only Storage),
-- so we revoke the unauthenticated grant outright as belt-and-suspenders behind
-- the per-table policies above. Storage RLS (storage.objects) is unaffected.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
