"""Reminder tables, mirroring supabase/migrations/20261018000000_create_reminders.sql.

Only preferences and per-task reminder times are stored. Delivery happens in the open app; there is no
server-side scheduler or push service (see docs/KNOWN_ISSUES.md).
"""
import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from planner.models import TaskOccurrence


class ReminderPreference(models.Model):
    """One row per user. Reminders are off until switched on."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE, related_name='reminder_preference')
    enabled = models.BooleanField(default=False)
    remind_time = models.TimeField(default=dt.time(9, 0))
    weekdays = models.JSONField(default=list)  # ISO weekdays, 1 = Monday ... 7 = Sunday
    # Local date of the last daily reminder that was delivered (1970-01-01 means "never").
    last_notified_on = models.DateField(default=dt.date(1970, 1, 1))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class TaskReminder(models.Model):
    """An optional reminder time for one task occurrence."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='task_reminders')
    occurrence = models.OneToOneField(TaskOccurrence, on_delete=models.CASCADE, related_name='reminder')
    # Copied from the occurrence on create (never writable) so upcoming reminders can be listed by date.
    plan_date = models.DateField()
    remind_time = models.TimeField()
    notified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'plan_date'], name='task_reminders_user_date_idx')]
