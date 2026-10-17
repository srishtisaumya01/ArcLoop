-- Arcloop: profiles (Phase 3 foundation)
--
-- One profile row per auth user. Privacy by default: both visibility settings
-- start as 'private', and NO policy lets one user read another user's profile.
-- Cross-user visibility (groups, leaderboards) is added in a later migration,
-- through a view/function that exposes only the intended columns.

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text,
  timezone            text not null default 'UTC',
  interests           text[] not null default '{}',
  profile_visibility  text not null default 'private',
  progress_visibility text not null default 'private',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  constraint profiles_timezone_length
    check (char_length(timezone) between 1 and 64),
  constraint profiles_interests_size
    check (cardinality(interests) <= 10 and char_length(array_to_string(interests, ',')) <= 400),
  constraint profiles_profile_visibility_valid
    check (profile_visibility in ('private', 'public')),
  constraint profiles_progress_visibility_valid
    check (progress_visibility in ('private', 'public'))
);

comment on table public.profiles is 'One row per user. Created automatically on sign-up; users can read and edit only their own row.';

-- Keep updated_at honest, and make sure the timezone is a real IANA zone.
create function public.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone: %', new.timezone using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- Create the profile when a user signs up. SECURITY DEFINER because the new
-- user has no INSERT privilege on profiles (clients cannot create profiles).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions must never be callable as RPC endpoints.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.profiles_before_write() from public, anon, authenticated;

-- Row Level Security
alter table public.profiles enable row level security;

-- Privileges: start from nothing, then grant the minimum.
revoke all on table public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
-- Column-level UPDATE: id, created_at and updated_at can never be set by clients.
grant update (display_name, timezone, interests, profile_visibility, progress_visibility)
  on public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Intentionally no INSERT or DELETE policies and no INSERT/DELETE grants:
-- profiles are created by the trigger above and removed by ON DELETE CASCADE
-- when the auth user is deleted.
