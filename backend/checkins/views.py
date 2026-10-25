import hmac
from datetime import datetime, timedelta

from django.conf import settings
from django.db.models import Count
from django.http import HttpResponse
from rest_framework.permissions import AllowAny

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from challenges.services import local_now, today_for
from accounts.models import Profile
from challenges.models import ChallengeAttendance, Enrollment
from config.errors import ApiError, validation_error

from .models import DayCheckin
from .badges import award_and_list
from .reminders import send_reminders, user_from_unsubscribe_token
from .services import done_dates
from .streaks import runs, streaks

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
    done, marked = done_dates(user, today)
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


class CronStreakRemindersView(APIView):
    """Called by the scheduler (every 30 minutes) to send the reminder emails that are due. Needs the shared secret."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        secret = settings.CRON_SECRET
        given = request.headers.get('X-Cron-Secret', '')
        if not secret or not hmac.compare_digest(secret.encode(), given.encode()):
            raise ApiError('not_found', 'Not found.', status.HTTP_404_NOT_FOUND)  # looks like no such address to anyone guessing
        return Response(send_reminders())


def unsubscribe(request):
    """The link at the bottom of each reminder email: switches the reminders off for that person. No login needed."""
    user = user_from_unsubscribe_token(request.GET.get('t', ''))
    if user is not None:
        Profile.objects.filter(pk=user.pk).update(email_reminders=False)
    message = 'You will not get streak reminder emails any more.' if user else 'This link is not valid any more.'
    page = f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arcloop</title>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#EEF3FA;display:grid;place-items:center;min-height:100vh">
<div style="max-width:420px;margin:16px;padding:32px;background:#fff;border-radius:20px;text-align:center;box-shadow:0 8px 28px rgba(10,31,102,.12)">
<h1 style="margin:0 0 8px;font-size:22px;color:#0B1B3A">{message}</h1>
<p style="color:#44546F;line-height:1.5">You can turn them back on any time from your profile settings.</p>
<a href="{settings.FRONTEND_URL}" style="display:inline-block;margin-top:12px;background:#0A1F66;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:700">Back to Arcloop</a></div></body>"""
    return HttpResponse(page)


class RewardsView(APIView):
    """Badges earned, the streak figures with their dates, and the activity the grid and the graph are drawn from."""

    def get(self, request):
        user = request.user
        today = today_for(user)
        joined = Enrollment.objects.filter(user=user).order_by('joined_at').values_list('joined_at', flat=True).first()
        if joined is None:  # not in any challenge yet: nothing to show
            return Response({'today': today.isoformat(), 'has_enrollment': False, 'badges': award_and_list(user, set()), 'current_streak': 0, 'best_streak': 0, 'total_active_days': 0, 'activity': []})
        first_enrolled = joined.astimezone(local_now(user).tzinfo).date()
        since = first_enrolled - timedelta(days=7)
        done, marked = done_dates(user, today, days=900)
        counts = {}
        for row in ChallengeAttendance.objects.filter(enrollment__user=user, date__gte=since).values('date').annotate(n=Count('id')):
            counts[row['date']] = row['n']
        for d in done:  # a day done by check-in alone still counts as one
            if d >= since:
                counts.setdefault(d, 1)
        current, best = streaks(done, today)
        all_runs = runs(done)
        last_day = today if today in done else today - timedelta(days=1)
        current_run = next((r for r in all_runs if r[1] == last_day), None) if current else None
        best_run = max(all_runs, key=lambda r: (r[2], r[1]), default=None)
        iso = lambda d: d.isoformat() if d else None  # noqa: E731
        return Response({
            'today': today.isoformat(),
            'has_enrollment': True,
            'first_enrolled': first_enrolled.isoformat(),
            'badges': award_and_list(user, done),
            'current_streak': current,
            'current_streak_range': {'start': iso(current_run[0]), 'end': iso(current_run[1])} if current_run else None,
            'best_streak': max(best, current),
            'best_streak_range': {'start': iso(best_run[0]), 'end': iso(best_run[1])} if best_run else None,
            'total_active_days': len(done),
            'first_active': iso(min(done)) if done else None,
            'activity': [{'date': d.isoformat(), 'count': n} for d, n in sorted(counts.items()) if d >= since],
        })


class CronStreakRemindersView(APIView):
    """Called by the scheduler (every 30 minutes) to send the reminder emails that are due. Needs the shared secret."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        secret = settings.CRON_SECRET
        given = request.headers.get('X-Cron-Secret', '')
        if not secret or not hmac.compare_digest(secret.encode(), given.encode()):
            raise ApiError('not_found', 'Not found.', status.HTTP_404_NOT_FOUND)  # looks like no such address to anyone guessing
        return Response(send_reminders())


def unsubscribe(request):
    """The link at the bottom of each reminder email: switches the reminders off for that person. No login needed."""
    user = user_from_unsubscribe_token(request.GET.get('t', ''))
    if user is not None:
        Profile.objects.filter(pk=user.pk).update(email_reminders=False)
    message = 'You will not get streak reminder emails any more.' if user else 'This link is not valid any more.'
    page = f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arcloop</title>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#EEF3FA;display:grid;place-items:center;min-height:100vh">
<div style="max-width:420px;margin:16px;padding:32px;background:#fff;border-radius:20px;text-align:center;box-shadow:0 8px 28px rgba(10,31,102,.12)">
<h1 style="margin:0 0 8px;font-size:22px;color:#0B1B3A">{message}</h1>
<p style="color:#44546F;line-height:1.5">You can turn them back on any time from your profile settings.</p>
<a href="{settings.FRONTEND_URL}" style="display:inline-block;margin-top:12px;background:#0A1F66;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:700">Back to Arcloop</a></div></body>"""
    return HttpResponse(page)


class RewardsView(APIView):
    """Badges earned, and a year of activity for the contribution grid."""

    def get(self, request):
        user = request.user
        today = today_for(user)
        since = today - timedelta(days=370)
        done, marked = done_dates(user, today)
        counts = {}
        for row in ChallengeAttendance.objects.filter(enrollment__user=user, date__gte=since).values('date').annotate(n=Count('id')):
            counts[row['date']] = row['n']
        for d in done:  # a day done by check-in alone still counts as one
            if d >= since:
                counts.setdefault(d, 1)
        current, best = streaks(done, today)
        return Response({
            'today': today.isoformat(),
            'badges': award_and_list(user, done),
            'current_streak': current,
            'best_streak': max(best, current),
            'total_active_days': len(done),
            'activity': [{'date': d.isoformat(), 'count': n} for d, n in sorted(counts.items())],
        })
