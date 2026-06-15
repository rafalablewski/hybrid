-- Billing — the paid "Full" entitlement.
-- Run this in the Supabase SQL Editor (the agent can't reach the DB host).
-- Adds the billing columns to "User" used by apps/web/lib/billing.ts.
-- Safe to run more than once.

alter table "User" add column if not exists "entitlement" text not null default 'free';
alter table "User" add column if not exists "stripeCustomerId" text;
alter table "User" add column if not exists "subscriptionStatus" text;

-- One Stripe customer per user.
create unique index if not exists "User_stripeCustomerId_key"
  on "User" ("stripeCustomerId");
