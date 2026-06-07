-- HYBRID — Agent approval gates + per-agent budget caps.
-- Run in the Supabase SQL Editor AFTER the earlier agent migrations. Mirrors the
-- AgentConfig additions + the new AgentApproval model. Server-only; RLS
-- deny-by-default (reachable only via the service-role connection).

-- AgentConfig: approval threshold + 7-day budget cap (both 0 = off).
alter table "AgentConfig" add column if not exists "approvalThresholdUsd" double precision not null default 0;
alter table "AgentConfig" add column if not exists "budgetUsd7d"          double precision not null default 0;

-- Runs held for a second operator's approval.
create table if not exists "AgentApproval" (
  "id"               text primary key default gen_random_uuid()::text,
  "agentId"          text not null,
  "agentName"        text not null,
  "task"             text not null,
  "estimateUsd"      double precision not null default 0,
  "runtime"          text not null default 'messages',
  "status"           text not null default 'pending',   -- pending | approved | denied
  "requestedById"    text,
  "requestedByEmail" text,
  "decidedById"      text,
  "decidedByEmail"   text,
  "runId"            text,
  "createdAt"        timestamp(3) not null default now(),
  "decidedAt"        timestamp(3)
);
create index if not exists "AgentApproval_status_createdAt_idx" on "AgentApproval" ("status", "createdAt");
alter table "AgentApproval" enable row level security;
