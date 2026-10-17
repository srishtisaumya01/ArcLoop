from datetime import timedelta

from django.utils import timezone
from rest_framework import authentication, exceptions

from .models import AuthToken, hash_token


class BearerTokenAuthentication(authentication.BaseAuthentication):
    """`Authorization: Bearer <token>`. Unknown, expired and inactive-user tokens all look the same."""

    keyword = 'Bearer'

    def authenticate(self, request):
        parts = authentication.get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword.lower().encode():
            return None
        if len(parts) != 2:
            raise exceptions.AuthenticationFailed()
        try:
            raw = parts[1].decode()
        except UnicodeError:
            raise exceptions.AuthenticationFailed()
        token = AuthToken.objects.select_related('user').filter(key_hash=hash_token(raw)).first()
        now = timezone.now()
        if token is None or token.expires_at <= now or not token.user.is_active:
            raise exceptions.AuthenticationFailed()
        if token.last_used_at is None or now - token.last_used_at > timedelta(hours=1):
            AuthToken.objects.filter(pk=token.pk).update(last_used_at=now)
        return token.user, token

    def authenticate_header(self, request):
        return self.keyword
