"""Planner rules that Postgres enforced in triggers and Row Level Security.

Kept in one place and free of HTTP concerns. ``now()`` is the only place the clock is read, so tests can
substitute a fixed one (``planner.rules.now`` is looked up at call time).
"""
import contextvars
import datetime as dt
from zoneinfo import ZoneInfo

from django.utils import timezone

from accounts.models import valid_timezones
from config.errors import constraint_violation, limit_reached

EDIT_WINDOW_DATES = 7  # D5: today plus the previous 6 dates
MAX_DAYS_AHEAD = 366  # sanity bound; the app enforces its own shorter limit
MAX_ACTIVE_TEMPLATES = 200  # PROVISIONAL abuse cap, not a product decision
MAX_OCCURRENCES_PER_DAY = 100  # PROVISIONAL abuse cap
MAX_SUPPRESSED = 200
MAX_MINIMUM_TASKS = 3  # PROVISIONAL product limit (Minimum Day); the client mirrors it (PLANNER_CONFIG.limits.minimumTasks)
RECURRENCES = ('once', 'daily', 'weekly')
DAY_MODES = ('normal', 'busy', 'rest')
PLAN_STATES = ('active', 'excluded')
EXCLUDED_REASONS = ('rescheduled', 'busy_day', 'rest_day', 'removed')


# Set per request by config.middleware.TestClockMiddleware, which exists only when the server is started for
# automated tests (DEBUG plus ARCLOOP_TEST_CLOCK=1). Otherwise it is always None and ``now()`` is the real time.
test_now = contextvars.ContextVar('planner_test_now', default=None)


def now():
    return test_now.get() or timezone.now()


def today_for(user):
    """The user's local calendar date, from their profile timezone (UTC if unset or unknown)."""
    name = getattr(getattr(user, 'profile', None), 'timezone', None) or 'UTC'
    if name not in valid_timezones():
        name = 'UTC'
    return now().astimezone(ZoneInfo(name)).date()


def window_start(user):
    return today_for(user) - dt.timedelta(days=EDIT_WINDOW_DATES - 1)


def in_edit_window(user, plan_date):
    return plan_date >= window_start(user)


def _length(value, low, high):
    return value is not None and low <= len(value.strip()) <= high


def validate_weekdays(days):
    return (
        isinstance(days, list)
        and 1 <= len(days) <= 7
        and all(isinstance(d, int) and not isinstance(d, bool) and 1 <= d <= 7 for d in days)
        and len(set(days)) == len(days)
    )


PRIORITY_LEVELS = ('high', 'medium', 'low')


def sync_priority(obj, values):
    """The two spellings of priority never disagree. `priority_level` (high, medium, low) is the one to use; `is_priority` stays for older
    clients and means "high". `values` is what the client sent: if it sent the level, the level wins; if it sent only the old flag, that is
    turned into a level (turning it off leaves a low level alone and lowers high to medium)."""
    if 'priority_level' in values:
        obj.is_priority = obj.priority_level == 'high'
    elif 'is_priority' in values:
        if obj.is_priority:
            obj.priority_level = 'high'
        elif obj.priority_level == 'high':
            obj.priority_level = 'medium'


def validate_task_fields(obj):
    """Shared by templates and occurrences (the CHECK constraints of both tables)."""
    if obj.priority_level not in PRIORITY_LEVELS:
        raise constraint_violation(fields={'priority_level': 'Choose High, Medium or Low.'})
    if not _length(obj.title, 1, 120):
        raise constraint_violation(fields={'title': 'Use 1 to 120 characters.'})
    if obj.description is not None and len(obj.description) > 1000:
        raise constraint_violation(fields={'description': 'Keep it to 1000 characters.'})
    if obj.category is not None and not _length(obj.category, 1, 40):
        raise constraint_violation(fields={'category': 'Use 1 to 40 characters.'})
    if obj.estimated_minutes is not None and not 1 <= obj.estimated_minutes <= 1440:
        raise constraint_violation(fields={'estimated_minutes': 'Use 1 to 1440 minutes.'})
    if obj.planned_end is not None and (obj.planned_start is None or obj.planned_end <= obj.planned_start):
        raise constraint_violation(fields={'planned_end': 'The end must be after the start.'})  # no overnight spans


def validate_template(t):
    validate_task_fields(t)
    if t.recurrence not in RECURRENCES:
        raise constraint_violation(fields={'recurrence': 'Choose once, daily or weekly.'})
    if t.recurrence == 'weekly':
        if not validate_weekdays(t.weekdays):
            raise constraint_violation(fields={'weekdays': 'Choose at least one day.'})
    elif t.weekdays is not None:
        raise constraint_violation(fields={'weekdays': 'Only weekly tasks have weekdays.'})
    if t.ends_on is not None and t.ends_on < t.starts_on:
        raise constraint_violation(fields={'ends_on': 'The end date cannot be before the start date.'})
    if t.recurrence == 'once' and t.ends_on != t.starts_on:
        raise constraint_violation(fields={'ends_on': 'A one-off task ends on its start date.'})


def guard_template_cap(template_model, user, instance):
    """At most N active templates; checked when one is created active or un-archived."""
    if instance.archived_at is None and template_model.objects.filter(user=user, archived_at__isnull=True).exclude(pk=instance.pk).count() >= MAX_ACTIVE_TEMPLATES:
        raise limit_reached(f'Too many active tasks (limit {MAX_ACTIVE_TEMPLATES}).')


def validate_occurrence(o):
    validate_task_fields(o)
    if o.completion not in (0, 0.5, 1):
        raise constraint_violation(fields={'completion': 'Use 0, 0.5 or 1.'})
    if o.plan_state not in PLAN_STATES:
        raise constraint_violation(fields={'plan_state': 'Unknown state.'})
    excluded = o.plan_state == 'excluded'
    if o.excluded_reason is not None and o.excluded_reason not in EXCLUDED_REASONS:
        raise constraint_violation(fields={'excluded_reason': 'Unknown reason.'})
    if excluded != (o.excluded_reason is not None):
        raise constraint_violation(fields={'excluded_reason': 'A set-aside task needs a reason, and only those have one.'})
    if excluded and o.completion >= 1:
        raise constraint_violation(fields={'plan_state': 'A done task cannot be set aside.'})  # C2


def guard_minimum(occurrence_model, user, occurrence):
    """Minimum Day: a flagged task must still be planned, and a day holds at most MAX_MINIMUM_TASKS of them."""
    if not occurrence.is_minimum:
        return
    if occurrence.plan_state != 'active':
        raise constraint_violation(fields={'is_minimum': 'Only a task that is still planned can be part of your minimum.'})
    others = occurrence_model.objects.filter(user=user, plan_date=occurrence.plan_date, is_minimum=True).exclude(pk=occurrence.pk)
    if others.count() >= MAX_MINIMUM_TASKS:
        raise limit_reached(f'Choose up to {MAX_MINIMUM_TASKS} tasks for your minimum.')
