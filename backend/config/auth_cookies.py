"""The browser session cookies: one place that sets, reads and clears them.

A browser signs in with `transport: "cookie"`. The server then sets
  * the SESSION cookie: the same opaque token a bearer client gets, but HttpOnly (script cannot read it), Secure in
    production, SameSite=Strict and limited to the API path, so it is only ever sent by the app's own pages to /api/;
  * the CSRF cookie: Django's CSRF secret, readable by the page (it must echo it in the X-CSRFToken header), SameSite=Strict.
The token is never in a response body for the cookie transport, so page script never holds the credential.
Names, path, flags and lifetime come from settings (config/settings.py), which are also what `manage.py auth_contract` prints
for the frontend test that keeps its copy of the names in step.
"""
from django.conf import settings
from django.middleware.csrf import rotate_token
from django.utils import timezone


def session_cookie_value(request):
    return request.COOKIES.get(settings.AUTH_COOKIE_NAME)


def set_session_cookies(request, response, raw_token, token):
    seconds = max(0, int((token.expires_at - timezone.now()).total_seconds()))  # the cookie never outlives the server-side token
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        raw_token,
        max_age=seconds,
        path=settings.AUTH_COOKIE_PATH,
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    rotate_token(request)  # a fresh CSRF secret for the new session; CsrfViewMiddleware writes its cookie onto this response


def clear_session_cookies(response):
    response.delete_cookie(settings.AUTH_COOKIE_NAME, path=settings.AUTH_COOKIE_PATH, samesite=settings.AUTH_COOKIE_SAMESITE)
    response.delete_cookie(settings.CSRF_COOKIE_NAME, path=settings.CSRF_COOKIE_PATH, samesite=settings.CSRF_COOKIE_SAMESITE)
