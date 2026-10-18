import threading
import unittest
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection, connections
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import AuthToken
from planner.models import DayPlan, TaskOccurrence
from planner.resources import OccurrenceResource
from reminders.resources import PreferenceResource

from .base import NOW, TODAY

User = get_user_model()
ONLY_WHERE_WRITERS_OVERLAP = 'These races exist only where writers can run at the same time (PostgreSQL). Run with DATABASE_URL set to a disposable PostgreSQL database; SQLite serialises writers.'


@unittest.skipUnless(connection.vendor == 'postgresql', ONLY_WHERE_WRITERS_OVERLAP)
class ConcurrentWriteTests(TransactionTestCase):
    """Two requests at the same moment. Each hook below holds both requests just after they have read their rows, which is the
    window in which an unlocked compare-and-set lets both through; with row locks the second request waits for the first."""

    def setUp(self):
        cache.clear()
        patcher = mock.patch('planner.rules.now', lambda: NOW)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = User.objects.create_user(username='race@example.com', email='race@example.com', password='correct-horse-battery')
        self.user.profile.timezone = 'America/New_York'
        self.user.profile.save()
        self.token, _ = AuthToken.issue(self.user)

    def hold_both_requests(self, resource_class):
        """Make each update() wait (briefly) for the other request, so both have read their rows before either writes."""
        barrier = threading.Barrier(2, timeout=3)
        original = resource_class.update

        def update(resource, user, obj, values):
            try:
                barrier.wait()
            except threading.BrokenBarrierError:
                pass  # the other request is waiting on a lock, which is exactly what is meant to happen
            return original(resource, user, obj, values)

        patcher = mock.patch.object(resource_class, 'update', update)
        patcher.start()
        self.addCleanup(patcher.stop)

    def request_together(self, calls):
        results = [None] * len(calls)

        def run(index, method, path, body):
            try:
                client = APIClient()
                client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
                results[index] = getattr(client, method)(path, body, format='json')
            finally:
                connections.close_all()  # each thread has its own database connection

        threads = [threading.Thread(target=run, args=(i, *call)) for i, call in enumerate(calls)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(30)
        return results

    def test_a_daily_reminder_can_only_be_claimed_once_when_two_tabs_ask_at_the_same_moment(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        client.post('/api/v1/reminder-preferences/', {'enabled': True}, format='json')
        self.hold_both_requests(PreferenceResource)
        claim = ('patch', f'/api/v1/reminder-preferences/?last_notified_on__lt={TODAY}', {'last_notified_on': TODAY})
        first, second = self.request_together([claim, claim])
        winners = [len(r.json()['results']) for r in (first, second)]
        self.assertEqual(sorted(winners), [0, 1], winners)  # exactly one tab gets to show the notice

    def test_two_simultaneous_requests_cannot_both_take_the_last_minimum_place(self):
        day = DayPlan.objects.create(user=self.user, plan_date=TODAY)
        tasks = [TaskOccurrence.objects.create(user=self.user, plan_date=day.plan_date, title=f'T{i}') for i in range(4)]
        TaskOccurrence.objects.filter(pk__in=[tasks[0].pk, tasks[1].pk]).update(is_minimum=True)  # two of three places are taken
        self.hold_both_requests(OccurrenceResource)
        claims = [('patch', f'/api/v1/task-occurrences/?id={t.pk}', {'is_minimum': True}) for t in tasks[2:]]
        responses = self.request_together(claims)
        self.assertEqual(sorted(r.status_code for r in responses), [200, 400], [r.content for r in responses])
        self.assertEqual(TaskOccurrence.objects.filter(user=self.user, is_minimum=True).count(), 3)  # never four
