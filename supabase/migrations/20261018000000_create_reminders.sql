-- Arcloop: reminders (forward-only, additive).
--
-- Adds reminder_preferences (one row per user) and task_reminders (an optional reminder time for one
-- task occurrence). It touches no existing object and no existing data.
--
-- Principles enforced here, not only in the app:
--   * a user can only ever see or change their own rows (RLS); a task reminder can only point at
--     the same user's occurrence (composite foreign key that includes user_id);
--   * nothing is created for the user: reminders are off until switched on, and a task has a
--     reminder only if the user set one;
--   * a reminder that was already delivered is remembered (notified_at / last_notified_on) so the
--     same scheduled reminder is not delivered twice, even from two open tabs;
--   * changing a reminder's time makes it deliverable again.
--
-- This only stores preferences. Delivery happens in the open app (see docs/KNOWN_ISSUES.md);
-- there is no server-side scheduler or push service.

create function public.reminder_weekdays_valid(p_days smallint[])
returns boolean
language sql
immutable
as $$
  select p_days is not null
     and cardinality(p_days) between 1 and 7
     and p_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
     and cardinality(p_days) = (select count(distinct d) from unnest(p_days) as d)
$$;

create table public.reminder_preferences (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  enabled          boolean     not null default false,
  remind_time      time        not null default '09:00',
  -- ISO weekdays, 1 = Monday ... 7 = Sunday.
  weekdays         smallint[]  not null default '{1,2,3,4,5,6,7}',
  -- Local date of the last daily reminder that was delivered (the 1970 default means "never").
  last_notified_on date        not null default '1970-01-01',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint reminder_preferences_weekdays_valid check (public.reminder_weekdays_valid(weekdays)),
  constraint reminder_preferences_time_whole_minutes check (date_trunc('minute', remind_time) = remind_time)
);

create table public.task_reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  occurrence_id uuid        not null,
  -- Copied from the occurrence by a trigger (never writable by clients) so upcoming reminders can be
  -- listed by date without joining. Occurrence dates never change (moving a task creates a new one).
  plan_date     date        not null,
  remind_time   time        not null,
  notified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint task_reminders_occurrence_key unique (occurrence_id),
  constraint task_reminders_time_whole_minutes check (date_trunc('minute', remind_time) = remind_time),
  constraint task_reminders_occurrence_fkey foreign key (user_id, occurrence_id)
    references public.task_occurrences (user_id, id) on delete cascade
);
create index task_reminders_user_date_idx on public.task_reminders (user_id, plan_date);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.reminder_preferences_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger reminder_preferences_before_write
  before insert or update on public.reminder_preferences
  for each row execute function public.reminder_preferences_before_write();

create function public.task_reminders_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    select o.plan_date into new.plan_date
      from public.task_occurrences o
     where o.id = new.occurrence_id and o.user_id = new.user_id;
    new.notified_at := null;
  else
    new.user_id := old.user_id;
    new.occurrence_id := old.occurrence_id;
    new.plan_date := old.plan_date;
    new.created_at := old.created_at;
    -- A new time is a new schedule: it can be delivered once more.
    if new.remind_time is distinct from old.remind_time then
      new.notified_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger task_reminders_before_write
  before insert or update on public.task_reminders
  for each row execute function public.task_reminders_before_write();

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------

alter table public.reminder_preferences enable row level security;
alter table public.task_reminders enable row level security;

revoke all on table public.reminder_preferences from public, anon, authenticated;
revoke all on table public.task_reminders from public, anon, authenticated;
revoke all on function public.reminder_preferences_before_write() from public, anon, authenticated;
revoke all on function public.task_reminders_before_write() from public, anon, authenticated;

grant select, delete on public.reminder_preferences to authenticated;
grant insert (user_id, enabled, remind_time, weekdays, last_notified_on) on public.reminder_preferences to authenticated;
grant update (enabled, remind_time, weekdays, last_notified_on) on public.reminder_preferences to authenticated;

grant select, delete on public.task_reminders to authenticated;
grant insert (user_id, occurrence_id, remind_time) on public.task_reminders to authenticated;
grant update (remind_time, notified_at) on public.task_reminders to authenticated;

create policy "Users read their own reminder preferences" on public.reminder_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create their own reminder preferences" on public.reminder_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users change their own reminder preferences" on public.reminder_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users reset their own reminder preferences" on public.reminder_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Users read their own task reminders" on public.task_reminders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create their own task reminders" on public.task_reminders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users change their own task reminders" on public.task_reminders
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users remove their own task reminders" on public.task_reminders
  for delete to authenticated using (user_id = (select auth.uid()));
