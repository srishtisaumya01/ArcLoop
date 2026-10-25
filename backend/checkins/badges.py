"""Streak badges: earned when the daily streak first reaches 15, 30, 50, 75 and 100 days. Awarded from the streak history, so a
person who reached a length before badges existed still gets the badge, dated the day they reached it."""
from datetime import timedelta

from .models import UserBadge

BADGES = [
    {'code': 'streak-15', 'days': 15, 'title': '15 Days'},
    {'code': 'streak-30', 'days': 30, 'title': '30 Days'},
    {'code': 'streak-50', 'days': 50, 'title': '50 Days'},
    {'code': 'streak-75', 'days': 75, 'title': 'Habit Master'},  # the habit has stuck
    {'code': 'streak-100', 'days': 100, 'title': '100 Days'},
]


def reached_on(done_dates):
    """{days: first date a run of that many consecutive days was completed} for each badge length."""
    reached, run, previous = {}, 0, None
    for d in sorted(done_dates):
        run = run + 1 if previous is not None and d - previous == timedelta(days=1) else 1
        previous = d
        for badge in BADGES:
            if run == badge['days'] and badge['days'] not in reached:
                reached[badge['days']] = d
    return reached


def award_and_list(user, done_dates):
    """Gives the badges the history has earned (once each) and returns every badge with its date, or None if still locked."""
    have = {b.code: b.earned_on for b in UserBadge.objects.filter(user=user)}
    for days, date in reached_on(done_dates).items():
        code = f'streak-{days}'
        if code not in have:
            UserBadge.objects.get_or_create(user=user, code=code, defaults={'earned_on': date})
            have[code] = date
    return [{**b, 'earned_on': have[b['code']].isoformat() if b['code'] in have else None} for b in BADGES]
