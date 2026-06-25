-- HYBRID — trigram indexes for social/marketplace search.
-- Run in the Supabase SQL Editor (after reference/sql-social.sql). Optional but
-- recommended once you have many users/coaches: people search and the coach
-- directory use case-insensitive ILIKE/contains, which without these indexes
-- is a sequential scan. pg_trgm + GIN makes substring search index-backed.
-- Idempotent + safe to re-run.

create extension if not exists pg_trgm;

-- people search (/api/social/search): handle, display name, real name
create index if not exists "SocialProfile_handle_trgm" on "SocialProfile" using gin ("handle" gin_trgm_ops);
create index if not exists "SocialProfile_displayName_trgm" on "SocialProfile" using gin ("displayName" gin_trgm_ops);
create index if not exists "User_name_trgm" on "User" using gin ("name" gin_trgm_ops);

-- coach directory (/api/coaches): headline + bio free-text
create index if not exists "CoachProfile_headline_trgm" on "CoachProfile" using gin ("headline" gin_trgm_ops);
create index if not exists "CoachProfile_bio_trgm" on "CoachProfile" using gin ("bio" gin_trgm_ops);
