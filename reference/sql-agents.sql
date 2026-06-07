-- HYBRID — AI Agent Org (admin-controlled executive team).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model AgentConfig.
-- The KNOWN role presets (CEO/CFO/CMO/COO) live in @hybrid/core; this table holds
-- the admin's editable agent definitions. Mutations are server-only (the admin
-- API is ADMIN-gated + audited) and reads are admin-only via that API, so RLS
-- here is a hard deny to every client role — no select/insert/update/delete
-- policy exists, so the table is reachable only through the server (service-role)
-- connection. (Service-role bypasses RLS; that is how the admin API reads it.)

create table if not exists "AgentConfig" (
  "id"                  text primary key default gen_random_uuid()::text,
  "role"                text not null,
  "name"                text not null,
  "status"              text not null default 'draft',            -- draft | active | paused
  "model"               text not null default 'claude-opus-4-8',
  "effort"              text not null default 'high',             -- low | medium | high | xhigh | max
  "authority"           text not null default 'functional',       -- executive | functional | advisor
  "reportsTo"           text,
  "mandate"             text not null,
  "responsibilities"    jsonb not null default '[]'::jsonb,       -- string[]
  "kpis"                jsonb not null default '[]'::jsonb,       -- { metric, target }[]
  "guardrails"          jsonb not null default '[]'::jsonb,       -- string[]
  "escalationThreshold" text not null default '',
  "tone"                text not null default '',
  "collaborators"       jsonb not null default '[]'::jsonb,       -- string[]
  "tools"               jsonb not null default '[]'::jsonb,       -- string[]
  "runtime"             text not null default 'messages',         -- messages | managed
  "managedAgentId"      text,                                     -- Claude Managed Agents id (created lazily, reused)
  "memoryStoreId"       text,                                     -- durable memory store id (created lazily, reused)
  "approvalThresholdUsd" double precision not null default 0,     -- hold for a 2nd operator when est. run cost ≥ this (0 = off)
  "budgetUsd7d"         double precision not null default 0,      -- auto-pause when trailing-7d spend ≥ this (0 = off)
  "updatedById"         text,
  "updatedByEmail"      text,
  "createdAt"           timestamp(3) not null default now(),
  "updatedAt"           timestamp(3) not null default now()
);
create index if not exists "AgentConfig_status_idx" on "AgentConfig" ("status");

-- Heal an older table created before these columns existed (no-op on a fresh
-- table created above). Keeps re-running this file safe and idempotent.
alter table "AgentConfig" add column if not exists "runtime"              text not null default 'messages';
alter table "AgentConfig" add column if not exists "managedAgentId"       text;
alter table "AgentConfig" add column if not exists "memoryStoreId"        text;
alter table "AgentConfig" add column if not exists "approvalThresholdUsd" double precision not null default 0;
alter table "AgentConfig" add column if not exists "budgetUsd7d"          double precision not null default 0;

-- Deny-by-default: enable RLS and add NO policies. Every client role is blocked;
-- only the server's service-role connection (which bypasses RLS) can touch it.
alter table "AgentConfig" enable row level security;
