import hashlib
import secrets
from datetime import timedelta
from functools import lru_cache
from zoneinfo import available_timezones

from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


@lru_cache(maxsize=1)
def valid_timezones():
    return frozenset(available_timezones())


class Profile(models.Model):
    """One row per user, created with the user. Visibility defaults to private, as in the Supabase schema."""

    VISIBILITY = [('private', 'private'), ('public', 'public')]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE, related_name='profile')
    display_name = models.CharField(max_length=60, null=True, blank=True)
    timezone = models.CharField(max_length=64, default='UTC')
    interests = models.JSONField(default=list)
    profile_visibility = models.CharField(max_length=10, choices=VISIBILITY, default='private')
    progress_visibility = models.CharField(max_length=10, choices=VISIBILITY, default='private')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(profile_visibility__in=['private', 'public']), name='profile_visibility_valid'),
            models.CheckConstraint(condition=models.Q(progress_visibility__in=['private', 'public']), name='progress_visibility_valid'),
        ]


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.get_or_create(user=instance)


def hash_token(raw):
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


class AuthToken(models.Model):
    """A login on one device. Only a hash is stored, so a database leak does not leak usable tokens."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='auth_tokens')
    key_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()

    @classmethod
    def issue(cls, user):
        raw = secrets.token_urlsafe(32)
        token = cls.objects.create(
            user=user,
            key_hash=hash_token(raw),
            expires_at=timezone.now() + timedelta(days=settings.AUTH_TOKEN_LIFETIME_DAYS),
        )
        return raw, token
