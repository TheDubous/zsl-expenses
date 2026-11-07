-- ZSL Expenses PWA · Supabase schema v0.2
-- Run once in a NEW Supabase project in SQL Editor.
-- All user-owned data is isolated by Row Level Security.

create extension if not exists pgcrypto;

create table if not exists public.trainer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  club text not null default 'ZSL',
  created_at timestamptz not null default now()
);

create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('Sústredenie', 'Preteky')),
  starts_on date,
  ends_on date,
  currency text not null default 'EUR' check (currency in ('EUR', 'CZK', 'CHF')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint valid_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.event_riders (
  event_id uuid not null,
  rider_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (event_id, rider_id),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade,
  foreign key (rider_id, user_id) references public.riders (id, user_id) on delete cascade
);

create table if not exists public.funding_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null,
  kind text not null check (kind in ('advance', 'return')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null,
  merchant text not null default '',
  spent_on date,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  category text not null default 'other' check (category in ('fuel','resort','food','lodging','travel','other')),
  payment_method text not null default 'unknown' check (payment_method in ('unknown','cash','card')),
  receipt_path text,
  receipt_name text,
  bank_path text,
  bank_name text,
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade
);

create index if not exists expenses_by_event on public.expenses(event_id, created_at);
create index if not exists funding_by_event on public.funding_movements(event_id, occurred_on);

alter table public.trainer_profiles enable row level security;
alter table public.riders enable row level security;
alter table public.events enable row level security;
alter table public.event_riders enable row level security;
alter table public.funding_movements enable row level security;
alter table public.expenses enable row level security;

-- Explicit RLS for the authenticated user's own rows.
create policy "trainer_profile_owner" on public.trainer_profiles
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "riders_owner" on public.riders
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "events_owner" on public.events
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "event_riders_owner" on public.event_riders
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "funding_owner" on public.funding_movements
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "expenses_owner" on public.expenses
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Storage is PRIVATE: a user only sees files with their own UUID as the first path component.
insert into storage.buckets (id, name, public, file_size_limit)
values ('zsl-documents', 'zsl-documents', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

create policy "zsl_storage_read_own" on storage.objects
  for select to authenticated using
  (bucket_id = 'zsl-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "zsl_storage_insert_own" on storage.objects
  for insert to authenticated with check
  (bucket_id = 'zsl-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "zsl_storage_delete_own" on storage.objects
  for delete to authenticated using
  (bucket_id = 'zsl-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The client only needs the publishable / anon key and each user's JWT. NEVER expose service_role.
