from datetime import timedelta

from django.core.exceptions import PermissionDenied
from django.utils import timezone
from rest_framework import authentication, exceptions

from config.auth_cookies import session_cookie_value
from config.errors import ApiError

from .models import AuthToken, hash_token

SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')


class TokenAuthentication(authentication.BaseAuthentication):
    """The session token, from `Authorization: Bearer <token>` (scripts, tools, other clients) or from the HttpOnly session
    cookie (browsers). Unknown, expired and deactivated-user tokens all look the same.

    A cookie is sent by the browser on its own, so a request authenticated ONLY by the cookie must prove it came from the app:
    for anything that changes data it needs Django's CSRF check (the X-CSRFToken header matching the CSRF cookie, and a
    same-origin `Origin`). A bearer header cannot be attached by another site, so it needs no CSRF check."""

    keyword = 'Bearer'

    def authenticate(self, request):
        raw, via_cookie = self._credential(request)
        if raw is None:
            return None
        token = AuthToken.objects.select_related('user').filter(key_hash=hash_token(raw)).first()
        now = timezone.now()
        if token is None or token.expires_at <= now or not token.user.is_active:
            raise exceptions.AuthenticationFailed()
        if via_cookie and request.method not in SAFE_METHODS:
            self._enforce_csrf(request)
        if token.last_used_at is None or now - token.last_used_at > timedelta(hours=1):
            AuthToken.objects.filter(pk=token.pk).update(last_used_at=now)
        return token.user, token

    def authenticate_header(self, request):
        return self.keyword

    def _credential(self, request):
        parts = authentication.get_authorization_header(request).split()
        if parts and parts[0].lower() == self.keyword.lower().encode():
            if len(parts) != 2:
                raise exceptions.AuthenticationFailed()
            try:
                return parts[1].decode(), False  # the header wins: no CSRF question arises
            except UnicodeError:
                raise exceptions.AuthenticationFailed()
        cookie = session_cookie_value(request)
        return (cookie, True) if cookie else (None, False)

    @staticmethod
    def _enforce_csrf(request):
        try:
            authentication.SessionAuthentication().enforce_csrf(request)
        except (exceptions.PermissionDenied, PermissionDenied):
            raise ApiError('csrf_failed', 'Your session could not be verified. Reload the page and try again.', 403)

