import hashlib
import re
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
    """One row per user, created with the user. Visibility defaults to private: nothing is shared yet."""

    VISIBILITY = [('private', 'private'), ('public', 'public')]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE, related_name='profile')
    # The sign-in name. Always stored lower-case, so "Ada" and "ada" are the same person.
    username = models.CharField(max_length=30, unique=True, null=True, blank=True)
    display_name = models.CharField(max_length=60, null=True, blank=True)
    # A small profile picture, kept in the database (the host's disk is not permanent). Served by /profile/avatar/.
    avatar = models.BinaryField(null=True, blank=True, editable=False)
    avatar_type = models.CharField(max_length=20, blank=True, default='')
    avatar_updated_at = models.DateTimeField(null=True, blank=True)
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


USERNAME_PATTERN = re.compile(r'^[a-z0-9_.]{3,30}$')


def free_username(seed):
    """A valid, unused username derived from `seed` (an email or a name): used when nobody chose one."""
    base = re.sub(r'[^a-z0-9_.]', '', seed.split('@')[0].lower())[:24] or 'user'
    base = base.ljust(3, '0')
    candidate, n = base, 1
    while Profile.objects.filter(username=candidate).exists():
        n += 1
        candidate = f'{base[:26]}{n}'
    return candidate


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_profile(sender, instance, created, **kwargs):
    if created:
        profile, made = Profile.objects.get_or_create(user=instance)
        if made and not profile.username:
            profile.username = free_username(instance.email or instance.username)
            profile.save(update_fields=['username'])


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
