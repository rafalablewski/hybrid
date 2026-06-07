-- HYBRID — Agent KPI measurements + Agent HQ notifications.
-- Run in the Supabase SQL Editor AFTER the earlier agent migrations. Mirrors
-- prisma/schema.prisma models AgentKpiMeasurement + AgentNotification. Server-
-- only (admin API / run paths write them); RLS deny-by-default.

-- KPI actuals over time (target-vs-actual scorecard).
create table if not exists "AgentKpiMeasurement" (
  "id"              text primary key default gen_random_uuid()::text,
  "agentId"         text not null,
  "metric"          text not null,
  "value"           double precision not null,
  "note"            text,
  "recordedById"    text,
  "recordedByEmail" text,
  "createdAt"       timestamp(3) not null default now()
);
create index if not exists "AgentKpiMeasurement_agentId_metric_createdAt_idx"
  on "AgentKpiMeasurement" ("agentId", "metric", "createdAt");
alter table "AgentKpiMeasurement" enable row level security;

-- Persistent, dismissible HQ notifications.
create table if not exists "AgentNotification" (
  "id"        text primary key default gen_random_uuid()::text,
  "kind"      text not null,
  "agentId"   text,
  "agentName" text,
  "title"     text not null,
  "body"      text,
  "severity"  text not null default 'warning',   -- info | warning | error
  "read"      boolean not null default false,
  "refId"     text,
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "AgentNotification_read_createdAt_idx"
  on "AgentNotification" ("read", "createdAt");
alter table "AgentNotification" enable row level security;
