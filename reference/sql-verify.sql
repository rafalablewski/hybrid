-- HYBRID — schema verification (READ-ONLY). Run in the Supabase SQL editor.
-- Lists every table/function the app expects and marks ✓ present / ✗ MISSING.
-- Objects this session needs are tagged [session]; app_user_id()
-- (from rls-policies.sql) is the prerequisite for the RLS policies.

with expected(obj, kind, note) as (values
  -- core
  ('User','table',''),('Session','table',''),('Macrocycle','table',''),
  ('Biometric','table',''),('Signal','table',''),('Plan','table',''),
  -- coaching
  ('CoachLink','table',''),('CoachNote','table',''),('Checkin','table',''),
  ('WorkoutTemplate','table',''),('Assignment','table',''),
  -- performance / roadmap
  ('RtpProtocol','table',''),('RiskOutcome','table',''),('ModelFit','table',''),
  ('VideoAnalysis','table',''),('Event','table',''),('TalentProfile','table',''),
  ('Connection','table',''),
  -- teams
  ('Organization','table',''),('Team','table',''),('Membership','table',''),
  ('OrgInvite','table',''),
  -- governance / CMS / trust & safety
  ('AdminAudit','table',''),('Announcement','table',''),('Exercise','table',''),
  ('MediaAsset','table',''),('Translation','table',''),('Report','table',''),
  ('FeatureFlag','table','[session] sql-feature-flags.sql'),
  -- RLS helper (prerequisite for the RLS policies)
  ('app_user_id','function','rls-policies.sql')
)
select
  e.obj,
  e.note,
  case
    when e.kind = 'table' and exists (
      select 1 from information_schema.tables t
      where t.table_schema = 'public' and t.table_name = e.obj
    ) then 'OK present'
    when e.kind = 'function' and exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = e.obj
    ) then 'OK present'
    else '>> MISSING'
  end as status
from expected e
order by (e.note <> '') desc, status desc, e.obj;
