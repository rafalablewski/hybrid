-- HYBRID — one-time backfill: Checkin weigh-ins -> bodyMass signals.
-- Run in the Supabase SQL Editor. The app now mirrors each new check-in
-- weigh-in into the Signal ontology (so the nutrition engine + bodyweight
-- trend run on real weight), but check-ins logged BEFORE that change have no
-- matching Signal row. This backfills them.
--
-- Safe + idempotent: it only inserts a bodyMass signal where one doesn't
-- already exist for the same (userId, ts, source='checkin'), so re-running it
-- does nothing. Does not depend on the Signal de-dup unique index.

insert into "Signal" ("id", "userId", "kind", "value", "unit", "source", "ts")
select
  gen_random_uuid()::text,
  c."userId",
  'bodyMass',
  c."bodyMassKg",
  'kg',
  'checkin',
  c."weekOf"
from "Checkin" c
where c."bodyMassKg" is not null
  and c."bodyMassKg" > 0
  and not exists (
    select 1
    from "Signal" s
    where s."userId" = c."userId"
      and s."kind"   = 'bodyMass'
      and s."ts"     = c."weekOf"
      and s."source" = 'checkin'
  );

-- Verify (optional): how many bodyMass-from-checkin rows you now have.
-- select count(*) from "Signal" where "kind" = 'bodyMass' and "source" = 'checkin';
