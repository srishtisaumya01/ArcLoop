from datetime import timedelta

from challenges.models import ChallengeAttendance

from .models import DayCheckin
from .streaks import streaks


def done_dates(user, today, days=400):
    """Days that count for the streak: a full check-in and check-out, or attendance marked in any challenge."""
    since = today - timedelta(days=days)
    checked = set(DayCheckin.objects.filter(user=user, date__gte=since, checked_out_at__isnull=False).values_list('date', flat=True))
    marked = set(ChallengeAttendance.objects.filter(enrollment__user=user, date__gte=since).values_list('date', flat=True))
    return checked | marked, marked


def current_streak(user, today):
    done, _ = done_dates(user, today)
    return streaks(done, today)[0]
