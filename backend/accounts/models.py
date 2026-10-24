import hashlib
import hmac
from datetime import time
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
    # The person's working hours: check-in opens at the start, and the end is when they plan to check out.
    # Reminder emails when a streak is about to break (5 pm and 10 pm). The person can switch them off from the email.
    email_reminders = models.BooleanField(default=True)
    shift_start = models.TimeField(default=time(9, 0))
    shift_end = models.TimeField(default=time(18, 0))
    # When the picture last changed (the picture itself is in ProfileAvatar, so ordinary profile reads never load its bytes).
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


class ProfileAvatar(models.Model):
    """The profile picture: one small image per person, kept in the database (the host's disk is not permanent). It lives in
    its own table so that reading a profile never drags the image along. Served by /profile/avatar/."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE, related_name='avatar_image')
    data = models.BinaryField()
    content_type = models.CharField(max_length=20)


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

    MAX_PER_USER = 5  # logins kept per person (devices); the oldest beyond this are dropped

    @classmethod
    def prune(cls, user):
        """Deletes this person's expired logins and any beyond the newest few (room for the one about to be issued)."""
        cls.objects.filter(user=user, expires_at__lte=timezone.now()).delete()
        keep = list(cls.objects.filter(user=user).order_by('-created_at').values_list('pk', flat=True)[: cls.MAX_PER_USER - 1])
        cls.objects.filter(user=user).exclude(pk__in=keep).delete()

    @classmethod
    def issue(cls, user):
        raw = secrets.token_urlsafe(32)
        token = cls.objects.create(
            user=user,
            key_hash=hash_token(raw),
            expires_at=timezone.now() + timedelta(days=settings.AUTH_TOKEN_LIFETIME_DAYS),
        )
        return raw, token


class PasswordResetCode(models.Model):
    """The six-digit code emailed for a password reset. One row per person (a new request replaces the old code); only a
    hash is stored. It expires, and a wrong guess is counted so it cannot be guessed by trying them all."""

    LIFETIME = timedelta(minutes=10)
    RESEND_AFTER = timedelta(seconds=45)
    MAX_ATTEMPTS = 5

    user = models.OneToOneField(settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE, related_name='reset_code')
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)

    @staticmethod
    def digest(user, code):
        return hashlib.sha256(f'{code}:{user.pk}:{settings.SECRET_KEY}'.encode('utf-8')).hexdigest()

    @classmethod
    def issue(cls, user):
        """A new code for `user`, or None if one was sent a moment ago (so the button cannot be used to flood a mailbox)."""
        existing = cls.objects.filter(user=user).first()
        if existing and timezone.now() - existing.created_at < cls.RESEND_AFTER:
            return None
        code = f'{secrets.randbelow(1_000_000):06d}'
        now = timezone.now()
        cls.objects.update_or_create(user=user, defaults={'code_hash': cls.digest(user, code), 'created_at': now, 'expires_at': now + cls.LIFETIME, 'attempts': 0})
        return code

    @classmethod
    def verify(cls, user, code):
        """True if `code` is the current, unexpired code (and uses it up). Counts every wrong guess."""
        row = cls.objects.filter(user=user).first()
        if row is None or row.expires_at <= timezone.now() or row.attempts >= cls.MAX_ATTEMPTS:
            cls.objects.filter(user=user).delete()
            return False
        if hmac.compare_digest(row.code_hash, cls.digest(user, code)):
            row.delete()
            return True
        row.attempts += 1
        row.save(update_fields=['attempts'])
        return False
