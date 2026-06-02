-- HYBRID — add the audit log to RtpProtocol (medical sign-off + override trail).
-- Run in the Supabase SQL Editor. Adds an append-only JSON audit column that
-- records who attested each gate, who advanced, and who overrode (with reason).

alter table "RtpProtocol"
  add column if not exists "audit" jsonb not null default '[]'::jsonb;
