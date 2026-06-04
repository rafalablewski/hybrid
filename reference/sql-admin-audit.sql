-- HYBRID — AdminAudit table (privileged-action accountability log).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model AdminAudit.
--
-- This table is the institutional audit trail for the admin panel: every
-- privileged action (role changes, support lookups, etc.) is appended here by
-- the server-side /api/admin/* routes. It is written and read ONLY through the
-- service-role Prisma connection — never by a browser/Supabase client. So RLS
-- is enabled with NO policies: that denies all anon/authenticated access while
-- the server (which bypasses RLS) keeps full access. Append-only by convention;
-- there is intentionally no UPDATE/DELETE path in the app.

create table if not exists "AdminAudit" (
  "id"         text primary key default gen_random_uuid()::text,
  "actorId"    text not null references "User"("id"),
  "actorEmail" text not null,
  "action"     text not null,
  "targetType" text,
  "targetId"   text,
  "summary"    text,
  "metadata"   jsonb,
  "ip"         text,
  "createdAt"  timestamp(3) not null default now()
);

create index if not exists "AdminAudit_actorId_idx" on "AdminAudit" ("actorId");
create index if not exists "AdminAudit_targetType_targetId_idx" on "AdminAudit" ("targetType", "targetId");
create index if not exists "AdminAudit_createdAt_idx" on "AdminAudit" ("createdAt");

-- Lock the table to the server only. RLS on + zero policies = no client can
-- read or write it; the service-role connection Prisma uses is unaffected.
alter table "AdminAudit" enable row level security;
