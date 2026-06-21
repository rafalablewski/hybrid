-- HYBRID — User.coachVerified column (the verified-coach tick).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model User.
-- A COACH whose credentials an admin has vetted gets coachVerified = true; the
-- flag is surfaced as a "✓" next to the coach's name wherever a client sees them
-- (web + mobile, classic + Aurora). Set automatically when an admin approves a
-- coach application, and togglable on the admin Users → user record.

alter table "User"
  add column if not exists "coachVerified" boolean not null default false;
