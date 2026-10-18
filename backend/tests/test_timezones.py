"""Server-side date and timezone behaviour at the edges: local midnight, the editing window, DST days, odd offsets.

These are targeted cases chosen because they are where "today" is most likely to be wrong. They do not prove timezone
handling is correct everywhere: see docs/KNOWN_ISSUES.md for what is and is not covered.
"""
import datetime as dt
from unittest import mock

from planner import rules

from .base import ApiCase

UTC = dt.timezone.utc


def at(*args):
    return dt.datetime(*args, tzinfo=UTC)


class TodayTests(ApiCase):
    """rules.today_for: the user's local calendar date at an instant."""

    def today(self, tz, instant):
        users = self.__dict__.setdefault('_tz_users', {})
        if tz not in users:
            users[tz] = self.make_user(f"tz-{tz.replace('/', '-').lower()}@example.com", tz)
        user = users[tz]
        with mock.patch('planner.rules.now', lambda: instant):
            return rules.today_for(user).isoformat()

    def test_the_date_flips_exactly_at_local_midnight_not_at_utc_midnight(self):
        # New York is UTC-4 (EDT) on 10 March 2026: local midnight is 04:00Z.
        self.assertEqual(self.today('America/New_York', at(2026, 3, 10, 3, 59, 59)), '2026-03-09')
        self.assertEqual(self.today('America/New_York', at(2026, 3, 10, 4, 0, 0)), '2026-03-10')
        # At UTC midnight it is still the previous evening in New York and already the next morning in Auckland.
        instant = at(2026, 3, 10, 0, 0, 0)
        self.assertEqual(self.today('America/New_York', instant), '2026-03-09')
        self.assertEqual(self.today('UTC', instant), '2026-03-10')
        self.assertEqual(self.today('Pacific/Auckland', instant), '2026-03-10')  # NZDT, UTC+13: 13:00 on the 10th

    def test_the_spring_forward_and_fall_back_days_have_one_date_each_and_no_date_is_skipped(self):
        # New York 2026: clocks go forward at 02:00 on 8 March (07:00Z) and back at 02:00 on 1 November (06:00Z).
        seen = [self.today('America/New_York', at(2026, 3, 8, 5, 0, 0) + dt.timedelta(hours=h)) for h in range(0, 60)]  # from local midnight on the 8th (05:00Z)
        self.assertEqual(sorted(set(seen)), ['2026-03-08', '2026-03-09', '2026-03-10'])
        run = [seen[0]]
        for value in seen[1:]:
            if value != run[-1]:
                run.append(value)
        self.assertEqual(run, ['2026-03-08', '2026-03-09', '2026-03-10'])  # in order, none repeated or skipped
        self.assertEqual(self.today('America/New_York', at(2026, 3, 8, 6, 59, 59)), '2026-03-08')  # 01:59:59 EST
        self.assertEqual(self.today('America/New_York', at(2026, 3, 8, 7, 0, 0)), '2026-03-08')  # 03:00:00 EDT: same date
        fall = [self.today('America/New_York', at(2026, 11, 1, 4, 0, 0) + dt.timedelta(hours=h)) for h in range(0, 60)]  # from local midnight on 1 November (04:00Z, still EDT)
        collapsed = [d for i, d in enumerate(fall) if i == 0 or d != fall[i - 1]]
        self.assertEqual(collapsed, ['2026-11-01', '2026-11-02', '2026-11-03'])
        self.assertEqual(self.today('America/New_York', at(2026, 11, 1, 5, 59, 59)), '2026-11-01')  # 01:59:59 EDT
        self.assertEqual(self.today('America/New_York', at(2026, 11, 1, 6, 0, 0)), '2026-11-01')  # 01:00:00 EST: the repeated hour

    def test_odd_offsets(self):
        cases = [
            ('Asia/Kolkata', at(2026, 3, 10, 18, 29, 59), '2026-03-10'),  # UTC+5:30: midnight is 18:30Z
            ('Asia/Kolkata', at(2026, 3, 10, 18, 30, 0), '2026-03-11'),
            ('Asia/Kathmandu', at(2026, 3, 10, 18, 14, 59), '2026-03-10'),  # UTC+5:45
            ('Asia/Kathmandu', at(2026, 3, 10, 18, 15, 0), '2026-03-11'),
            ('Pacific/Chatham', at(2026, 3, 9, 10, 14, 59), '2026-03-09'),  # UTC+13:45 (DST): midnight on the 10th is 10:15Z the day before
            ('Pacific/Chatham', at(2026, 3, 9, 10, 15, 0), '2026-03-10'),
            ('Pacific/Kiritimati', at(2026, 3, 10, 9, 59, 59), '2026-03-10'),  # UTC+14: the earliest date on Earth
            ('Pacific/Kiritimati', at(2026, 3, 10, 10, 0, 0), '2026-03-11'),
            ('Pacific/Pago_Pago', at(2026, 3, 10, 10, 59, 59), '2026-03-09'),  # UTC-11: the latest
            ('Pacific/Pago_Pago', at(2026, 3, 10, 11, 0, 0), '2026-03-10'),
            ('Australia/Lord_Howe', at(2026, 3, 9, 12, 59, 59), '2026-03-09'),  # UTC+11 in summer (UTC+10:30 in winter): midnight is 13:00Z
            ('Australia/Lord_Howe', at(2026, 3, 9, 13, 0, 0), '2026-03-10'),
            ('Australia/Lord_Howe', at(2026, 7, 9, 13, 29, 59), '2026-07-09'),  # winter: UTC+10:30, midnight is 13:30Z
            ('Australia/Lord_Howe', at(2026, 7, 9, 13, 30, 0), '2026-07-10'),
        ]
        for tz, instant, expected in cases:
            self.assertEqual(self.today(tz, instant), expected, f'{tz} at {instant.isoformat()}')

    def test_the_same_instant_is_a_different_date_either_side_of_the_date_line(self):
        instant = at(2026, 3, 10, 11, 30, 0)
        self.assertEqual(self.today('Pacific/Kiritimati', instant), '2026-03-11')
        self.assertEqual(self.today('Pacific/Pago_Pago', instant), '2026-03-10')

    def test_an_unknown_or_missing_timezone_falls_back_to_utc_instead_of_failing(self):
        user = self.make_user('weird@example.com', 'UTC')
        user.profile.timezone = 'Mars/Olympus_Mons'  # cannot be set through the API, but must never break a request
        user.profile.save()
        with mock.patch('planner.rules.now', lambda: at(2026, 3, 10, 23, 0, 0)):
            self.assertEqual(rules.today_for(user).isoformat(), '2026-03-10')


class EditWindowBoundaryTests(ApiCase):
    """The 7-date window (today and the previous 6 dates) moves at the user's local midnight."""

    def set_now(self, instant):
        patcher = mock.patch('planner.rules.now', lambda: instant)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_oldest_editable_date_becomes_read_only_at_local_midnight(self):
        # New York is UTC-4 (EDT). At 03:59:59Z on 11 March it is 23:59:59 on the 10th, so the window is 4 to 10 March.
        self.set_now(at(2026, 3, 11, 3, 59, 59))
        self.assertEqual(self.post('day-plans', {'plan_date': '2026-03-04'}).status_code, 201)
        self.assertError(self.post('day-plans', {'plan_date': '2026-03-03'}), 403, 'permission_denied')
        # One second later it is 11 March locally: the window is now 5 to 11 March and the 4th is history.
        self.set_now(at(2026, 3, 11, 4, 0, 0))
        self.assertEqual(self.post('day-plans', {'plan_date': '2026-03-05'}).status_code, 201)
        self.assertError(self.post('day-plans', {'plan_date': '2026-03-04'}), 403, 'permission_denied')  # exists, but can no longer be created or changed
        self.assertEqual(len(self.list('day-plans', plan_date='2026-03-04').json()['results']), 1)  # still readable
        occ = self.make_occurrence('2026-03-05')
        self.assertEqual(self.patch('task-occurrences', {'title': 'edited'}, id=occ['id']).json()['results'][0]['title'], 'edited')
        self.set_now(at(2026, 3, 12, 4, 0, 0))  # the next local midnight: the 5th falls out of the window
        self.assertEqual(self.patch('task-occurrences', {'title': 'too late'}, id=occ['id']).json()['results'], [])

    def test_the_window_follows_the_users_timezone_for_the_same_instant(self):
        instant = at(2026, 3, 10, 0, 30, 0)  # 20:30 on the 9th in New York; 13:30 on the 10th in Auckland
        self.set_now(instant)
        self.assertEqual(self.post('day-plans', {'plan_date': '2026-03-03'}).status_code, 201)  # New York today is the 9th: window starts the 3rd
        self.as_user(self.make_user('auckland@example.com', 'Pacific/Auckland'))
        self.assertError(self.post('day-plans', {'plan_date': '2026-03-03'}), 403, 'permission_denied')  # Auckland today is the 10th: starts the 4th
        self.assertEqual(self.post('day-plans', {'plan_date': '2026-03-04'}).status_code, 201)

    def test_progress_is_allowed_for_the_local_today_even_when_utc_is_already_tomorrow(self):
        self.set_now(at(2026, 3, 11, 2, 0, 0))  # 22:00 on 10 March in New York; already 11 March in UTC
        self.make_day('2026-03-10')
        today_task = self.make_occurrence('2026-03-10')
        self.make_day('2026-03-11')
        tomorrow_task = self.make_occurrence('2026-03-11')
        self.assertEqual(self.patch('task-occurrences', {'completion': 1}, id=today_task['id']).status_code, 200)
        self.assertError(self.patch('task-occurrences', {'completion': 1}, id=tomorrow_task['id']), 400, 'date_rule')  # UTC says today; the user's calendar says tomorrow

    def test_progress_for_the_new_local_day_is_refused_until_local_midnight(self):
        self.set_now(at(2026, 3, 10, 3, 59, 59))
        self.make_day('2026-03-10')
        task = self.make_occurrence('2026-03-10')
        self.assertError(self.patch('task-occurrences', {'completion': 1}, id=task['id']), 400, 'date_rule')  # still the 9th in New York
        self.set_now(at(2026, 3, 10, 4, 0, 0))
        self.assertEqual(self.patch('task-occurrences', {'completion': 1}, id=task['id']).status_code, 200)

    def test_changing_the_profile_timezone_moves_today_without_rewriting_history(self):
        self.set_now(at(2026, 3, 10, 3, 0, 0))  # 23:00 on the 9th in New York
        self.make_day('2026-03-09')
        task = self.make_occurrence('2026-03-09')
        self.patch('task-occurrences', {'completion': 1}, id=task['id'])
        self.client.patch('/api/v1/profile/', {'timezone': 'Pacific/Auckland'}, format='json')  # now 16:00 on the 10th
        self.assertEqual(self.post('day-plans', {'plan_date': '2026-03-10'}).status_code, 201)
        kept = self.list('task-occurrences', id=task['id']).json()['results'][0]
        self.assertEqual((kept['plan_date'], kept['completion']), ('2026-03-09', 1.0))  # nothing recorded was moved or changed

    def test_the_far_future_bound_is_measured_in_local_dates(self):
        self.set_now(at(2026, 3, 10, 12, 0, 0))
        self.assertEqual(self.post('day-plans', {'plan_date': '2027-03-11'}).status_code, 201)  # today + 366
        self.assertError(self.post('day-plans', {'plan_date': '2027-03-12'}), 400, 'date_rule')
