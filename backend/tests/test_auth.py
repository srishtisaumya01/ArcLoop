import datetime as dt
from unittest import mock

from django.core import mail
from django.test import override_settings
from django.utils import timezone

from accounts.models import AuthToken, hash_token

from .base import ApiCase

STRONG = 'plum-ladder-orbit-42'


class AuthTests(ApiCase):
    def setUp(self):
        super().setUp()
        self.anonymous()

    def test_register_returns_a_session_and_creates_a_private_profile(self):
        response = self.client.post('/api/v1/auth/register/', {'email': ' New@Example.com ', 'password': STRONG}, format='json')
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['user']['email'], 'new@example.com')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['token']}")
        profile = self.client.get('/api/v1/profile/').json()
        self.assertEqual((profile['timezone'], profile['profile_visibility'], profile['progress_visibility']), ('UTC', 'private', 'private'))

    def test_only_a_hash_of_the_token_is_stored(self):
        body = self.client.post('/api/v1/auth/register/', {'email': 'h@example.com', 'password': STRONG}, format='json').json()
        stored = AuthToken.objects.get(user__email='h@example.com')
        self.assertNotEqual(stored.key_hash, body['token'])
        self.assertEqual(stored.key_hash, hash_token(body['token']))

    def test_weak_and_malformed_registrations_are_refused_with_field_errors(self):
        weak = self.client.post('/api/v1/auth/register/', {'email': 'w@example.com', 'password': 'password'}, format='json')
        self.assertError(weak, 400, 'validation_error')
        self.assertIn('password', weak.json()['error']['fields'])
        bad = self.client.post('/api/v1/auth/register/', {'email': 'nope', 'password': STRONG}, format='json')
        self.assertIn('email', bad.json()['error']['fields'])

    def test_duplicate_email_is_refused_case_insensitively(self):
        response = self.client.post('/api/v1/auth/register/', {'email': 'ALICE@example.com', 'password': STRONG}, format='json')
        self.assertError(response, 400, 'email_taken')

    def test_login_logout_and_a_revoked_token_stops_working(self):
        response = self.client.post('/api/v1/auth/login/', {'email': 'alice@example.com', 'password': 'correct-horse-battery'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['token']}")
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/auth/logout/').status_code, 204)
        self.assertError(self.client.get('/api/v1/auth/me/'), 401, 'unauthenticated')

    def test_wrong_password_and_unknown_email_look_identical(self):
        wrong = self.client.post('/api/v1/auth/login/', {'email': 'alice@example.com', 'password': 'nope-nope-nope'}, format='json')
        unknown = self.client.post('/api/v1/auth/login/', {'email': 'ghost@example.com', 'password': 'nope-nope-nope'}, format='json')
        self.assertError(wrong, 401, 'invalid_credentials')
        self.assertEqual(wrong.json(), unknown.json())

    def test_logout_ends_this_device_only(self):
        first = self.as_user(self.alice)
        second = self.as_user(self.alice)
        self.client.post('/api/v1/auth/logout/')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {first}')
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 200)
        self.assertNotEqual(first, second)

    def test_missing_malformed_expired_and_deactivated_credentials_are_401(self):
        self.assertError(self.client.get('/api/v1/profile/'), 401, 'unauthenticated')
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        self.assertError(self.client.get('/api/v1/profile/'), 401, 'unauthenticated')
        self.client.credentials(HTTP_AUTHORIZATION='Basic abc')
        self.assertError(self.client.get('/api/v1/profile/'), 401, 'unauthenticated')
        raw = self.as_user(self.alice)
        AuthToken.objects.update(expires_at=timezone.now() - dt.timedelta(seconds=1))
        self.assertError(self.client.get('/api/v1/profile/'), 401, 'unauthenticated')
        AuthToken.objects.update(expires_at=timezone.now() + dt.timedelta(days=1))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw}')
        self.assertEqual(self.client.get('/api/v1/profile/').status_code, 200)
        self.alice.is_active = False
        self.alice.save()
        self.assertError(self.client.get('/api/v1/profile/'), 401, 'unauthenticated')

    def test_every_data_endpoint_requires_sign_in(self):
        for name in ('task-templates', 'day-plans', 'task-occurrences', 'reminder-preferences', 'task-reminders'):
            self.assertEqual(self.client.get(f'/api/v1/{name}/').status_code, 401, name)
            self.assertEqual(self.client.post(f'/api/v1/{name}/', {}, format='json').status_code, 401, name)

    def test_password_change_needs_the_current_password_and_signs_other_devices_out(self):
        other = self.as_user(self.alice)
        current = self.as_user(self.alice)
        bad = self.client.post('/api/v1/auth/password/change/', {'current_password': 'wrong-wrong-wrong', 'password': STRONG}, format='json')
        self.assertError(bad, 400, 'invalid_credentials')
        weak = self.client.post('/api/v1/auth/password/change/', {'current_password': 'correct-horse-battery', 'password': '12345678'}, format='json')
        self.assertError(weak, 400, 'weak_password')
        ok = self.client.post('/api/v1/auth/password/change/', {'current_password': 'correct-horse-battery', 'password': STRONG}, format='json')
        self.assertEqual(ok.status_code, 204)
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 200)  # this device stays signed in
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {other}')
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 401)
        self.assertNotEqual(current, other)

    @override_settings(FRONTEND_URL='http://app.test')
    def test_password_reset_flow_is_non_revealing_single_use_and_signs_everyone_out(self):
        self.as_user(self.alice)
        self.anonymous()
        known = self.client.post('/api/v1/auth/password/reset/', {'email': 'alice@example.com'}, format='json')
        unknown = self.client.post('/api/v1/auth/password/reset/', {'email': 'ghost@example.com'}, format='json')
        self.assertEqual((known.status_code, unknown.status_code), (204, 204))
        self.assertEqual(len(mail.outbox), 1)
        link = [line for line in mail.outbox[0].body.splitlines() if line.startswith('http://app.test/update-password')][0]
        query = dict(part.split('=') for part in link.split('?')[1].split('&'))
        bad = self.client.post('/api/v1/auth/password/reset/confirm/', {**query, 'token': 'wrong', 'password': STRONG}, format='json')
        self.assertError(bad, 400, 'invalid_reset_link')
        weak = self.client.post('/api/v1/auth/password/reset/confirm/', {**query, 'password': '12345678'}, format='json')
        self.assertError(weak, 400, 'weak_password')
        ok = self.client.post('/api/v1/auth/password/reset/confirm/', {**query, 'password': STRONG}, format='json')
        self.assertEqual(ok.status_code, 204)
        again = self.client.post('/api/v1/auth/password/reset/confirm/', {**query, 'password': 'another-strong-one-7'}, format='json')
        self.assertError(again, 400, 'invalid_reset_link')  # the link works once
        self.assertEqual(AuthToken.objects.filter(user=self.alice).count(), 0)
        login = self.client.post('/api/v1/auth/login/', {'email': 'alice@example.com', 'password': STRONG}, format='json')
        self.assertEqual(login.status_code, 200)

    def test_auth_endpoints_are_rate_limited(self):
        from django.core.cache import cache
        from rest_framework.throttling import ScopedRateThrottle

        cache.clear()
        self.addCleanup(cache.clear)
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {'auth': '3/min'}):
            responses = [self.client.post('/api/v1/auth/login/', {'email': 'x@example.com', 'password': 'nope-nope-nope'}, format='json') for _ in range(5)]
        self.assertEqual([r.status_code for r in responses], [401, 401, 401, 429, 429])
        self.assertError(responses[-1], 429, 'rate_limited')


class ProfileTests(ApiCase):
    def test_read_and_update_only_the_allowed_fields(self):
        response = self.client.patch('/api/v1/profile/', {'display_name': ' Asha ', 'timezone': 'Asia/Kolkata', 'progress_visibility': 'public'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()['display_name'], response.json()['timezone'], response.json()['progress_visibility']), ('Asha', 'Asia/Kolkata', 'public'))
        self.assertEqual(self.client.patch('/api/v1/profile/', {'display_name': None}, format='json').json()['display_name'], None)

    def test_invalid_values_are_field_errors_and_ids_cannot_be_changed(self):
        for body, field in (({'timezone': 'Mars/Base'}, 'timezone'), ({'display_name': 'x' * 61}, 'display_name'), ({'display_name': '   '}, 'display_name'), ({'profile_visibility': 'friends'}, 'profile_visibility')):
            response = self.client.patch('/api/v1/profile/', body, format='json')
            self.assertError(response, 400, 'validation_error')
            self.assertIn(field, response.json()['error']['fields'])
        self.client.patch('/api/v1/profile/', {'id': 999, 'created_at': '2000-01-01T00:00:00Z'}, format='json')
        self.assertEqual(self.client.get('/api/v1/profile/').json()['id'], self.alice.pk)

    def test_users_only_ever_see_their_own_profile(self):
        self.client.patch('/api/v1/profile/', {'display_name': 'Alice'}, format='json')
        self.as_user(self.bob)
        self.assertIsNone(self.client.get('/api/v1/profile/').json()['display_name'])
