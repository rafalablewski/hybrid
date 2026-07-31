-- HYBRID — CheckinRead: every readiness answer, appended rather than overwritten.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model CheckinRead.
-- Idempotent. PREREQUISITE: reference/rls-policies.sql (defines
-- public.app_user_id() + public.is_active_coach()); without them the policy
-- statements error and, in a single transaction, roll the table back.
--
-- WHY. Checkin holds ONE row per day, and "how ready do you feel?" lived in its
-- `energy` column alone — so an athlete answering again hours later could only
-- overwrite the morning's answer, and the Today card locked the faces rather
-- than let that happen. "Flat ninety minutes after squats" and "flat fourteen
-- hours later" are two measurements, not one answer corrected: the second is
-- the one that should move training, and the FIRST is what makes it
-- interpretable (the drop between them, against the population decay curve, is
-- a direct read of this athlete's own clearance rate).
--
-- Each answer now lands here with its own clock. Checkin.energy keeps the
-- DECISIVE read (the latest one not taken in the shadow of a session), so every
-- existing reader of that column — the volume estimator, the load factor, the
-- coach view — keeps working unchanged and no backfill is needed.
--
-- SAFE TO RUN LATE: the API treats a missing table as "no extra reads" and
-- falls back to the single stored value, so the app keeps working either way.
-- Run it to switch the second read on.

create table if not exists "CheckinRead" (
  "id"            text primary key default gen_random_uuid()::text,
  "checkinId"     text not null references "Checkin"("id") on delete cascade,
  "userId"        text not null references "User"("id") on delete cascade,
  "metric"        text not null default 'energy',
  "value"         integer not null,
  "loggedAt"      timestamp(3) not null default now(),
  -- Hours since the session that ended before this read; null when the athlete
  -- hadn't trained, or when no session carried a usable clock. Never a guess.
  "sinceSessionH" double precision
);

create index if not exists "CheckinRead_userId_loggedAt_idx" on "CheckinRead" ("userId", "loggedAt");
create index if not exists "CheckinRead_checkinId_idx" on "CheckinRead" ("checkinId");

alter table "CheckinRead" enable row level security;

-- the athlete owns their reads
drop policy if exists checkinread_own on "CheckinRead";
create policy checkinread_own on "CheckinRead" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- an active coach reads their client's reads, on the same terms as the day row:
-- only where the athlete chose to share that day's check-in.
drop policy if exists checkinread_coach_read on "CheckinRead";
create policy checkinread_coach_read on "CheckinRead" for select
  using (
    public.is_active_coach("userId")
    and exists (
      select 1 from "Checkin" c
      where c."id" = "CheckinRead"."checkinId" and c."sharedWithCoach" = true
    )
  );

-- BACKFILL: the answer every existing day already carries, as its first read.
-- One row per check-in that has a readiness value and none recorded yet, so the
-- history isn't blank the day this ships and a day logged before today can still
-- form a pair with a read taken after it.
insert into "CheckinRead" ("checkinId", "userId", "metric", "value", "loggedAt")
select c."id", c."userId", 'energy', c."energy", coalesce(c."createdAt", c."weekOf")
from "Checkin" c
where c."energy" is not null
  and not exists (select 1 from "CheckinRead" r where r."checkinId" = c."id");
