import os
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from rest_framework.throttling import ScopedRateThrottle

from .base import ApiCase

STRONG = 'plum-ladder-orbit-42'


class ApiHeaderTests(ApiCase):
    def test_every_api_response_is_uncacheable_unframeable_and_leaks_no_referer(self):
        for response in (self.list('task-templates'), self.client.get('/api/v1/health/'), self.client.get('/api/v1/nope/')):
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(response.headers['Referrer-Policy'], 'no-referrer')
            self.assertEqual(response.headers['Content-Security-Policy'], "default-src 'none'; frame-ancestors 'none'")
            self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
            self.assertEqual(response.headers['X-Frame-Options'], 'DENY')

    def test_an_error_response_has_them_too(self):
        self.anonymous()
        response = self.client.get('/api/v1/profile/')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')


class HealthTests(ApiCase):
    def test_it_is_public_minimal_and_answers_ok(self):
        self.anonymous()
        response = self.client.get('/api/v1/health/')
        self.assertEqual((response.status_code, response.json()), (200, {'status': 'ok'}))

    def test_a_database_failure_is_503_without_details(self):
        self.anonymous()
        with mock.patch('config.views.connection') as connection:
            connection.cursor.side_effect = RuntimeError('disk exploded at /var/secret/path')
            with self.assertLogs('arcloop.health', level='ERROR'):
                response = self.client.get('/api/v1/health/')
        self.assertEqual((response.status_code, response.json()), (503, {'status': 'error'}))
        self.assertNotIn('secret', response.content.decode())


class CspReportTests(ApiCase):
    def setUp(self):
        super().setUp()
        self.anonymous()
        cache.clear()
        self.addCleanup(cache.clear)

    def report(self, body, content_type='application/csp-report'):
        return self.client.post('/api/v1/csp-report/', body, content_type=content_type)

    def test_a_report_is_accepted_without_credentials_and_logged_in_short_sanitised_form(self):
        body = '{"csp-report": {"document-uri": "https://app.example/update-password?uid=MQ&token=SECRET", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?k=SECRET", "script-sample": "alert(1)"}}'
        with self.assertLogs('arcloop.security', level='WARNING') as logs:
            response = self.report(body)
        self.assertEqual(response.status_code, 204)
        line = logs.output[0]
        self.assertIn('event=csp_violation', line)
        self.assertIn('directive=script-src-elem', line)
        self.assertIn('page=https://app.example/update-password', line)
        for secret in ('SECRET', 'token', 'alert(1)', 'uid='):
            self.assertNotIn(secret, line)  # query strings (reset tokens) and code samples are never logged

    def test_the_reporting_api_format_is_understood_too(self):
        body = '[{"type": "csp-violation", "body": {"effectiveDirective": "img-src", "blockedURL": "https://x.example/a.png", "documentURL": "https://app.example/"}}]'
        with self.assertLogs('arcloop.security', level='WARNING') as logs:
            self.assertEqual(self.report(body, 'application/reports+json').status_code, 204)
        self.assertIn('directive=img-src', logs.output[0])

    def test_junk_and_oversized_bodies_are_harmless(self):
        self.assertEqual(self.report('[]', 'application/json').status_code, 204)
        self.assertEqual(self.report('"just a string"', 'application/json').status_code, 204)
        self.assertEqual(self.report('not json at all').status_code, 400)
        big = '{"csp-report": {"blocked-uri": "' + 'x' * 20000 + '"}}'
        self.assertEqual(self.report(big).status_code, 413)

    def test_it_is_rate_limited(self):
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {'csp': '3/min'}):
            codes = [self.report('{"csp-report": {}}').status_code for _ in range(5)]
        self.assertEqual(codes, [204, 204, 204, 429, 429])


class SecurityLogTests(ApiCase):
    """The log helps an operator see abuse; it must not become a second place secrets leak."""

    def setUp(self):
        super().setUp()
        self.anonymous()
        cache.clear()
        self.addCleanup(cache.clear)

    def test_failed_logins_are_logged_without_the_email_or_password(self):
        with self.assertLogs('arcloop.security', level='WARNING') as logs:
            self.client.post('/api/v1/auth/login/', {'email': 'victim@example.com', 'password': 'guess-guess-guess'}, format='json')
        text = '\n'.join(logs.output)
        self.assertIn('event=login_failed', text)
        self.assertNotIn('victim', text)
        self.assertNotIn('guess-guess', text)

    def test_rate_limiting_is_logged(self):
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {'auth': '2/min'}):
            with self.assertLogs('arcloop.security', level='WARNING') as logs:
                for _ in range(4):
                    self.client.post('/api/v1/auth/login/', {'email': 'x@example.com', 'password': 'nope-nope-nope'}, format='json')
        self.assertTrue(any('event=rate_limited' in line for line in logs.output))

    def test_reset_registration_change_and_deletion_are_logged_without_secrets(self):
        with self.assertLogs('arcloop.security', level='INFO') as logs:
            self.client.post('/api/v1/auth/password/reset/', {'email': 'alice@example.com'}, format='json')
            self.client.post('/api/v1/auth/password/reset/', {'email': 'ghost@example.com'}, format='json')
            registered = self.client.post('/api/v1/auth/register/', {'email': 'new@example.com', 'password': STRONG}, format='json')
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {registered.json()['token']}")
            self.client.post('/api/v1/auth/password/change/', {'current_password': STRONG, 'password': 'river-lantern-sky-77'}, format='json')
            self.client.post('/api/v1/auth/account/delete/', {'password': 'river-lantern-sky-77', 'confirmation': 'DELETE'}, format='json')
        text = '\n'.join(logs.output)
        for event in ('password_reset_requested', 'registered', 'password_changed', 'account_deleted'):
            self.assertIn(f'event={event}', text)
        self.assertEqual(text.count('event=password_reset_requested'), 2)  # the same line for a known and an unknown address
        for secret in ('alice@', 'ghost@', 'new@', STRONG, 'river-lantern', registered.json()['token']):
            self.assertNotIn(secret, text)


class PasswordResetTimeoutTests(ApiCase):
    def test_a_reset_link_expires(self):
        self.anonymous()
        self.client.post('/api/v1/auth/password/reset/', {'email': 'alice@example.com'}, format='json')
        link = [line for line in mail.outbox[0].body.splitlines() if '/update-password?' in line][0]
        query = dict(part.split('=') for part in link.split('?')[1].split('&'))
        with override_settings(PASSWORD_RESET_TIMEOUT=-1):  # "already older than the allowed age"
            expired = self.client.post('/api/v1/auth/password/reset/confirm/', {**query, 'password': STRONG}, format='json')
        self.assertError(expired, 400, 'invalid_reset_link')
        fresh = self.client.post('/api/v1/auth/password/reset/confirm/', {**query, 'password': STRONG}, format='json')
        self.assertEqual(fresh.status_code, 204)  # the same link still works while it is within the allowed age

    def test_the_default_lifetime_is_one_hour_not_three_days(self):
        from django.conf import settings

        self.assertEqual(settings.PASSWORD_RESET_TIMEOUT, 3600)


PRODUCTION_ENV = {'DJANGO_DEBUG': 'false', 'DJANGO_SECRET_KEY': 'k' * 50, 'DJANGO_ALLOWED_HOSTS': 'api.example.test', 'FRONTEND_URL': 'https://app.example.test', 'ARCLOOP_TEST_CLOCK': ''}


def load_settings(**overrides):
    """Executes config/settings.py in a brand-new module under a production-style environment (nothing carries over)."""
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / 'config' / 'settings.py'
    spec = importlib.util.spec_from_file_location('settings_under_test', path)
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(os.environ, {**PRODUCTION_ENV, **overrides}):
        spec.loader.exec_module(module)
    return module


class ProductionSettingsTests(SimpleTestCase):
    """Settings fail at start-up, loudly, instead of running with an unsafe default."""

    def load(self, **overrides):
        return load_settings(**overrides)

    def test_a_complete_production_configuration_loads(self):
        loaded = self.load()
        self.assertFalse(loaded.DEBUG)
        self.assertEqual(loaded.ALLOWED_HOSTS, ['api.example.test'])
        self.assertTrue(loaded.SESSION_COOKIE_SECURE and loaded.CSRF_COOKIE_SECURE and loaded.SECURE_SSL_REDIRECT)
        self.assertEqual(loaded.SECURE_HSTS_SECONDS, 0)  # off until HTTPS is confirmed: never implied by production mode
        self.assertEqual(loaded.CORS_ALLOWED_ORIGINS, [])
        self.assertFalse(loaded.CORS_ALLOW_CREDENTIALS)

    def test_missing_secret_hosts_or_https_frontend_address_stop_start_up(self):
        for overrides in ({'DJANGO_SECRET_KEY': ''}, {'DJANGO_ALLOWED_HOSTS': ''}, {'FRONTEND_URL': ''}, {'FRONTEND_URL': 'http://app.example.test'}):
            with self.assertRaises(ImproperlyConfigured, msg=str(overrides)):
                self.load(**overrides)

    def test_hsts_and_the_proxy_header_are_opt_in(self):
        loaded = self.load(DJANGO_HSTS_SECONDS='600', DJANGO_BEHIND_PROXY='true')
        self.assertEqual(loaded.SECURE_HSTS_SECONDS, 600)
        self.assertEqual(loaded.SECURE_PROXY_SSL_HEADER, ('HTTP_X_FORWARDED_PROTO', 'https'))
        self.assertFalse(hasattr(self.load(), 'SECURE_PROXY_SSL_HEADER'))


class ResetEmailFailureTests(ApiCase):
    """When mail is broken, a real address and an unknown one must still look identical to the caller."""

    def test_a_failing_mail_server_does_not_reveal_which_addresses_have_accounts_or_leak_into_the_log(self):
        self.anonymous()
        cache.clear()
        self.addCleanup(cache.clear)
        with mock.patch('accounts.views.send_mail', side_effect=ConnectionRefusedError('could not connect to smtp.secret-host.example as mailer:hunter2')):
            with self.assertLogs('arcloop.security', level='ERROR') as logs:
                known = self.client.post('/api/v1/auth/password/reset/', {'email': 'alice@example.com'}, format='json')
            unknown = self.client.post('/api/v1/auth/password/reset/', {'email': 'ghost@example.com'}, format='json')
        self.assertEqual((known.status_code, unknown.status_code), (204, 204))
        self.assertEqual(known.content, unknown.content)
        text = '\n'.join(logs.output)
        self.assertIn('event=reset_email_failed', text)
        self.assertIn('error=ConnectionRefusedError', text)
        for secret in ('alice@', 'hunter2', 'secret-host', 'mailer'):
            self.assertNotIn(secret, text)  # only the kind of error is logged, never its message
