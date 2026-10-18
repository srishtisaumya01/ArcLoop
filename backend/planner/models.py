"""Planner tables, ported from the archived Postgres design (docs/archive/supabase/20261017100000_create_planner.sql).

The Postgres version enforced much of its integrity in triggers and Row Level Security. Here the same
rules live in ``planner/rules.py`` and the resource layer (``planner/resources.py``); the database keeps
the constraints SQLite can express. Column names and value shapes are unchanged so the client mappers
and the pure planner logic do not need to know which backend they talk to.
"""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class TaskTemplate(models.Model):
    """Reusable definition ("what I intend to do"): once, daily or selected weekdays."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='task_templates')
    title = models.CharField(max_length=120)
    description = models.CharField(max_length=1000, null=True, blank=True)
    category = models.CharField(max_length=40, null=True, blank=True)
    is_priority = models.BooleanField(default=False)
    planned_start = models.TimeField(null=True, blank=True)
    planned_end = models.TimeField(null=True, blank=True)
    estimated_minutes = models.SmallIntegerField(null=True, blank=True)
    recurrence = models.CharField(max_length=10)
    weekdays = models.JSONField(null=True, blank=True)  # ISO weekdays 1..7, only for 'weekly'
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(recurrence__in=['once', 'daily', 'weekly']), name='task_templates_recurrence_valid'),
            models.CheckConstraint(condition=Q(estimated_minutes__isnull=True) | Q(estimated_minutes__range=(1, 1440)), name='task_templates_estimate_range'),
            models.CheckConstraint(
                condition=Q(planned_end__isnull=True) | (Q(planned_start__isnull=False) & Q(planned_end__gt=models.F('planned_start'))),
                name='task_templates_time_order',
            ),
            models.CheckConstraint(condition=Q(ends_on__isnull=True) | Q(ends_on__gte=models.F('starts_on')), name='task_templates_dates_ordered'),
            models.CheckConstraint(
                condition=~Q(recurrence='once') | Q(ends_on=models.F('starts_on')),
                name='task_templates_once_single_day',
            ),
        ]
        indexes = [models.Index(fields=['user', 'starts_on'], name='task_templates_user_start_idx')]


class DayPlan(models.Model):
    """One row per user per LOCAL calendar date. ``plan_date`` is a date and is never converted."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='day_plans')
    plan_date = models.DateField()
    day_mode = models.CharField(max_length=10, default='normal')
    baseline_at = models.DateTimeField(null=True, blank=True)  # when the original plan was fixed; set only by the server
    suppressed_template_ids = models.JSONField(default=list)  # templates hard-deleted for this day, so top-ups do not recreate them
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'plan_date'], name='day_plans_user_date_key'),
            models.CheckConstraint(condition=Q(day_mode__in=['normal', 'busy', 'rest']), name='day_plans_day_mode_valid'),
        ]


class TaskOccurrence(models.Model):
    """A task on one date, with its own snapshot, completion and plan state (history survives template edits)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='task_occurrences')
    plan_date = models.DateField()
    # Deleting a template keeps the history: only the link is cleared.
    template = models.ForeignKey(TaskTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name='occurrences')
    title = models.CharField(max_length=120)
    description = models.CharField(max_length=1000, null=True, blank=True)
    category = models.CharField(max_length=40, null=True, blank=True)
    is_priority = models.BooleanField(default=False)
    planned_start = models.TimeField(null=True, blank=True)
    planned_end = models.TimeField(null=True, blank=True)
    estimated_minutes = models.SmallIntegerField(null=True, blank=True)
    # Only 0, 0.5 and 1 exist (decision D1). One decimal place stores exactly those.
    completion = models.DecimalField(max_digits=2, decimal_places=1, default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    plan_state = models.CharField(max_length=10, default='active')
    excluded_reason = models.CharField(max_length=20, null=True, blank=True)
    excluded_at = models.DateTimeField(null=True, blank=True)
    rescheduled_from = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='moved_to')
    in_original_plan = models.BooleanField(default=True)
    is_customized = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            # no duplicate occurrence of one template on one date
            models.UniqueConstraint(fields=['template', 'plan_date'], condition=Q(template__isnull=False), name='task_occurrences_template_date_key'),
            models.CheckConstraint(condition=Q(estimated_minutes__isnull=True) | Q(estimated_minutes__range=(1, 1440)), name='task_occurrences_estimate_range'),
            models.CheckConstraint(
                condition=Q(planned_end__isnull=True) | (Q(planned_start__isnull=False) & Q(planned_end__gt=models.F('planned_start'))),
                name='task_occurrences_time_order',
            ),
            models.CheckConstraint(condition=Q(completion__in=[0, 0.5, 1]), name='task_occurrences_completion_valid'),
            models.CheckConstraint(condition=Q(plan_state__in=['active', 'excluded']), name='task_occurrences_plan_state_valid'),
            models.CheckConstraint(
                condition=Q(excluded_reason__isnull=True) | Q(excluded_reason__in=['rescheduled', 'busy_day', 'rest_day', 'removed']),
                name='task_occurrences_excluded_reason_valid',
            ),
            models.CheckConstraint(
                condition=(Q(plan_state='excluded') & Q(excluded_reason__isnull=False) & Q(excluded_at__isnull=False))
                | (Q(plan_state='active') & Q(excluded_reason__isnull=True) & Q(excluded_at__isnull=True)),
                name='task_occurrences_excluded_fields_match',
            ),
            # C2: a partially completed task may be set aside or moved; a done task may not
            models.CheckConstraint(condition=Q(plan_state='active') | Q(completion__lt=1), name='task_occurrences_done_stays_active'),
        ]
        indexes = [models.Index(fields=['user', 'plan_date'], name='task_occ_user_date_idx')]
