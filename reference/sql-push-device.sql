-- HYBRID — PushDevice: one phone that has agreed to be interrupted.
-- Run in the Supabase SQL Editor.
--
-- PREREQUISITE (run first, once):
--   reference/rls-policies.sql — defines public.app_user_id() (+ helpers).
-- Without app_user_id() the policy statements error and (in one transaction)
-- roll the table back.
--
-- Idempotent: safe to re-run. Mirrors the PushDevice model in
-- prisma/schema.prisma.
--
-- WHAT THIS IS. The delivery side of the bell. "NotificationState" (see
-- sql-notification-state.sql) records what you have SEEN; this records where
-- something can be SENT. Exactly three notifications use it — the morning
-- readiness nudge, a coach assignment, and a co-sign request on a claimed
-- record (packages/core/src/push.ts) — and nothing else until those three have
-- earned it.
--
-- WHY THE ROW CARRIES SO MUCH BESIDES THE TOKEN:
--   timezone      The nudge aims at the ATHLETE's 07:00, not the server's.
--                 07:00 UTC is 02:00 in Los Angeles, and one notification at
--                 two in the morning spends the push permission for good.
--   locale        iOS renders a push from what the SERVER sent, so the server
--                 has to know the language. The device reports it on register.
--   notify*       A MIRROR of user_metadata.notifications.{key} (the account
--                 stays the source of truth; every launch re-mirrors). The
--                 sender needs these in a WHERE clause — reading Supabase auth
--                 metadata per recipient would be an admin round-trip each,
--                 which the hourly nudge cron cannot afford.
--   environment   Which APNs host answered for this token ('production' /
--                 'sandbox'). Null until the first send, then remembered, so
--                 later sends skip the sandbox retry.
--   lastNudgeAt   One nudge per LOCAL day. The send window spans three hours so
--   nudgeStreak   a missed cron run doesn't cost the day, which means the day
--                 has to be closed by this stamp rather than by the hour. The
--                 streak counts unanswered mornings and stops the nudge after
--                 seven — a daily prompt to somebody who has stopped answering
--                 is how an app gets its notifications switched off wholesale.
--   retiredAt     APNs said the token is dead (410 Unregistered, or a bad
--                 token). Kept rather than deleted: the same device
--                 re-registers on the next launch and the row is revived, so
--                 the history survives a reinstall.
--
-- SECURITY NOTE ON RLS. A device token is not a secret that grants anything by
-- itself (a push needs the APNs key too), but it identifies a phone, so the
-- policy is owner-only like the rest of the private surface. The SENDER runs
-- server-side through Prisma's pooled connection (not a user's JWT), which is
-- why it can read every athlete's devices while nobody's browser can.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) The table.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists "PushDevice" (
  "id"             text primary key,
  "userId"         text not null references "User"("id") on delete cascade,
  "token"          text not null unique,
  "platform"       text not null default 'ios',
  "environment"    text,
  "timezone"       text,
  "locale"         text,
  "notifyCheckin"  boolean not null default true,
  "notifyCoach"    boolean not null default true,
  "notifyCosign"   boolean not null default true,
  "lastPushAt"     timestamp(3),
  "lastNudgeAt"    timestamp(3),
  "nudgeStreak"    integer not null default 0,
  "retiredAt"      timestamp(3),
  "createdAt"      timestamp(3) not null default now(),
  "updatedAt"      timestamp(3) not null default now()
);

-- "every live device for this athlete" (the sender) and "every live device that
-- wants the nudge" (the cron, which then filters by local hour in JS — the
-- timezone is a name, not something a Postgres index can order by).
create index if not exists "PushDevice_userId_retiredAt_idx"
  on "PushDevice" ("userId", "retiredAt");
create index if not exists "PushDevice_retiredAt_notifyCheckin_idx"
  on "PushDevice" ("retiredAt", "notifyCheckin");

-- ────────────────────────────────────────────────────────────────────────────
-- 2) RLS — owner-only, read and write.
-- ────────────────────────────────────────────────────────────────────────────
alter table "PushDevice" enable row level security;

drop policy if exists pushdevice_own on "PushDevice";
create policy pushdevice_own on "PushDevice" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Check it landed.
-- ────────────────────────────────────────────────────────────────────────────
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'PushDevice'
--  order by ordinal_position;
