-- Arcloop: READ-ONLY schema verification for a Supabase project.
--
-- Run it in the Supabase SQL editor (or psql) AFTER applying the three migrations to a dedicated TEST
-- project. It only reads the catalog: it creates, changes and deletes nothing.
--
-- Every row is PASS, FAIL or REVIEW:
--   PASS    matches the migration definitions.
--   FAIL    does not match; investigate before trusting the project.
--   REVIEW  a fact to read and decide on (the four helper functions whose API exposure was never
--           verified on a hosted project). Not a failure by itself.
-- Expected result: no FAIL rows, and exactly four REVIEW rows.
--
-- The expectations below are copied from supabase/migrations/. tests/db/schemaChecks.test.js runs this
-- exact file against the migrations in PGlite, so the file itself is tested; what it cannot show is how a
-- hosted project's default privileges differ, which is what running it for real is for.

with
tables(t) as (values ('profiles'), ('task_templates'), ('day_plans'), ('task_occurrences'), ('reminder_preferences'), ('task_reminders')),
policy_counts(t, n) as (values ('profiles', 2), ('task_templates', 4), ('day_plans', 3), ('task_occurrences', 4), ('reminder_preferences', 4), ('task_reminders', 4)),
constraints_expected(name) as (values
  ('profiles_display_name_length'), ('profiles_timezone_length'), ('profiles_interests_size'), ('profiles_profile_visibility_valid'), ('profiles_progress_visibility_valid'),
  ('task_templates_user_id_id_key'), ('task_templates_title_length'), ('task_templates_description_length'), ('task_templates_category_length'), ('task_templates_estimate_range'),
  ('task_templates_time_order'), ('task_templates_recurrence_valid'), ('task_templates_weekdays_match'), ('task_templates_dates_ordered'), ('task_templates_once_single_day'),
  ('day_plans_day_mode_valid'), ('day_plans_suppressed_size'),
  ('task_occurrences_user_id_id_key'), ('task_occurrences_day_fk'), ('task_occurrences_template_fk'), ('task_occurrences_rescheduled_from_fk'), ('task_occurrences_title_length'),
  ('task_occurrences_description_length'), ('task_occurrences_category_length'), ('task_occurrences_estimate_range'), ('task_occurrences_time_order'), ('task_occurrences_completion_valid'),
  ('task_occurrences_completed_at_matches'), ('task_occurrences_plan_state_valid'), ('task_occurrences_excluded_reason_valid'), ('task_occurrences_excluded_fields_match'),
  ('task_occurrences_done_stays_active'), ('task_occurrences_not_self_moved'),
  ('reminder_preferences_weekdays_valid'), ('reminder_preferences_time_whole_minutes'), ('task_reminders_occurrence_key'), ('task_reminders_time_whole_minutes'), ('task_reminders_occurrence_fkey')),
indexes_expected(name) as (values
  ('task_templates_user_active_idx'), ('task_occurrences_template_date_key'), ('task_occurrences_user_date_idx'), ('task_occurrences_rescheduled_from_idx'), ('task_reminders_user_date_idx')),
triggers_expected(name) as (values
  ('profiles_before_write'), ('on_auth_user_created'),
  ('task_templates_touch'), ('day_plans_touch'), ('task_occurrences_touch'), ('task_templates_guard'), ('day_plans_guard'), ('task_templates_cleanup_suppression'),
  ('task_occurrences_guard'), ('task_occurrences_stamp_baseline'),
  ('reminder_preferences_before_write'), ('task_reminders_before_write')),
-- Columns clients must never write. user_id is set when a row is created (RLS forces it to the caller) but can never be
-- changed afterwards, so it is checked for UPDATE only; server-maintained columns must lack both INSERT and UPDATE.
forbidden_columns(t, c, modes) as (values
  ('profiles', 'id', 'insert,update'), ('profiles', 'created_at', 'insert,update'), ('profiles', 'updated_at', 'insert,update'),
  ('task_templates', 'user_id', 'update'), ('task_templates', 'created_at', 'insert,update'),
  ('day_plans', 'user_id', 'update'), ('day_plans', 'baseline_at', 'insert,update'),
  ('task_occurrences', 'user_id', 'update'), ('task_occurrences', 'completed_at', 'insert,update'), ('task_occurrences', 'excluded_at', 'insert,update'), ('task_occurrences', 'in_original_plan', 'insert,update'),
  ('task_reminders', 'user_id', 'update'), ('task_reminders', 'plan_date', 'insert,update'), ('reminder_preferences', 'user_id', 'update')),
-- Columns clients must be able to update (the app writes them).
allowed_columns(t, c) as (values
  ('profiles', 'timezone'), ('profiles', 'display_name'), ('profiles', 'profile_visibility'), ('profiles', 'progress_visibility'),
  ('task_templates', 'title'), ('day_plans', 'day_mode'), ('task_occurrences', 'completion'), ('task_occurrences', 'plan_state'),
  ('task_reminders', 'remind_time'), ('task_reminders', 'notified_at'), ('reminder_preferences', 'enabled'), ('reminder_preferences', 'last_notified_on')),
-- Trigger functions: nobody may call them through the API.
trigger_functions(f) as (values
  ('public.handle_new_user()'), ('public.profiles_before_write()'), ('public.planner_touch_updated_at()'), ('public.task_templates_guard()'), ('public.day_plans_guard()'),
  ('public.task_templates_cleanup_suppression()'), ('public.task_occurrences_guard()'), ('public.task_occurrences_stamp_baseline()'),
  ('public.reminder_preferences_before_write()'), ('public.task_reminders_before_write()')),
-- Helper functions the app calls: signed-in users yes, anonymous visitors no.
app_functions(f) as (values ('public.planner_now()'), ('public.planner_today(uuid)'), ('public.planner_past_edit_window_dates()'), ('public.planner_max_days_ahead()')),
-- The four helpers with no explicit privilege handling in the migrations.
review_functions(f) as (values
  ('public.planner_max_active_templates()'), ('public.planner_max_occurrences_per_day()'), ('public.planner_valid_weekdays(smallint[])'), ('public.reminder_weekdays_valid(smallint[])')),
checks as (
  select 1 as ord, 'server is PostgreSQL 15 or later' as check_name,
         case when current_setting('server_version_num')::int >= 150000 then 'PASS' else 'FAIL' end as status,
         current_setting('server_version') as detail
  union all
  select 2, 'table exists: ' || t, case when to_regclass('public.' || t) is not null then 'PASS' else 'FAIL' end, '' from tables
  union all
  select 3, 'row level security enabled: ' || t,
         case when coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t)), false) then 'PASS' else 'FAIL' end, ''
  from tables
  union all
  select 4, 'policy count: ' || p.t,
         case when (select count(*) from pg_policies x where x.schemaname = 'public' and x.tablename = p.t) = p.n then 'PASS' else 'FAIL' end,
         'expected ' || p.n || ', found ' || (select count(*) from pg_policies x where x.schemaname = 'public' and x.tablename = p.t)
  from policy_counts p
  union all
  select 5, 'every policy is for authenticated only (no anon/public)',
         case when not exists (select 1 from pg_policies x where x.schemaname = 'public' and x.tablename in (select t from tables) and x.roles::text[] <> array['authenticated']) then 'PASS' else 'FAIL' end,
         coalesce((select string_agg(x.tablename || '.' || x.policyname, ', ') from pg_policies x where x.schemaname = 'public' and x.tablename in (select t from tables) and x.roles::text[] <> array['authenticated']), '')
  union all
  select 6, 'anon has no privilege on table: ' || t,
         case when has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete,truncate,references,trigger') then 'FAIL' else 'PASS' end, ''
  from tables
  union all
  select 7, 'authenticated cannot truncate, reference or trigger: ' || t,
         case when has_table_privilege('authenticated', 'public.' || t, 'truncate,references,trigger') then 'FAIL' else 'PASS' end, ''
  from tables
  union all
  select 8, 'clients cannot write ' || t || '.' || c,
         case when has_column_privilege('authenticated', 'public.' || t, c, modes) or has_column_privilege('anon', 'public.' || t, c, modes) then 'FAIL' else 'PASS' end, modes
  from forbidden_columns
  union all
  select 9, 'clients can update ' || t || '.' || c,
         case when has_column_privilege('authenticated', 'public.' || t, c, 'update') then 'PASS' else 'FAIL' end, ''
  from allowed_columns
  union all
  select 10, 'constraint exists: ' || name,
         case when exists (select 1 from pg_constraint k where k.conname = e.name and k.connamespace = 'public'::regnamespace) then 'PASS' else 'FAIL' end, ''
  from constraints_expected e
  union all
  select 11, 'index exists: ' || name,
         case when exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = e.name) then 'PASS' else 'FAIL' end, ''
  from indexes_expected e
  union all
  select 12, 'trigger exists and is enabled: ' || name,
         case when exists (select 1 from pg_trigger g where g.tgname = e.name and not g.tgisinternal and g.tgenabled <> 'D') then 'PASS' else 'FAIL' end, ''
  from triggers_expected e
  union all
  select 13, 'trigger function not callable through the API: ' || f,
         case when has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then 'FAIL' else 'PASS' end, ''
  from trigger_functions
  union all
  select 14, 'app helper callable by signed-in users only: ' || f,
         case when has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute') then 'PASS' else 'FAIL' end, ''
  from app_functions
  union all
  select 15, 'exactly three SECURITY DEFINER functions in public, each with a fixed search_path',
         case when (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef) = 3
               and not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and not coalesce(p.proconfig::text like '%search_path%', false)) then 'PASS' else 'FAIL' end,
         (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef) || ' found'
  union all
  select 16, 'planner_now() is the plain production clock (no test override)',
         case when (select prosrc from pg_proc where oid = 'public.planner_now()'::regprocedure) ~* 'select now\(\)' and (select prosrc from pg_proc where oid = 'public.planner_now()'::regprocedure) !~ 'planner\.now' then 'PASS' else 'FAIL' end, ''
  union all
  select 17, 'REVIEW helper: ' || f,
         'REVIEW',
         'anon can execute: ' || has_function_privilege('anon', f, 'execute') || '; authenticated can execute: ' || has_function_privilege('authenticated', f, 'execute')
         || '. Pure constant/validator. Revoking from anon is reasonable; do NOT revoke from authenticated without testing inserts (a CHECK constraint may need it).'
  from review_functions
)
select check_name, status, detail from checks order by ord, check_name;
