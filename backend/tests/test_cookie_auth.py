import datetime as dt

from django.db import models
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AuthToken, hash_token

from .base import ApiCase
from .test_security import PRODUCTION_ENV, load_settings

SESSION, CSRF = 'arcloop_session', 'arcloop_csrf'
PASSWORD = 'correct-horse-battery'


def browser():
    """A client that behaves like a browser for CSRF: Django's checks ON (DRF's test client switches them off by default)."""
    return APIClient(enforce_csrf_checks=True)


def sign_in(client, email='alice@example.com', password=PASSWORD):
    response = client.post('/api/v1/auth/login/', {'email': email, 'password': password, 'transport': 'cookie'}, format='json')
    assert response.status_code == 200, response.content
    return response


def csrf_headers(client):
    return {'HTTP_X_CSRFTOKEN': client.cookies[CSRF].value}


class CookieSessionTests(ApiCase):
    def test_a_cookie_sign_in_sets_an_httponly_strict_api_only_cookie_and_never_puts_the_token_in_the_body(self):
        response = sign_in(browser())
        self.assertEqual(set(response.json()), {'expires_at', 'user'})  # no token for page script to hold
        cookie = response.cookies[SESSION]
        self.assertTrue(cookie['httponly'])
        self.assertEqual((cookie['samesite'], cookie['path']), ('Strict', '/api/'))
        self.assertFalse(cookie['secure'])  # local development over http; the production flag is tested below
        lifetime = 7 * 24 * 3600  # the private-beta policy: seven days
        self.assertLessEqual(abs(int(cookie['max-age']) - lifetime), 5)
        self.assertEqual(AuthToken.objects.get(key_hash=hash_token(cookie.value)).user, self.alice)  # the cookie value is the server-side token

    def test_the_csrf_cookie_is_readable_by_the_page_and_strict(self):
        csrf = sign_in(browser()).cookies[CSRF]
        self.assertFalse(csrf['httponly'])  # the page must read it to echo it in a header
        self.assertEqual((csrf['samesite'], csrf['path']), ('Strict', '/'))
        self.assertTrue(csrf.value)

    def test_a_new_sign_in_gets_a_new_csrf_secret_and_a_new_session(self):
        first, second = sign_in(browser()), sign_in(browser())
        self.assertNotEqual(first.cookies[CSRF].value, second.cookies[CSRF].value)
        self.assertNotEqual(first.cookies[SESSION].value, second.cookies[SESSION].value)

    def test_registration_can_use_the_cookie_transport_too_and_the_default_is_unchanged_for_scripts(self):
        client = browser()
        response = client.post('/api/v1/auth/register/', {'email': 'new@example.com', 'password': 'plum-ladder-orbit-42', 'transport': 'cookie'}, format='json')
        self.assertEqual((response.status_code, 'token' in response.json(), SESSION in response.cookies), (201, False, True))
        self.assertEqual(client.get('/api/v1/auth/me/').json()['email'], 'new@example.com')
        script = browser().post('/api/v1/auth/login/', {'email': 'alice@example.com', 'password': PASSWORD}, format='json')
        self.assertTrue(script.json()['token'])  # no transport = bearer, as before
        self.assertNotIn(SESSION, script.cookies)
        self.assertEqual(browser().post('/api/v1/auth/login/', {'email': 'alice@example.com', 'password': PASSWORD, 'transport': 'carrier-pigeon'}, format='json').status_code, 400)

    def test_the_session_survives_requests_and_reads_need_no_csrf_header(self):
        client = browser()
        sign_in(client)
        for _ in range(3):
            self.assertEqual(client.get('/api/v1/auth/me/').json()['email'], 'alice@example.com')
        self.assertEqual(client.get('/api/v1/profile/').status_code, 200)


class CsrfTests(ApiCase):
    """A request carrying only the cookie must prove it came from the app before it may change anything."""

    def setUp(self):
        super().setUp()
        self.client = browser()
        sign_in(self.client)

    def write(self, **extra):
        return self.client.post('/api/v1/task-templates/', {'title': 'Walk', 'recurrence': 'daily', 'starts_on': '2026-03-01'}, format='json', **extra)

    def test_a_change_without_the_csrf_header_is_refused_and_nothing_happens(self):
        self.assertError(self.write(), 403, 'csrf_failed')
        self.assertError(self.client.patch('/api/v1/profile/', {'display_name': 'x'}, format='json'), 403, 'csrf_failed')
        self.assertError(self.client.delete('/api/v1/task-templates/?title=Walk'), 403, 'csrf_failed')
        self.assertEqual(self.client.get('/api/v1/task-templates/').json()['results'], [])

    def test_the_right_header_is_accepted_a_wrong_one_is_not(self):
        self.assertEqual(self.write(**csrf_headers(self.client)).status_code, 201)
        self.assertError(self.write(HTTP_X_CSRFTOKEN='not-the-token'), 403, 'csrf_failed')
        self.assertError(self.write(HTTP_X_CSRFTOKEN=csrf_headers(self.client)['HTTP_X_CSRFTOKEN'][::-1]), 403, 'csrf_failed')

    def test_a_token_from_someone_elses_session_does_not_work(self):
        other = browser()
        sign_in(other, 'bob@example.com')
        self.assertError(self.write(HTTP_X_CSRFTOKEN=other.cookies[CSRF].value), 403, 'csrf_failed')

    def test_a_request_from_another_origin_is_refused_even_with_a_valid_token(self):
        # What a malicious page cannot do, but a bug or an unexpected browser might: Django also checks the Origin.
        self.assertError(self.write(HTTP_ORIGIN='http://evil.example', **csrf_headers(self.client)), 403, 'csrf_failed')
        self.assertEqual(self.write(HTTP_ORIGIN='http://testserver', **csrf_headers(self.client)).status_code, 201)

    def test_a_bearer_request_needs_no_csrf_header_because_another_site_cannot_attach_one(self):
        response = browser().post('/api/v1/task-templates/', {'title': 'By script', 'recurrence': 'daily', 'starts_on': '2026-03-01'}, format='json', HTTP_AUTHORIZATION=f'Bearer {self.as_user(self.alice)}')
        self.assertEqual(response.status_code, 201)

    def test_the_bearer_header_wins_over_a_cookie_so_it_is_never_a_csrf_question(self):
        bob_token = self.as_user(self.bob)
        response = self.client.post('/api/v1/task-templates/', {'title': 'Bobs', 'recurrence': 'daily', 'starts_on': '2026-03-01'}, format='json', HTTP_AUTHORIZATION=f'Bearer {bob_token}')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.bob.task_templates.count(), 1)  # attributed to the header's user, not the cookie's

    def test_a_cross_site_form_post_cannot_even_reach_the_view(self):
        # HTML forms can only send form encodings; the API accepts JSON only, and JSON from another origin needs a CORS preflight.
        for content_type in ('application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain'):
            response = self.client.post('/api/v1/task-templates/', 'title=Walk', content_type=content_type, **csrf_headers(self.client))
            self.assertEqual(response.status_code, 415, content_type)
        login = APIClient().post('/api/v1/auth/login/', 'email=alice%40example.com&password=x', content_type='application/x-www-form-urlencoded')
        self.assertEqual(login.status_code, 415)


class LogoutExpiryAndIsolationTests(ApiCase):
    def test_logout_needs_csrf_ends_the_session_and_clears_both_cookies(self):
        client = browser()
        sign_in(client)
        self.assertError(client.post('/api/v1/auth/logout/'), 403, 'csrf_failed')
        self.assertEqual(client.get('/api/v1/auth/me/').status_code, 200)  # the refused logout did not log out
        raw = client.cookies[SESSION].value
        response = client.post('/api/v1/auth/logout/', **csrf_headers(client))
        self.assertEqual(response.status_code, 204)
        for name in (SESSION, CSRF):
            self.assertEqual(response.cookies[name]['max-age'], 0)
        self.assertFalse(AuthToken.objects.filter(key_hash=hash_token(raw)).exists())  # revoked on the server, not just forgotten by the browser
        replay = APIClient(enforce_csrf_checks=True)
        replay.cookies = client.cookies  # even a browser that kept the old cookie cannot use it
        self.assertEqual(replay.get('/api/v1/auth/me/').status_code, 401)

    def test_an_expired_session_is_refused_and_the_dead_cookies_are_cleared(self):
        client = browser()
        sign_in(client)
        AuthToken.objects.update(expires_at=timezone.now() - dt.timedelta(seconds=1))
        response = client.get('/api/v1/auth/me/')
        self.assertError(response, 401, 'unauthenticated')
        self.assertEqual(response.cookies[SESSION]['max-age'], 0)

    def test_a_garbage_or_unknown_cookie_is_a_clean_401_that_clears_it(self):
        client = APIClient(enforce_csrf_checks=True)
        client.cookies[SESSION] = 'not-a-real-token'
        response = client.get('/api/v1/profile/')
        self.assertError(response, 401, 'unauthenticated')
        self.assertEqual(response.cookies[SESSION]['max-age'], 0)

    def test_password_change_signs_out_other_devices_but_not_this_one(self):
        mine, other = browser(), browser()
        sign_in(mine)
        sign_in(other)
        changed = mine.post('/api/v1/auth/password/change/', {'current_password': PASSWORD, 'password': 'river-lantern-sky-77'}, format='json', **csrf_headers(mine))
        self.assertEqual(changed.status_code, 204)
        self.assertEqual(mine.get('/api/v1/auth/me/').status_code, 200)
        self.assertEqual(other.get('/api/v1/auth/me/').status_code, 401)

    def test_account_deletion_through_the_cookie_session_needs_csrf_and_clears_the_cookies(self):
        client = browser()
        sign_in(client)
        body = {'password': PASSWORD, 'confirmation': 'DELETE'}
        self.assertError(client.post('/api/v1/auth/account/delete/', body, format='json'), 403, 'csrf_failed')
        self.assertTrue(self.alice.__class__.objects.filter(pk=self.alice.pk).exists())  # refused: still there
        response = client.post('/api/v1/auth/account/delete/', body, format='json', **csrf_headers(client))
        self.assertEqual((response.status_code, response.cookies[SESSION]['max-age']), (204, 0))

    def test_two_signed_in_browsers_see_only_their_own_data(self):
        alice, bob = browser(), browser()
        sign_in(alice)
        sign_in(bob, 'bob@example.com')
        made = alice.post('/api/v1/task-templates/', {'title': 'Private to Alice', 'recurrence': 'daily', 'starts_on': '2026-03-01'}, format='json', **csrf_headers(alice))
        mine = made.json()['results'][0]['id']
        self.assertEqual(len(alice.get('/api/v1/task-templates/').json()['results']), 1)
        self.assertEqual(bob.get('/api/v1/task-templates/').json()['results'], [])
        self.assertEqual(bob.get(f'/api/v1/task-templates/?id={mine}').json()['results'], [])
        self.assertEqual(bob.patch(f'/api/v1/task-templates/?id={mine}', {'title': 'hacked'}, format='json', **csrf_headers(bob)).json()['results'], [])
        self.assertEqual(bob.delete(f'/api/v1/task-templates/?id={mine}', **csrf_headers(bob)).json()['results'], [])
        self.assertEqual(alice.get('/api/v1/task-templates/').json()['results'][0]['title'], 'Private to Alice')
        # Bob's CSRF token is no use for Alice's session either: the pair must belong together.
        self.assertError(alice.post('/api/v1/task-templates/', {'title': 'x', 'recurrence': 'daily', 'starts_on': '2026-03-01'}, format='json', **csrf_headers(bob)), 403, 'csrf_failed')


class CookieSettingsTests(ApiCase):
    def test_in_production_the_cookie_is_secure_and_the_other_flags_do_not_change(self):
        loaded = load_settings()
        self.assertTrue(loaded.AUTH_COOKIE_SECURE and loaded.CSRF_COOKIE_SECURE)
        self.assertEqual((loaded.AUTH_COOKIE_SAMESITE, loaded.CSRF_COOKIE_SAMESITE, loaded.AUTH_COOKIE_PATH), ('Strict', 'Strict', '/api/'))
        self.assertFalse(loaded.CSRF_COOKIE_HTTPONLY)
        self.assertFalse(loaded.CORS_ALLOW_CREDENTIALS)  # cookie sessions are same-origin only: no credentialed cross-origin requests

    @override_settings(AUTH_COOKIE_SECURE=True)
    def test_a_secure_cookie_is_marked_secure_on_the_response(self):
        self.assertTrue(sign_in(browser()).cookies[SESSION]['secure'])


class SessionLifetimeTests(ApiCase):
    """The policy: a session lasts seven days from sign-in, fixed (no renewal). One setting drives the server-side expiry, the
    cookie's Max-Age and the CSRF cookie, and only the server-side expiry decides whether the session is valid."""

    def age_by(self, days):  # time passing, expressed as the stored expiry moving closer
        AuthToken.objects.update(expires_at=models.F('expires_at') - dt.timedelta(days=days))

    def test_the_default_lifetime_is_seven_days_in_every_place_it_is_used(self):
        loaded = load_settings()
        self.assertEqual(loaded.AUTH_TOKEN_LIFETIME_DAYS, 7)
        self.assertEqual(loaded.CSRF_COOKIE_AGE, 7 * 24 * 3600)
        self.assertEqual(load_settings(DJANGO_TOKEN_LIFETIME_DAYS='3').CSRF_COOKIE_AGE, 3 * 24 * 3600)  # one knob moves both

    def test_sign_in_stores_a_seven_day_expiry_and_reports_it(self):
        response = sign_in(browser())
        token = AuthToken.objects.get(key_hash=hash_token(response.cookies[SESSION].value))
        self.assertLess(abs((token.expires_at - timezone.now()) - dt.timedelta(days=7)), dt.timedelta(seconds=5))
        self.assertEqual(response.json()['expires_at'], token.expires_at.isoformat())
        self.assertLessEqual(int(response.cookies[SESSION]['max-age']), 7 * 24 * 3600)  # the cookie never outlives the server side
        self.assertLessEqual(int(response.cookies[CSRF]['max-age']), 7 * 24 * 3600)

    def test_using_the_session_does_not_extend_it(self):
        client = browser()
        mine = AuthToken.objects.filter(key_hash=hash_token(sign_in(client).cookies[SESSION].value))  # setUp made another token
        expiry = mine.get().expires_at
        for _ in range(3):
            self.assertEqual(client.get('/api/v1/auth/me/').status_code, 200)
        self.assertEqual(mine.get().expires_at, expiry)

    def test_the_session_works_on_day_six_and_is_refused_and_cleared_after_day_seven(self):
        client = browser()
        sign_in(client)
        self.age_by(6)
        self.assertEqual(client.get('/api/v1/auth/me/').status_code, 200)
        self.age_by(1.5)  # now past the seven days, although the browser still holds the cookie
        expired = client.get('/api/v1/auth/me/')
        self.assertError(expired, 401, 'unauthenticated')
        self.assertEqual(expired.cookies[SESSION].value, '')  # the dead cookie is cleared
        self.assertEqual(expired.cookies[SESSION]['max-age'], 0)

    def test_an_expired_session_cannot_write_even_with_a_valid_csrf_token(self):
        client = browser()
        sign_in(client)
        headers = csrf_headers(client)
        self.age_by(8)
        self.assertError(client.post('/api/v1/task-templates/', {'title': 'x', 'recurrence': 'daily', 'starts_on': '2026-03-01'}, format='json', **headers), 401, 'unauthenticated')
