-- HYBRID — Agent schedules (standing tasks that run an agent on a cadence).
-- Run in the Supabase SQL Editor AFTER sql-agents.sql + sql-agent-runs.sql.
-- Mirrors prisma/schema.prisma model AgentSchedule. The cron route
-- (/api/cron/agents, protected by CRON_SECRET) reads/writes these server-side;
-- RLS is deny-by-default (reachable only via the service-role connection).

create table if not exists "AgentSchedule" (
  "id"             text primary key default gen_random_uuid()::text,
  "agentId"        text not null,
  "task"           text not null,
  "cadence"        text not null default 'daily',   -- hourly | daily | weekly
  "enabled"        boolean not null default true,
  "lastRunAt"      timestamp(3),
  "nextRunAt"      timestamp(3),
  "createdById"    text,
  "createdByEmail" text,
  "createdAt"      timestamp(3) not null default now(),
  "updatedAt"      timestamp(3) not null default now()
);
create index if not exists "AgentSchedule_enabled_nextRunAt_idx" on "AgentSchedule" ("enabled", "nextRunAt");
create index if not exists "AgentSchedule_agentId_idx" on "AgentSchedule" ("agentId");

-- Deny-by-default: enable RLS, add NO policies.
alter table "AgentSchedule" enable row level security;
