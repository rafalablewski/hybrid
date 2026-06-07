-- HYBRID — Agent run history + runtime columns.
-- Run in the Supabase SQL Editor AFTER sql-agents.sql. Mirrors the additions to
-- prisma/schema.prisma (AgentConfig new columns + new AgentRun table).
-- Server-only (the admin API is ADMIN-gated + audited); RLS is deny-by-default.

-- 1. New AgentConfig columns: runtime choice + Managed-Agents bookkeeping (the
--    durable agent + memory-store ids are created lazily and reused).
alter table "AgentConfig" add column if not exists "runtime"        text not null default 'messages';
alter table "AgentConfig" add column if not exists "managedAgentId" text;
alter table "AgentConfig" add column if not exists "memoryStoreId"  text;

-- 2. Run history / transcript.
create table if not exists "AgentRun" (
  "id"           text primary key default gen_random_uuid()::text,
  "agentId"      text not null,
  "agentRole"    text not null,
  "agentName"    text not null,
  "task"         text not null,
  "output"       text not null,
  "steps"        jsonb not null default '[]'::jsonb,   -- { agent, role, task, output }[]
  "inputTokens"  integer not null default 0,
  "outputTokens" integer not null default 0,
  "status"       text not null default 'ok',           -- ok | error
  "runtime"      text not null default 'messages',     -- messages | managed
  "ranById"      text,
  "ranByEmail"   text,
  "createdAt"    timestamp(3) not null default now()
);
create index if not exists "AgentRun_agentId_createdAt_idx" on "AgentRun" ("agentId", "createdAt");

-- Deny-by-default: enable RLS, add NO policies. Reachable only via the server's
-- service-role connection (which bypasses RLS), exactly like AgentConfig.
alter table "AgentRun" enable row level security;
