-- HYBRID — Verified Strength Record, tier 2 (witness co-signing).
-- Run in the Supabase SQL Editor (one idempotent script).
-- PREREQUISITE: run reference/rls-policies.sql FIRST (defines public.app_user_id()).
--
-- WHY: every strength number in every app is self-reported and therefore
-- worthless as evidence. This table is the first rung of fixing that: one row
-- is one witness request / co-sign on ONE lift in ONE session, with the claim
-- snapshotted (e1rm/topLoad in kg) at request time so what the witness signed
-- can never drift under them. Append-only by convention: the snapshot never
-- changes; status moves once, pending → cosigned | declined. Mirrors
-- RecordAttestation in prisma/schema.prisma; graded in core/attestation.ts.
-- Until this runs, /api/records/attest soft-degrades and PR badges read
-- Claimed/Sensed only.

create table if not exists "RecordAttestation" (
  "id"          text primary key default gen_random_uuid()::text,
  "ownerId"     text not null references "User"("id") on delete cascade,
  "witnessId"   text not null references "User"("id") on delete cascade,
  "sessionId"   text not null,
  "lift"        text not null,
  "e1rm"        double precision,
  "topLoad"     double precision,
  "status"      text not null default 'pending', -- pending | cosigned | declined
  "createdAt"   timestamp(3) not null default now(),
  "respondedAt" timestamp(3),
  unique ("sessionId", "lift", "witnessId")
);
create index if not exists "RecordAttestation_witnessId_status_idx" on "RecordAttestation" ("witnessId", "status");
create index if not exists "RecordAttestation_ownerId_createdAt_idx" on "RecordAttestation" ("ownerId", "createdAt");
create index if not exists "RecordAttestation_sessionId_idx" on "RecordAttestation" ("sessionId");

alter table "RecordAttestation" enable row level security;

-- both parties read the rows they are named on
drop policy if exists recordattestation_party_read on "RecordAttestation";
create policy recordattestation_party_read on "RecordAttestation" for select
  using ("ownerId" = public.app_user_id() or "witnessId" = public.app_user_id());

-- the OWNER creates the request (asks a witness) and may withdraw it
drop policy if exists recordattestation_owner_write on "RecordAttestation";
create policy recordattestation_owner_write on "RecordAttestation" for insert
  with check ("ownerId" = public.app_user_id());
drop policy if exists recordattestation_owner_delete on "RecordAttestation";
create policy recordattestation_owner_delete on "RecordAttestation" for delete
  using ("ownerId" = public.app_user_id() and "status" = 'pending');

-- the WITNESS answers a row addressed to them (co-sign / decline)
drop policy if exists recordattestation_witness_update on "RecordAttestation";
create policy recordattestation_witness_update on "RecordAttestation" for update
  using ("witnessId" = public.app_user_id())
  with check ("witnessId" = public.app_user_id());
