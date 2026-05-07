-- Fieldwork Flow cloud database schema.
-- Run this in Supabase SQL Editor after creating the project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supervisors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supervisor_name text not null,
  credential text,
  email text,
  organization text,
  active_status boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fieldwork_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  duration_hours numeric(6,2) not null check (duration_hours >= 0),
  activity_type text not null,
  activity_category text not null check (activity_category in ('Restricted', 'Unrestricted')),
  experience_type text not null check (experience_type in ('Independent', 'Supervised')),
  supervision_type text not null default 'None' check (supervision_type in ('Individual', 'Group', 'None')),
  supervision_method text not null default 'None' check (supervision_method in ('In-person', 'Telehealth', 'Phone', 'Asynchronous review', 'None')),
  supervisor_id uuid references public.supervisors(id) on delete set null,
  client_present boolean not null default false,
  supervisor_client_observation boolean not null default false,
  setting text,
  notes text,
  manual_override boolean not null default false,
  override_reason text,
  parent_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supervision_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fieldwork_entry_id uuid not null references public.fieldwork_entries(id) on delete cascade,
  supervisor_id uuid references public.supervisors(id) on delete set null,
  date date not null,
  competencies_targeted text,
  feedback_received text,
  supervisee_performance text,
  assignments text,
  next_steps text,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  weekly_hour_goal numeric(6,2) not null default 20,
  unrestricted_target_percentage integer not null default 60,
  supervision_target_percentage integer not null default 5,
  default_supervisor_id uuid references public.supervisors(id) on delete set null,
  default_setting text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.supervisors enable row level security;
alter table public.fieldwork_entries enable row level security;
alter table public.supervision_notes enable row level security;
alter table public.settings enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "supervisors_all_own" on public.supervisors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "fieldwork_entries_all_own" on public.fieldwork_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "supervision_notes_all_own" on public.supervision_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "settings_all_own" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists fieldwork_entries_set_updated_at on public.fieldwork_entries;
create trigger fieldwork_entries_set_updated_at
before update on public.fieldwork_entries
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();
