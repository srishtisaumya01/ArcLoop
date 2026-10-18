import datetime as dt
import os
from importlib import reload
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase

from config.middleware import TestClockMiddleware
from planner import rules

PINNED = dt.datetime(2031, 6, 15, 12, 0, tzinfo=dt.timezone.utc)


class TestClockMiddlewareTests(SimpleTestCase):
    """The header only matters when the middleware is installed, which settings allow only in debug mode."""

    def run_request(self, **headers):
        seen = {}

        def view(request):
            seen['now'] = rules.now()
            return HttpResponse('ok')

        response = TestClockMiddleware(view)(RequestFactory().get('/', **headers))
        return response, seen

    def test_a_request_with_the_header_sees_the_pinned_instant_and_it_is_reset_afterwards(self):
        response, seen = self.run_request(HTTP_X_TEST_NOW='2031-06-15T12:00:00Z')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(seen['now'], PINNED)
        self.assertIsNone(rules.test_now.get())

    def test_without_the_header_the_real_clock_is_used(self):
        _, seen = self.run_request()
        self.assertLess(abs((seen['now'] - dt.datetime.now(dt.timezone.utc)).total_seconds()), 5)

    def test_an_unreadable_header_is_refused(self):
        response, seen = self.run_request(HTTP_X_TEST_NOW='tomorrow-ish')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(seen, {})

    def test_a_naive_instant_is_taken_as_utc(self):
        _, seen = self.run_request(HTTP_X_TEST_NOW='2031-06-15T12:00:00')
        self.assertEqual(seen['now'], PINNED)


class TestClockSettingsTests(SimpleTestCase):
    def test_it_cannot_be_enabled_outside_debug(self):
        import config.settings as settings_module

        try:
            with mock.patch.dict(os.environ, {'ARCLOOP_TEST_CLOCK': '1', 'DJANGO_DEBUG': 'false', 'DJANGO_SECRET_KEY': 'x' * 50}):
                with self.assertRaises(ImproperlyConfigured):
                    reload(settings_module)
        finally:
            with mock.patch.dict(os.environ, {'ARCLOOP_TEST_CLOCK': '', 'DJANGO_DEBUG': 'true'}):
                reload(settings_module)  # leave the module as the rest of the run expects it
