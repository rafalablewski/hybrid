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
drop policy if exists user_self_select on "User";
create policy user_self_select on "User" for select
  using ("authId" = auth.uid()::text or id = public.app_user_id());
drop policy if exists user_self_update on "User";
create policy user_self_update on "User" for update
  using ("authId" = auth.uid()::text);

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
drop policy if exists link_insert on "CoachLink";
create policy link_insert on "CoachLink" for insert
  with check ("coachId" = public.app_user_id());
drop policy if exists link_update on "CoachLink";
create policy link_update on "CoachLink" for update
  using ("coachId" = public.app_user_id() or "clientId" = public.app_user_id());

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
