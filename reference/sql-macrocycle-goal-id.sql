-- HYBRID — normalise Macrocycle.goal from display NAMES to GOAL_TREE IDS.
-- Run in the Supabase SQL Editor. Idempotent; safe to run more than once.
--
-- OPTIONAL, AND THAT IS THE POINT. The application reads both representations
-- (packages/core/src/goal-id.ts) and every write path already normalises, so
-- nothing is broken while old rows still hold names — they display and resolve
-- exactly as they did. This script only makes the column uniform, so that
-- grouping it (the admin stats plan-popularity chart) needs no merge step and
-- so a future foreign key becomes possible.
--
-- Rows holding anything not listed here are LEFT ALONE by design: a coach can
-- author a free-text goal ("Return from ACL, phase 2") and that is not a
-- library goal to be mapped onto one.

update "Macrocycle" set "goal" = 'power'        where "goal" = 'Powerlifting';
update "Macrocycle" set "goal" = 'oly'          where "goal" = 'Olympic Weightlifting';
update "Macrocycle" set "goal" = 'strongman'    where "goal" = 'Strongman';
update "Macrocycle" set "goal" = 'bb'           where "goal" = 'Bodybuilding';
update "Macrocycle" set "goal" = 'fatloss'      where "goal" = 'Fat Loss';
update "Macrocycle" set "goal" = 'tri'          where "goal" = 'Triathlon';
update "Macrocycle" set "goal" = 'run'          where "goal" = 'Running';
update "Macrocycle" set "goal" = 'cycling'      where "goal" = 'Cycling';
update "Macrocycle" set "goal" = 'swim'         where "goal" = 'Swimming';
update "Macrocycle" set "goal" = 'hyrox'        where "goal" = 'Hyrox';
update "Macrocycle" set "goal" = 'crossfit'     where "goal" = 'CrossFit';
update "Macrocycle" set "goal" = 'hybrid'       where "goal" = 'Hybrid Athlete';
update "Macrocycle" set "goal" = 'calisthenics' where "goal" = 'Calisthenics';
update "Macrocycle" set "goal" = 'kettlebell'   where "goal" = 'Kettlebell';
update "Macrocycle" set "goal" = 'tactical'     where "goal" = 'Tactical & Military';
update "Macrocycle" set "goal" = 'sport'        where "goal" = 'Sport Performance';
update "Macrocycle" set "goal" = 'fitness'      where "goal" = 'General Fitness';
update "Macrocycle" set "goal" = 'mobility'     where "goal" = 'Mobility & Longevity';
update "Macrocycle" set "goal" = 'prenatal'     where "goal" = 'Pre & Postnatal';

-- What is left that the library does not recognise — expected to be coach-
-- authored goals only. Worth eyeballing once after the run.
select "goal", count(*) as n
from "Macrocycle"
where "goal" not in (
  'power','oly','strongman','bb','fatloss','tri','run','cycling','swim','hyrox',
  'crossfit','hybrid','calisthenics','kettlebell','tactical','sport','fitness',
  'mobility','prenatal'
)
group by "goal"
order by n desc;
