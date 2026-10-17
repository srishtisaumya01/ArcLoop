-- Arcloop: Daily Planning & Progress Engine tables (forward-only, additive).
--
-- Adds task_templates, day_plans and task_occurrences. It touches no existing
-- object and no existing data. Design: docs/DAILY_PLANNING_SPEC.md (sections 6, 8, 11a, 11b).
-- Requires PostgreSQL 15+ (ON DELETE SET NULL with a column list).
--
-- Principles enforced here, not only in the app:
--   * a user can only ever see or change their own rows (RLS), and no row can
--     reference another user's row (composite foreign keys that include user_id);
--   * history is preserved: occurrences are self-contained snapshots, days older
--     than the 7-date editing window are read-only, progress is never hard-deleted
--     by a client, and the original plan cannot be rewritten after its baseline;
--   * server-maintained fields (baseline, original-plan flag, timestamps) cannot be
--     written by clients.

-- ---------------------------------------------------------------------------
-- Configuration helpers
-- ---------------------------------------------------------------------------

-- The only place "now" is read, so tests can substitute a fixed clock.
create function public.planner_now()
returns timestamptz
language sql
stable
as $$ select now() $$;

-- D5: editable window = today plus the previous 6 dates (7 dates in total).
create function public.planner_past_edit_window_dates()
returns integer
language sql
immutable
as $$ select 7 $$;

-- Sanity bound only (spec section 7). The app enforces its own, shorter, provisional
-- planning-ahead limit; keeping this looser means changing that limit never needs a migration.
create function public.planner_max_days_ahead()
returns integer
language sql
immutable
as $$ select 366 $$;

-- PROVISIONAL abuse caps (spec section 8); the numbers are not an approved product decision.
create function public.planner_max_active_templates()
returns integer
language sql
immutable
as $$ select 200 $$;

create function public.planner_max_occurrences_per_day()
returns integer
language sql
immutable
as $$ select 100 $$;

-- The user's local calendar date, from their profile timezone (UTC if unset).
create function public.planner_today(p_user uuid)
returns date
language sql
stable
as $$
  select (public.planner_now() at time zone
          coalesce((select p.timezone from public.profiles p where p.id = p_user), 'UTC'))::date
$$;

create function public.planner_valid_weekdays(days smallint[])
returns boolean
language sql
immutable
as $$
  select days is not null
    and cardinality(days) between 1 and 7
    and not exists (select 1 from unnest(days) as d where d is null or d not between 1 and 7)
    and cardinality(days) = (select count(distinct d) from unnest(days) as d)
$$;

-- ---------------------------------------------------------------------------
-- task_templates: the reusable definition ("what I intend to do")
-- ---------------------------------------------------------------------------

create table public.task_templates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  title             text not null,
  description       text,
  category          text,
  is_priority       boolean not null default false,
  planned_start     time,
  planned_end       time,
  estimated_minutes smallint,
  recurrence        text not null,
  weekdays          smallint[],
  starts_on         date not null,
  ends_on           date,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- lets other tables reference "this user's template" with a composite key
  constraint task_templates_user_id_id_key unique (user_id, id),

  constraint task_templates_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint task_templates_description_length check (description is null or char_length(description) <= 1000),
  constraint task_templates_category_length check (category is null or char_length(btrim(category)) between 1 and 40),
  constraint task_templates_estimate_range check (estimated_minutes is null or estimated_minutes between 1 and 1440),
  -- point-in-time tasks (start only) are allowed; an end needs a start and must be later (no overnight spans: sleep uses two tasks)
  constraint task_templates_time_order check (planned_end is null or (planned_start is not null and planned_end > planned_start)),
  constraint task_templates_recurrence_valid check (recurrence in ('once', 'daily', 'weekly')),
  constraint task_templates_weekdays_match check (
    (recurrence = 'weekly' and public.planner_valid_weekdays(weekdays)) or (recurrence <> 'weekly' and weekdays is null)
  ),
  constraint task_templates_dates_ordered check (ends_on is null or ends_on >= starts_on),
  -- IS NOT DISTINCT FROM so a missing ends_on is rejected (a plain = would be NULL, which passes a CHECK)
  constraint task_templates_once_single_day check (recurrence <> 'once' or ends_on is not distinct from starts_on)
);

comment on table public.task_templates is 'Reusable task definition (once, daily or selected weekdays). Owner-only.';

create index task_templates_user_active_idx on public.task_templates (user_id) where archived_at is null;

-- ---------------------------------------------------------------------------
-- day_plans: one row per user per LOCAL calendar date
-- ---------------------------------------------------------------------------

create table public.day_plans (
  user_id                 uuid not null references public.profiles (id) on delete cascade,
  plan_date               date not null,
  day_mode                text not null default 'normal',
  baseline_at             timestamptz,
  suppressed_template_ids uuid[] not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  primary key (user_id, plan_date),
  constraint day_plans_day_mode_valid check (day_mode in ('normal', 'busy', 'rest')),
  constraint day_plans_suppressed_size check (cardinality(suppressed_template_ids) <= 200)
);

comment on table public.day_plans is 'One row per user per local date. plan_date is a date, never converted. baseline_at marks when the original plan was fixed and is set only by triggers.';
comment on column public.day_plans.suppressed_template_ids is 'Templates hard-deleted for this day so day top-ups do not recreate them. Arrays cannot carry foreign keys; ownership is checked by trigger.';

-- ---------------------------------------------------------------------------
-- task_occurrences: a task on one date, with its own snapshot, completion and plan state
-- ---------------------------------------------------------------------------

create table public.task_occurrences (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  plan_date           date not null,
  template_id         uuid,
  title               text not null,
  description         text,
  category            text,
  is_priority         boolean not null default false,
  planned_start       time,
  planned_end         time,
  estimated_minutes   smallint,
  completion          numeric not null default 0, -- unconstrained on purpose: numeric(2,1) would round 0.45 to 0.5 before the check ran
  completed_at        timestamptz,
  plan_state          text not null default 'active',
  excluded_reason     text,
  excluded_at         timestamptz,
  rescheduled_from_id uuid,
  in_original_plan    boolean not null default true,
  is_customized       boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint task_occurrences_user_id_id_key unique (user_id, id),

  -- every occurrence belongs to a day plan of the same user; removing the day removes its occurrences
  constraint task_occurrences_day_fk foreign key (user_id, plan_date)
    references public.day_plans (user_id, plan_date) on delete cascade,
  -- the template must belong to the same user; deleting a template keeps the history (template_id only is cleared)
  constraint task_occurrences_template_fk foreign key (user_id, template_id)
    references public.task_templates (user_id, id) on delete set null (template_id),
  -- a moved task links back to its source, which must be the same user's occurrence
  constraint task_occurrences_rescheduled_from_fk foreign key (user_id, rescheduled_from_id)
    references public.task_occurrences (user_id, id) on delete set null (rescheduled_from_id),

  constraint task_occurrences_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint task_occurrences_description_length check (description is null or char_length(description) <= 1000),
  constraint task_occurrences_category_length check (category is null or char_length(btrim(category)) between 1 and 40),
  constraint task_occurrences_estimate_range check (estimated_minutes is null or estimated_minutes between 1 and 1440),
  constraint task_occurrences_time_order check (planned_end is null or (planned_start is not null and planned_end > planned_start)),
  -- D1: only these completion values exist
  constraint task_occurrences_completion_valid check (completion in (0, 0.5, 1)),
  constraint task_occurrences_completed_at_matches check ((completion > 0) = (completed_at is not null)),
  constraint task_occurrences_plan_state_valid check (plan_state in ('active', 'excluded')),
  constraint task_occurrences_excluded_reason_valid check (excluded_reason in ('rescheduled', 'busy_day', 'rest_day', 'removed')),
  constraint task_occurrences_excluded_fields_match check (
    (plan_state = 'excluded') = (excluded_reason is not null) and (plan_state = 'excluded') = (excluded_at is not null)
  ),
  -- C2: a partially completed task may be set aside or moved; a done task may not
  constraint task_occurrences_done_stays_active check (plan_state = 'active' or completion < 1),
  constraint task_occurrences_not_self_moved check (rescheduled_from_id is null or rescheduled_from_id <> id)
);

comment on table public.task_occurrences is 'A task on one local date. Self-contained snapshot: later template edits or deletion do not change it. Original vs revised plan are derived from in_original_plan and plan_state, not stored twice.';

-- no duplicate occurrence of one template on one date
create unique index task_occurrences_template_date_key on public.task_occurrences (template_id, plan_date) where template_id is not null;
create index task_occurrences_user_date_idx on public.task_occurrences (user_id, plan_date);
create index task_occurrences_rescheduled_from_idx on public.task_occurrences (user_id, rescheduled_from_id) where rescheduled_from_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers (server-maintained fields and integrity rules)
-- ---------------------------------------------------------------------------

create function public.planner_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger task_templates_touch before update on public.task_templates
  for each row execute function public.planner_touch_updated_at();
create trigger day_plans_touch before update on public.day_plans
  for each row execute function public.planner_touch_updated_at();
create trigger task_occurrences_touch before update on public.task_occurrences
  for each row execute function public.planner_touch_updated_at();

-- Cap active templates per user (provisional abuse limit).
create function public.task_templates_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is null
     and (tg_op = 'INSERT' or old.archived_at is not null)
     and (select count(*) from public.task_templates t where t.user_id = new.user_id and t.archived_at is null)
         >= public.planner_max_active_templates() then
    raise exception 'Too many active tasks (limit %).', public.planner_max_active_templates() using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger task_templates_guard before insert or update on public.task_templates
  for each row execute function public.task_templates_guard();

-- day_plans: the baseline is set only here; a day is limited to sane dates; suppression ids must be the user's own templates.
create function public.day_plans_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.plan_date > public.planner_today(new.user_id) + public.planner_max_days_ahead() then
      raise exception 'That day is too far ahead to plan.' using errcode = '22008';
    end if;
    new.baseline_at := null;
  else
    -- Once fixed, the baseline never changes. Filling it in from NULL is allowed because only
    -- server code can do it (clients have no UPDATE privilege on this column).
    if old.baseline_at is not null then
      new.baseline_at := old.baseline_at;
    end if;
    if new.day_mode <> 'normal' and new.baseline_at is null then
      new.baseline_at := public.planner_now(); -- choosing Busy or Rest is a revision: fix the original plan first
    end if;
  end if;

  if exists (
    select 1 from unnest(new.suppressed_template_ids) as s(id)
    where s.id is null or not exists (
      select 1 from public.task_templates t where t.id = s.id and t.user_id = new.user_id
    )
  ) then
    raise exception 'Suppressed templates must be your own tasks.' using errcode = '23503';
  end if;
  new.suppressed_template_ids := coalesce(
    (select array_agg(distinct s.id) from unnest(new.suppressed_template_ids) as s(id)), '{}'::uuid[]);
  return new;
end;
$$;
create trigger day_plans_guard before insert or update on public.day_plans
  for each row execute function public.day_plans_guard();

-- Keep suppression lists clean when a template is deleted. SECURITY DEFINER: this is a system
-- action that must also touch read-only (older) days.
create function public.task_templates_cleanup_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.day_plans
     set suppressed_template_ids = array_remove(suppressed_template_ids, old.id)
   where user_id = old.user_id and old.id = any (suppressed_template_ids);
  return old;
end;
$$;
create trigger task_templates_cleanup_suppression after delete on public.task_templates
  for each row execute function public.task_templates_cleanup_suppression();

-- Occurrence integrity and server-maintained fields.
create function public.task_occurrences_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_baseline timestamptz;
begin
  if tg_op = 'INSERT' then
    select d.baseline_at into v_baseline
      from public.day_plans d where d.user_id = new.user_id and d.plan_date = new.plan_date;
    -- D11: tasks created after the baseline belong only to the current plan
    new.in_original_plan := (v_baseline is null);
    if (select count(*) from public.task_occurrences o where o.user_id = new.user_id and o.plan_date = new.plan_date)
         >= public.planner_max_occurrences_per_day() then
      raise exception 'Too many tasks on one day (limit %).', public.planner_max_occurrences_per_day() using errcode = '54000';
    end if;
  else
    new.in_original_plan := old.in_original_plan; -- never changes
  end if;

  -- progress can only be recorded for today or earlier, in the user's own timezone
  if new.completion > 0 and new.plan_date > public.planner_today(new.user_id)
     and (tg_op = 'INSERT' or new.completion is distinct from old.completion) then
    raise exception 'Progress can only be recorded for today or earlier.' using errcode = '22008';
  end if;

  -- timestamps are set by the server, never trusted from the client
  if new.completion <= 0 then
    new.completed_at := null;
  elsif tg_op = 'UPDATE' and new.completion = old.completion then
    new.completed_at := old.completed_at;
  else
    new.completed_at := public.planner_now();
  end if;
  if new.plan_state is distinct from 'excluded' then
    new.excluded_at := null;
  elsif tg_op = 'UPDATE' and old.plan_state = 'excluded' then
    new.excluded_at := old.excluded_at;
  else
    new.excluded_at := public.planner_now();
  end if;
  return new;
end;
$$;
create trigger task_occurrences_guard before insert or update on public.task_occurrences
  for each row execute function public.task_occurrences_guard();

-- The first progress or the first set-aside fixes the day's baseline. SECURITY DEFINER because
-- clients have no privilege to write baseline_at; it only ever touches the row's own day.
create function public.task_occurrences_stamp_baseline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.completion > 0 and (tg_op = 'INSERT' or old.completion = 0))
     or (new.plan_state = 'excluded' and (tg_op = 'INSERT' or old.plan_state = 'active')) then
    update public.day_plans
       set baseline_at = coalesce(baseline_at, public.planner_now())
     where user_id = new.user_id and plan_date = new.plan_date and baseline_at is null;
  end if;
  return null;
end;
$$;
create trigger task_occurrences_stamp_baseline after insert or update on public.task_occurrences
  for each row execute function public.task_occurrences_stamp_baseline();

-- Trigger functions must never be callable as RPC endpoints.
revoke all on function public.planner_touch_updated_at() from public, anon, authenticated;
revoke all on function public.task_templates_guard() from public, anon, authenticated;
revoke all on function public.day_plans_guard() from public, anon, authenticated;
revoke all on function public.task_templates_cleanup_suppression() from public, anon, authenticated;
revoke all on function public.task_occurrences_guard() from public, anon, authenticated;
revoke all on function public.task_occurrences_stamp_baseline() from public, anon, authenticated;

-- Helpers used inside policies run as the calling role, so it needs EXECUTE on them.
revoke all on function public.planner_now() from public, anon;
revoke all on function public.planner_today(uuid) from public, anon;
revoke all on function public.planner_past_edit_window_dates() from public, anon;
revoke all on function public.planner_max_days_ahead() from public, anon;
grant execute on function public.planner_now() to authenticated;
grant execute on function public.planner_today(uuid) to authenticated;
grant execute on function public.planner_past_edit_window_dates() to authenticated;
grant execute on function public.planner_max_days_ahead() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security and privileges
-- ---------------------------------------------------------------------------

alter table public.task_templates enable row level security;
alter table public.day_plans enable row level security;
alter table public.task_occurrences enable row level security;

revoke all on table public.task_templates from public, anon, authenticated;
revoke all on table public.day_plans from public, anon, authenticated;
revoke all on table public.task_occurrences from public, anon, authenticated;

-- Column-level grants: clients cannot write user_id after insert, nor any server-maintained field.
grant select, delete on public.task_templates to authenticated;
grant insert (user_id, title, description, category, is_priority, planned_start, planned_end,
              estimated_minutes, recurrence, weekdays, starts_on, ends_on, archived_at)
  on public.task_templates to authenticated;
grant update (title, description, category, is_priority, planned_start, planned_end,
              estimated_minutes, recurrence, weekdays, starts_on, ends_on, archived_at)
  on public.task_templates to authenticated;

grant select on public.day_plans to authenticated;
grant insert (user_id, plan_date) on public.day_plans to authenticated;            -- a new day starts as Normal with no baseline
grant update (day_mode, suppressed_template_ids) on public.day_plans to authenticated;
-- no DELETE on day_plans: removal happens only by cascade (account deletion)

grant select, delete on public.task_occurrences to authenticated;
grant insert (user_id, plan_date, template_id, title, description, category, is_priority, planned_start,
              planned_end, estimated_minutes, rescheduled_from_id, is_customized)
  on public.task_occurrences to authenticated;                                      -- new rows start pending and active
grant update (title, description, category, is_priority, planned_start, planned_end, estimated_minutes,
              completion, plan_state, excluded_reason, is_customized)
  on public.task_occurrences to authenticated;                                      -- plan_date, template_id, user_id are fixed

-- task_templates: plain ownership
create policy "Users manage their own tasks: read" on public.task_templates
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users manage their own tasks: create" on public.task_templates
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users manage their own tasks: update" on public.task_templates
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users manage their own tasks: delete" on public.task_templates
  for delete to authenticated using (user_id = (select auth.uid()));

-- day_plans and occurrences: ownership AND the 7-date editing window (D5). Days older than
-- today minus 6 (in the user's timezone) are read-only history.
create policy "Users read their own days" on public.day_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create their own days within the window" on public.day_plans
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and plan_date >= public.planner_today((select auth.uid())) - (public.planner_past_edit_window_dates() - 1)
  );
create policy "Users edit their own recent days" on public.day_plans
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and plan_date >= public.planner_today((select auth.uid())) - (public.planner_past_edit_window_dates() - 1)
  )
  with check (user_id = (select auth.uid()));

create policy "Users read their own occurrences" on public.task_occurrences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users add occurrences to their own recent days" on public.task_occurrences
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and plan_date >= public.planner_today((select auth.uid())) - (public.planner_past_edit_window_dates() - 1)
  );
create policy "Users edit their own recent occurrences" on public.task_occurrences
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and plan_date >= public.planner_today((select auth.uid())) - (public.planner_past_edit_window_dates() - 1)
  )
  with check (user_id = (select auth.uid()));
-- Hard delete only for untouched tasks, and never for an original-plan task once the baseline
-- exists (those are soft-removed instead), so history and progress cannot be erased by a client.
create policy "Users delete their own untouched recent occurrences" on public.task_occurrences
  for delete to authenticated using (
    user_id = (select auth.uid())
    and plan_date >= public.planner_today((select auth.uid())) - (public.planner_past_edit_window_dates() - 1)
    and completion = 0
    and not (
      in_original_plan
      and exists (
        select 1 from public.day_plans d
        where d.user_id = task_occurrences.user_id and d.plan_date = task_occurrences.plan_date and d.baseline_at is not null
      )
    )
  );
