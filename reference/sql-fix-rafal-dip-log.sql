-- HYBRID — one-time data fix: rafal.ablewski95@gmail.com logged "Dip" but
-- meant "Chest Dip". Run in the Supabase SQL Editor.
--
-- Context: the exercise catalog used to have one ambiguous "Dip" entry; it has
-- since been split into "Triceps Dip" (upright torso, elbows tucked) and
-- "Chest Dip" (forward lean, elbows flared) — see exercise-db.ts. Every OTHER
-- athlete's historical "Dip" logs correctly canonicalize to "Triceps Dip" via
-- the GYM_ALIASES rename breadcrumb (see exercise-name-canonicalization) — no
-- SQL needed for them. This one athlete is the exception: they actually
-- performed the chest-primary variant, so their logged block needs to say
-- "Chest Dip" instead of inheriting the triceps-default alias.
--
-- Session.blocks is a JSON array of blocks; only the `name` field needs
-- correcting — sets/reps/load are untouched, and every downstream summary
-- (muscle attribution, tonnage, PRs) is derived live from the name at read
-- time, so nothing else needs to change.
--
-- Safe: scoped to this one user's sessions, and only touches a block whose
-- name is exactly "dip" (case-insensitive) — "Chest Dip", "Weighted Dip" and
-- "Bench Dip" are left alone. Idempotent: after the fix runs once, no block
-- named "dip" remains, so re-running is a no-op.

-- 1) PREVIEW — inspect which sessions/blocks will change before running the
--    update below.
select
  s.id,
  s.title,
  s."startedAt",
  b.value ->> 'name' as block_name
from "Session" s
join "User" u on u.id = s."userId"
cross join lateral jsonb_array_elements(s.blocks) as b(value)
where u.email = 'rafal.ablewski95@gmail.com'
  and lower(b.value ->> 'name') = 'dip';

-- 2) FIX — rename the matching block(s) to "Chest Dip".
update "Session" s
set blocks = (
  select jsonb_agg(
    case
      when lower(b.value ->> 'name') = 'dip'
        then jsonb_set(b.value, '{name}', '"Chest Dip"')
      else b.value
    end
    order by b.ord
  )
  from jsonb_array_elements(s.blocks) with ordinality as b(value, ord)
)
from "User" u
where u.id = s."userId"
  and u.email = 'rafal.ablewski95@gmail.com'
  and exists (
    select 1
    from jsonb_array_elements(s.blocks) as b(value)
    where lower(b.value ->> 'name') = 'dip'
  );

-- 3) VERIFY (optional): should return zero rows.
-- select s.id, b.value ->> 'name' as block_name
-- from "Session" s
-- join "User" u on u.id = s."userId"
-- cross join lateral jsonb_array_elements(s.blocks) as b(value)
-- where u.email = 'rafal.ablewski95@gmail.com'
--   and lower(b.value ->> 'name') = 'dip';
