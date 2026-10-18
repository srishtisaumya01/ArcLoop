import datetime as dt
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.models import AuthToken

User = get_user_model()
# Tuesday 10 March 2026, 15:00 UTC: 11:00 in New York, Wednesday 04:00 in Auckland.
NOW = dt.datetime(2026, 3, 10, 15, 0, tzinfo=dt.timezone.utc)
TODAY = '2026-03-10'


class ApiCase(APITestCase):
    """Fixed clock, helpers to sign users in, and short request helpers that return parsed JSON."""

    def setUp(self):
        cache.clear()  # rate-limit counters live in the cache: one test's sign-ins must not throttle another's
        patcher = mock.patch('planner.rules.now', lambda: NOW)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.alice = self.make_user('alice@example.com', 'America/New_York')
        self.bob = self.make_user('bob@example.com', 'America/New_York')
        self.as_user(self.alice)

    def make_user(self, email, tz='UTC'):
        user = User.objects.create_user(username=email, email=email, password='correct-horse-battery')
        user.profile.timezone = tz
        user.profile.save()
        return user

    def as_user(self, user):
        raw, _ = AuthToken.issue(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw}')
        return raw

    def anonymous(self):
        self.client.credentials()

    # request helpers: return the Response
    def list(self, name, **params):
        return self.client.get(f'/api/v1/{name}/', params)

    def post(self, name, body):
        return self.client.post(f'/api/v1/{name}/', body, format='json')

    def patch(self, name, body, **params):
        return self.client.patch(f'/api/v1/{name}/?' + '&'.join(f'{k}={v}' for k, v in params.items()), body, format='json')

    def delete(self, name, **params):
        return self.client.delete(f'/api/v1/{name}/?' + '&'.join(f'{k}={v}' for k, v in params.items()))

    # builders
    def make_template(self, **extra):
        body = {'title': 'Walk', 'recurrence': 'daily', 'starts_on': '2026-03-01', **extra}
        response = self.post('task-templates', body)
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()['results'][0]

    def make_day(self, plan_date=TODAY):
        response = self.post('day-plans', {'plan_date': plan_date})
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()['results'][0]

    def make_occurrence(self, plan_date=TODAY, **extra):
        if not self.list('day-plans', plan_date=plan_date).json()['results']:
            self.make_day(plan_date)
        response = self.post('task-occurrences', {'plan_date': plan_date, 'title': 'Task', **extra})
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()['results'][0]

    def assertError(self, response, status, code):
        self.assertEqual(response.status_code, status, response.content)
        self.assertEqual(set(response.json()), {'error'})
        self.assertEqual(response.json()['error']['code'], code)
        self.assertTrue(response.json()['error']['message'])
