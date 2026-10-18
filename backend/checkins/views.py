from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from challenges.services import today_for
from config.errors import validation_error

from .models import DayCheckin
from .streaks import streaks


def body(user):
    today = today_for(user)
    rows = {r.date: r for r in DayCheckin.objects.filter(user=user, date__gte=today - timedelta(days=400))}
    done = {d for d, r in rows.items() if r.checked_out_at}
    current, best = streaks(done, today)
    row = rows.get(today)
    return {
        'today': today.isoformat(),
        'checked_in_at': row.checked_in_at.isoformat() if row else None,
        'checked_out_at': row.checked_out_at.isoformat() if row and row.checked_out_at else None,
        'current_streak': current,
        'best_streak': max(best, current),
        'last_days': [{'date': (today - timedelta(days=i)).isoformat(), 'done': (today - timedelta(days=i)) in done} for i in range(6, -1, -1)],
    }


class CheckinView(APIView):
    def get(self, request):
        return Response(body(request.user))


class CheckInView(APIView):
    """Starts today. Repeating it changes nothing."""

    def post(self, request):
        DayCheckin.objects.get_or_create(user=request.user, date=today_for(request.user), defaults={'checked_in_at': timezone.now()})
        return Response(body(request.user), status=status.HTTP_200_OK)


class CheckOutView(APIView):
    """Ends today. Needs a check-in first; repeating it keeps the first time."""

    def post(self, request):
        row = DayCheckin.objects.filter(user=request.user, date=today_for(request.user)).first()
        if row is None:
            raise validation_error('Check in first, then check out when you are done for the day.', None, 'check_in_first')
        if row.checked_out_at is None:
            row.checked_out_at = timezone.now()
            row.save(update_fields=['checked_out_at'])
        return Response(body(request.user), status=status.HTTP_200_OK)
