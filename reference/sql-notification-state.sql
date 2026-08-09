-- HYBRID — NotificationState: the notification read state, per ACCOUNT.
-- Run in the Supabase SQL Editor.
--
-- PREREQUISITE (run first, once):
--   reference/rls-policies.sql — defines public.app_user_id() (+ helpers).
-- Without app_user_id() the policy statements error and (in one transaction)
-- roll the table back.
--
-- Idempotent: safe to re-run. Mirrors the NotificationState model in
-- prisma/schema.prisma.
--
-- WHAT THIS IS. The bell's read state — which rows you've seen, which you've
-- held unread, which you've thrown away. It lived per-DEVICE (localStorage /
-- AsyncStorage) on the same contract as the logger preferences: small,
-- idempotent, costing you at worst one extra glance. That held right up until a
-- row could be DELETED. A badge that disagrees between your phone and your
-- laptop is a nuisance; a notification you deliberately threw away reappearing
-- on the other device is the app forgetting something you told it.
--
-- Owner-only, like the rest of the private surface: no coach-read policy.
--
-- THE SHAPE mirrors @hybrid/core's NotifReadState exactly:
--   seenAt        the watermark — everything stamped at or before it is read.
--   readIds       rows read individually, plus future-dated rows (an upcoming
--                 session's timestamp is ahead of any "read up to now" sweep,
--                 so the watermark alone can neither cover it nor leave it).
--   unreadIds     rows put BACK to unread by hand. Beats the watermark: such a
--                 row is older than seenAt by definition, so without this set
--                 the next sweep would silently undo the athlete's decision.
--   dismissedIds  tombstones. There is no notifications TABLE to delete a row
--                 from — the list is a projection over training, social events
--                 and the feel schedule — so a delete is a remembered id that
--                 every later build filters out.
--
-- Each array is bounded to 200 ids by the engine (NOTIF_READ_ID_CAP) before it
-- ever reaches here, so the row stays small: a read state is not a log.
--
-- WRITES ARE OPS, NOT BLOBS. /api/notifications/state takes a decision
-- ("read this id", "mark all read as of now") and applies it server-side with
-- the same @hybrid/core reducer both clients use. Two devices therefore never
-- need their states merged — they're applied in arrival order, which is the
-- order they happened in. That's also why there's no version/etag column here.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) The table — one row per user, keyed BY the user (no surrogate id).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists "NotificationState" (
  "userId"       text primary key references "User"("id") on delete cascade,
  "seenAt"       timestamp(3),
  "readIds"      text[] not null default '{}',
  "unreadIds"    text[] not null default '{}',
  "dismissedIds" text[] not null default '{}',
  "updatedAt"    timestamp(3) not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) RLS — owner-only, read and write.
-- ────────────────────────────────────────────────────────────────────────────
alter table "NotificationState" enable row level security;

drop policy if exists notificationstate_own on "NotificationState";
create policy notificationstate_own on "NotificationState" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Check it landed.
-- ────────────────────────────────────────────────────────────────────────────
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'NotificationState'
--  order by ordinal_position;
