-- HYBRID — CoachInvite table + RLS (coach-led onboarding of brand-new clients).
-- Run in the Supabase SQL Editor.
-- PREREQUISITE: run reference/rls-policies.sql FIRST — it defines
-- public.app_user_id() (the signed-in user's DB id).
--
-- WHY: a coach can invite a client who isn't on HYBRID yet via a QR code / link
-- (or, later, email/SMS). The client CLAIMS it on first sign-up, which creates an
-- ACTIVE CoachLink (the act of claiming is consent). Until this runs, the invite
-- APIs soft-degrade to "not enabled yet" and the rest of the app works.

create table if not exists "CoachInvite" (
  "id"          text primary key default gen_random_uuid()::text,
  "coachId"     text not null,
  "token"       text not null unique,
  "email"       text,
  "phone"       text,
  "status"      text not null default 'PENDING', -- PENDING | CLAIMED | REVOKED
  "claimedById" text,
  "createdAt"   timestamptz not null default now(),
  "expiresAt"   timestamptz not null
);

create index if not exists "CoachInvite_coachId_idx" on "CoachInvite" ("coachId");
create index if not exists "CoachInvite_email_idx"   on "CoachInvite" ("email");

alter table "CoachInvite" enable row level security;

-- A coach creates / lists / revokes only their OWN invites.
drop policy if exists coachinvite_own on "CoachInvite";
create policy coachinvite_own on "CoachInvite" for all
  using ("coachId" = public.app_user_id())
  with check ("coachId" = public.app_user_id());

-- A signed-in user may READ a still-open invite ONLY when it is addressed to
-- their own verified email ("Coach X invited you") — never enumerate other
-- people's invites. Previously this was `using(status='PENDING')` with no role
-- restriction, letting the anon role scrape every pending invite's email/phone
-- (PII). The claim itself runs server-side (token + expiry enforced there).
drop policy if exists coachinvite_claim_read on "CoachInvite";
create policy coachinvite_claim_read on "CoachInvite" for select
  to authenticated
  using (
    "status" = 'PENDING'
    and lower("email") = lower((select "email" from "User" where id = public.app_user_id()))
  );

drop policy if exists coachinvite_claim_update on "CoachInvite";
create policy coachinvite_claim_update on "CoachInvite" for update
  to authenticated
  using (
    "status" = 'PENDING'
    and lower("email") = lower((select "email" from "User" where id = public.app_user_id()))
  )
  with check (
    lower("email") = lower((select "email" from "User" where id = public.app_user_id()))
    and "status" in ('PENDING', 'CLAIMED')
  );
