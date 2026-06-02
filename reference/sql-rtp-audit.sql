-- HYBRID — add the audit log to RtpProtocol (medical sign-off + override trail).
-- Run in the Supabase SQL Editor. Adds an append-only JSON audit column that
-- records who attested each gate, who advanced, and who overrode (with reason).
--
-- NOTE: only needed if your RtpProtocol table predates the audit column. A
-- fresh sql-rtp.sql already includes it, so for a new install you can skip this.
-- Requires the RtpProtocol table to exist first (run sql-rtp.sql).

alter table "RtpProtocol"
  add column if not exists "audit" jsonb not null default '[]'::jsonb;
