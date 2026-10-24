import uuid

from django.conf import settings
from django.db import models


class Challenge(models.Model):
    """A challenge people can join. `official` ones come from the catalogue; `custom` ones are made by a person for themselves."""

    KINDS = [('official', 'official'), ('custom', 'custom')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=90, unique=True)
    kind = models.CharField(max_length=10, choices=KINDS, default='official')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_challenges')
    title = models.CharField(max_length=80)
    category = models.CharField(max_length=40, default='Personal growth')
    summary = models.CharField(max_length=300, blank=True, default='')
    description = models.TextField(blank=True, default='')
    details = models.JSONField(default=dict, blank=True)  # organizer, rules, habits, participation, scoring
    duration_days = models.PositiveSmallIntegerField()
    # A fixed calendar window, or null for "starts on the day you join" (the end is then start + duration).
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    visibility = models.CharField(max_length=12, default='public')
    featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class ChallengeGroup(models.Model):
    """Friends doing one challenge together. Everyone in it shares these dates."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name='groups')
    creator = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='created_groups')
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)


class GroupMember(models.Model):
    """Someone the creator named: a username and an email. `user` stays empty until that person has an account."""

    group = models.ForeignKey(ChallengeGroup, on_delete=models.CASCADE, related_name='members')
    username = models.CharField(max_length=30, db_index=True)  # lower-case; looked up when someone signs up
    email = models.CharField(max_length=150, db_index=True)  # lower-case
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='group_memberships')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['group', 'username'], name='one_member_name_per_group')]


class Enrollment(models.Model):
    """One person doing one challenge, on their own or in a group, between two dates."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name='enrollments')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='enrollments')
    group = models.ForeignKey(ChallengeGroup, null=True, blank=True, on_delete=models.SET_NULL, related_name='enrollments')
    start_date = models.DateField()
    end_date = models.DateField()
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['challenge', 'user'], name='one_enrollment_per_challenge')]


class ChallengeAttendance(models.Model):
    """One day a person marked present in one challenge. It can only be made for the day it is, in their own timezone."""

    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='attendance')
    date = models.DateField()
    marked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['enrollment', 'date'], name='one_attendance_per_day')]
