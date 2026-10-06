-- Migration: Two Context Profiles (Business Context & Personal-Brand Context)
-- Product: Virel
-- Phase: P01

alter table public.clients
  add column if not exists audience_understanding text,
  add column if not exists pain_points text,
  add column if not exists commercial_details text,
  add column if not exists delivery_approach text,
  add column if not exists business_positioning text,
  add column if not exists questions_and_doubts text,
  add column if not exists role_and_work text,
  add column if not exists personal_positioning text,
  add column if not exists personal_readers text,
  add column if not exists principles text,
  add column if not exists voice_guide text,
  add column if not exists boundaries text,
  add column if not exists business_mentions text,
  add column if not exists profile_revision integer not null default 1;

-- Ensure profile_revision is set to at least 1 for any existing clients
update public.clients
set profile_revision = 1
where profile_revision is null;
