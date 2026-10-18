"""Test-only request clock.

Automated browser-free integration tests run the frontend's real services against a real server and need
"now" to be a fixed instant that can differ per test. When the server is started with ARCLOOP_TEST_CLOCK=1
(refused unless DJANGO_DEBUG is on, see settings), a request may carry `X-Test-Now: <ISO instant>` and every
planner rule in that request sees that instant. Without the switch the header is ignored, so production
behaviour cannot be changed by a client.
"""
import datetime as dt

from django.http import JsonResponse

from planner import rules


class TestClockMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        raw = request.META.get('HTTP_X_TEST_NOW')
        if not raw:
            return self.get_response(request)
        try:
            instant = dt.datetime.fromisoformat(raw.replace('Z', '+00:00'))
        except ValueError:
            return JsonResponse({'error': {'code': 'validation_error', 'message': 'Bad test clock.'}}, status=400)
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=dt.timezone.utc)
        token = rules.test_now.set(instant)
        try:
            return self.get_response(request)
        finally:
            rules.test_now.reset(token)


class ApiSecurityHeadersMiddleware:
    """Headers for every API response (/api/...). The API only ever returns JSON, so it needs no scripts, styles or
    framing; its answers can hold personal data and tokens, so they must not be cached or leak through Referer."""

    HEADERS = {
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            for name, value in self.HEADERS.items():
                response.headers[name] = value
        return response
