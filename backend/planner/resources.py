"""The three planner collections: task templates, day plans and task occurrences.

Each ``create`` / ``update`` below ports the matching Postgres triggers and RLS policies:
server-maintained fields (baseline, original-plan flag, timestamps) are never taken from the client,
days older than the 7-date editing window are read-only, and history is not hard-deleted.
"""
import datetime as dt

from config.errors import date_rule, limit_reached, not_found, permission_denied, validation_error
from config.resources import Resource

from . import rules
from .models import DayPlan, TaskOccurrence, TaskTemplate

TASK_FIELDS = ('title', 'description', 'category', 'is_priority', 'planned_start', 'planned_end', 'estimated_minutes')


def _apply(obj, values):
    for column, value in values.items():
        setattr(obj, column, value)


class TemplateResource(Resource):
    name = 'task-templates'
    model = TaskTemplate
    fields = {
        'id': 'uuid', 'user_id': 'int', 'title': 'text', 'description': 'text', 'category': 'text', 'is_priority': 'bool',
        'planned_start': 'time', 'planned_end': 'time', 'estimated_minutes': 'int', 'recurrence': 'text', 'weekdays': 'intlist',
        'starts_on': 'date', 'ends_on': 'date', 'archived_at': 'datetime', 'created_at': 'datetime',
    }
    editable = ('title', 'description', 'category', 'is_priority', 'planned_start', 'planned_end', 'estimated_minutes',
                'recurrence', 'weekdays', 'starts_on', 'ends_on', 'archived_at')
    insert_fields = ('user_id', *editable)
    update_fields = editable
    nullable = ('description', 'category', 'planned_start', 'planned_end', 'estimated_minutes', 'weekdays', 'ends_on', 'archived_at')

    def create(self, user, values):
        for required in ('title', 'recurrence', 'starts_on'):
            if values.get(required) is None:
                raise validation_error('Please check the highlighted details.', {required: 'This is required.'})
        template = TaskTemplate(user=user, **values)
        rules.validate_template(template)
        rules.guard_template_cap(TaskTemplate, user, template)
        template.save()
        return template

    def update(self, user, template, values):
        was_archived = template.archived_at is not None
        _apply(template, values)
        for required in ('title', 'recurrence', 'starts_on'):
            if getattr(template, required) is None:
                raise validation_error('Please check the highlighted details.', {required: 'This is required.'})
        rules.validate_template(template)
        if was_archived:
            rules.guard_template_cap(TaskTemplate, user, template)  # only counts when it becomes active again
        template.save()
        return template

    def before_delete(self, user, template):
        # Keep suppression lists clean: a deleted template id must not linger on any day.
        tid = str(template.pk)
        for day in DayPlan.objects.filter(user=user).exclude(suppressed_template_ids=[]):
            if tid in day.suppressed_template_ids:
                day.suppressed_template_ids = [i for i in day.suppressed_template_ids if i != tid]
                day.save(update_fields=['suppressed_template_ids', 'updated_at'])


class DayResource(Resource):
    name = 'day-plans'
    model = DayPlan
    fields = {'user_id': 'int', 'plan_date': 'date', 'day_mode': 'text', 'baseline_at': 'datetime', 'suppressed_template_ids': 'uuidlist', 'created_at': 'datetime'}
    insert_fields = ('user_id', 'plan_date')  # a new day starts as Normal with no baseline
    update_fields = ('day_mode', 'suppressed_template_ids')
    order_default = ('plan_date',)

    def mutable(self, user, qs):
        return qs.filter(plan_date__gte=rules.window_start(user))

    # Days are never hard-deleted by a client: removal happens only by cascade.
    def deletable(self, user, qs):
        return qs.none()

    def create(self, user, values):
        plan_date = values.get('plan_date')
        if plan_date is None:
            raise validation_error('Please check the highlighted details.', {'plan_date': 'This is required.'})
        if not rules.in_edit_window(user, plan_date):
            raise permission_denied()
        if plan_date > rules.today_for(user) + dt.timedelta(days=rules.MAX_DAYS_AHEAD):
            raise date_rule('That day is too far ahead to plan.')
        return DayPlan.objects.create(user=user, plan_date=plan_date)

    def update(self, user, day, values):
        if 'day_mode' in values:
            if values['day_mode'] not in rules.DAY_MODES:
                raise validation_error('Please check the highlighted details.', {'day_mode': 'Unknown day type.'}, code='constraint_violation')
            day.day_mode = values['day_mode']
        if 'suppressed_template_ids' in values:
            ids = values['suppressed_template_ids']
            if ids is None:
                raise validation_error('Please check the highlighted details.', {'suppressed_template_ids': 'This is required.'})
            unique = list(dict.fromkeys(ids))
            owned = {str(i) for i in TaskTemplate.objects.filter(user=user, pk__in=unique).values_list('pk', flat=True)}
            if len(owned) != len(unique):
                raise not_found('Suppressed templates must be your own tasks.')
            if len(unique) > rules.MAX_SUPPRESSED:
                raise limit_reached('Too many hidden tasks for one day.')
            day.suppressed_template_ids = sorted(unique)
        if day.day_mode != 'normal' and day.baseline_at is None:
            day.baseline_at = rules.now()  # choosing Busy or Rest is a revision: fix the original plan first
        day.save()
        return day


class OccurrenceResource(Resource):
    name = 'task-occurrences'
    model = TaskOccurrence
    fields = {
        'id': 'uuid', 'user_id': 'int', 'template_id': 'uuid', 'plan_date': 'date', 'title': 'text', 'description': 'text', 'category': 'text',
        'is_priority': 'bool', 'planned_start': 'time', 'planned_end': 'time', 'estimated_minutes': 'int', 'completion': 'number',
        'completed_at': 'datetime', 'plan_state': 'text', 'excluded_reason': 'text', 'excluded_at': 'datetime',
        'rescheduled_from_id': 'uuid', 'in_original_plan': 'bool', 'is_customized': 'bool', 'is_minimum': 'bool', 'created_at': 'datetime',
    }
    insert_fields = ('user_id', 'plan_date', 'template_id', *TASK_FIELDS, 'rescheduled_from_id', 'is_customized')
    update_fields = (*TASK_FIELDS, 'completion', 'plan_state', 'excluded_reason', 'is_customized', 'is_minimum')  # plan_date, template, user are fixed; is_minimum is never set on insert
    nullable = ('template_id', 'description', 'category', 'planned_start', 'planned_end', 'estimated_minutes', 'rescheduled_from_id', 'excluded_reason')
    order_default = ('plan_date', 'created_at')

    def mutable(self, user, qs):
        return qs.filter(plan_date__gte=rules.window_start(user))

    def deletable(self, user, qs):
        # Only untouched tasks, and never an original-plan task once the day's baseline exists:
        # those are soft-removed instead, so history and progress cannot be erased by a client.
        baselined = DayPlan.objects.filter(user=user, baseline_at__isnull=False).values_list('plan_date', flat=True)
        return self.mutable(user, qs).filter(completion=0).exclude(in_original_plan=True, plan_date__in=list(baselined))

    def create(self, user, values):
        for required in ('plan_date', 'title'):
            if values.get(required) is None:
                raise validation_error('Please check the highlighted details.', {required: 'This is required.'})
        plan_date = values['plan_date']
        if not rules.in_edit_window(user, plan_date):
            raise permission_denied()
        day = DayPlan.objects.filter(user=user, plan_date=plan_date).first()
        if day is None:
            raise not_found('Something this refers to could not be found.')
        template_id = values.pop('template_id', None)
        source_id = values.pop('rescheduled_from_id', None)
        if template_id is not None and not TaskTemplate.objects.filter(user=user, pk=template_id).exists():
            raise not_found('Something this refers to could not be found.')
        if source_id is not None and not TaskOccurrence.objects.filter(user=user, pk=source_id).exists():
            raise not_found('Something this refers to could not be found.')
        occurrence = TaskOccurrence(user=user, template_id=template_id, rescheduled_from_id=source_id, **values)
        rules.validate_occurrence(occurrence)
        occurrence.in_original_plan = day.baseline_at is None  # D11: tasks created after the baseline belong only to the current plan
        if TaskOccurrence.objects.filter(user=user, plan_date=plan_date).count() >= rules.MAX_OCCURRENCES_PER_DAY:
            raise limit_reached(f'Too many tasks on one day (limit {rules.MAX_OCCURRENCES_PER_DAY}).')
        occurrence.save()
        return occurrence

    def update(self, user, occurrence, values):
        old_completion, old_state = occurrence.completion, occurrence.plan_state
        had_completed_at, had_excluded_at = occurrence.completed_at, occurrence.excluded_at
        _apply(occurrence, values)
        if occurrence.plan_state == 'excluded' and old_state == 'active':
            occurrence.is_minimum = False  # setting a task aside (or moving it) takes it out of the minimum; it never carries over
        if occurrence.title is None:
            raise validation_error('Please check the highlighted details.', {'title': 'This is required.'})
        rules.validate_occurrence(occurrence)
        if occurrence.is_minimum:
            # One request at a time may change a day's minimum, so two cannot both take the last place (PostgreSQL).
            list(DayPlan.objects.select_for_update().filter(user=user, plan_date=occurrence.plan_date).values_list('pk', flat=True))
        rules.guard_minimum(TaskOccurrence, user, occurrence)
        completion_changed = occurrence.completion != old_completion
        # progress can only be recorded for today or earlier, in the user's own timezone
        if completion_changed and occurrence.completion > 0 and occurrence.plan_date > rules.today_for(user):
            raise date_rule('Progress can only be recorded for today or earlier.')
        # timestamps are set by the server, never trusted from the client
        if occurrence.completion <= 0:
            occurrence.completed_at = None
        elif not completion_changed:
            occurrence.completed_at = had_completed_at
        else:
            occurrence.completed_at = rules.now()
        if occurrence.plan_state != 'excluded':
            occurrence.excluded_at = None
        elif old_state == 'excluded':
            occurrence.excluded_at = had_excluded_at
        else:
            occurrence.excluded_at = rules.now()
        occurrence.save()
        # The first progress or the first set-aside fixes the day's baseline.
        if (occurrence.completion > 0 and old_completion == 0) or (occurrence.plan_state == 'excluded' and old_state == 'active'):
            DayPlan.objects.filter(user=user, plan_date=occurrence.plan_date, baseline_at__isnull=True).update(baseline_at=rules.now())
        return occurrence
