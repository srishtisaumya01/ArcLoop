from datetime import datetime, timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from challenges.services import local_now, today_for
from config.errors import validation_error

from challenges.models import ChallengeAttendance

from .models import DayCheckin
from .streaks import streaks

MIN_SHIFT = timedelta(hours=6)  # the least time between checking in and checking out


def clock(moment):
    return moment.strftime('%H:%M')


def opens_at(user, today):
    """When check-in opens today: the start of the person's shift, in their own timezone."""
    now = local_now(user)
    return datetime.combine(today, user.profile.shift_start, tzinfo=now.tzinfo)


def body(user):
    today = today_for(user)
    rows = {r.date: r for r in DayCheckin.objects.filter(user=user, date__gte=today - timedelta(days=400))}
    # A day counts when the person finished their check-in and check-out, or marked attendance in ANY challenge that day
    # (one challenge is enough: the others never break the streak).
    marked = set(ChallengeAttendance.objects.filter(enrollment__user=user, date__gte=today - timedelta(days=400)).values_list('date', flat=True))
    done = {d for d, r in rows.items() if r.checked_out_at} | marked
    current, best = streaks(done, today)
    row = rows.get(today)
    profile = user.profile
    earliest_out = row.checked_in_at + MIN_SHIFT if row and not row.checked_out_at else None
    return {
        'today': today.isoformat(),
        'shift_start': profile.shift_start.strftime('%H:%M'),
        'shift_end': profile.shift_end.strftime('%H:%M'),
        'check_in_opens_at': opens_at(user, today).isoformat(),
        'earliest_check_out_at': earliest_out.isoformat() if earliest_out else None,
        'checked_in_at': row.checked_in_at.isoformat() if row else None,
        'checked_out_at': row.checked_out_at.isoformat() if row and row.checked_out_at else None,
        'challenge_marked_today': today in marked,
        'current_streak': current,
        'best_streak': max(best, current),
        'last_days': [{'date': (today - timedelta(days=i)).isoformat(), 'done': (today - timedelta(days=i)) in done} for i in range(6, -1, -1)],
    }


class CheckinView(APIView):
    def get(self, request):
        return Response(body(request.user))


class CheckInView(APIView):
    """Starts today's shift. It opens at the person's shift start time; repeating it changes nothing."""

    def post(self, request):
        user = request.user
        today = today_for(user)
        opens = opens_at(user, today)
        if local_now(user) < opens and not DayCheckin.objects.filter(user=user, date=today).exists():
            raise validation_error(f'Check-in opens at {clock(opens)}. Come back then to mark your attendance.', None, 'check_in_not_open')
        DayCheckin.objects.get_or_create(user=user, date=today, defaults={'checked_in_at': timezone.now()})
        return Response(body(user), status=status.HTTP_200_OK)


class CheckOutView(APIView):
    """Ends today's shift. Needs a check-in at least six hours earlier; repeating it keeps the first time."""

    def post(self, request):
        user = request.user
        row = DayCheckin.objects.filter(user=user, date=today_for(user)).first()
        if row is None:
            raise validation_error('Check in first, then check out when your shift is over.', None, 'check_in_first')
        if row.checked_out_at is None:
            earliest = row.checked_in_at + MIN_SHIFT
            if timezone.now() < earliest:
                when = clock(earliest.astimezone(local_now(user).tzinfo))
                raise validation_error(f'Please complete your shift first. You can check out after {when} (6 hours after you checked in).', None, 'complete_your_shift')
            row.checked_out_at = timezone.now()
            row.save(update_fields=['checked_out_at'])
        return Response(body(user), status=status.HTTP_200_OK)
