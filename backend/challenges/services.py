"""Joining challenges, groups, and the rule that makes a friend's new account land in the group it was named in."""
import re
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.models import USERNAME_PATTERN, Profile

from .models import ChallengeGroup, Enrollment, GroupMember

User = get_user_model()
MAX_GROUP_MEMBERS = 20
EMAIL_PATTERN = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')


def today_for(user):
    """The calendar date it is for this person now, in their own timezone."""
    try:
        zone = ZoneInfo(user.profile.timezone)
    except Exception:  # noqa: BLE001 - an unknown zone falls back to UTC rather than failing the request
        zone = ZoneInfo('UTC')
    return timezone.now().astimezone(zone).date()


def window_for(challenge, today):
    """The dates a person joining `challenge` today gets: its fixed window, or today for `duration_days` days."""
    if challenge.start_date and challenge.end_date:
        return challenge.start_date, challenge.end_date
    return today, today + timedelta(days=challenge.duration_days - 1)


def clean_members(raw, creator):
    """Checks the people the creator listed. Returns [(username, email)] or a list of problems keyed by row."""
    problems, cleaned, seen_names, seen_emails = {}, [], set(), set()
    me_name = (creator.profile.username or '').lower()
    me_email = (creator.email or '').lower()
    for index, row in enumerate(raw):
        username = str((row or {}).get('username', '')).strip().lower()
        email = str((row or {}).get('email', '')).strip().lower()
        if not USERNAME_PATTERN.match(username):
            problems[index] = 'Give each friend a username of 3 to 30 letters, numbers, dots or underscores.'
        elif not EMAIL_PATTERN.match(email):
            problems[index] = 'Give each friend a valid email address.'
        elif username == me_name or email == me_email:
            problems[index] = 'That is you. Add your friends here, you are already in the group.'
        elif username in seen_names or email in seen_emails:
            problems[index] = 'This friend is listed twice.'
        else:
            seen_names.add(username)
            seen_emails.add(email)
            cleaned.append((username, email))
    return cleaned, problems


def find_user(username, email):
    """The existing account for a username or an email (the username wins), or None."""
    profile = Profile.objects.select_related('user').filter(username=username).first()
    if profile:
        return profile.user
    return User.objects.filter(username__iexact=email).first()


@transaction.atomic
def enroll(user, challenge, mode, members, today):
    """Enrols `user`. For a group, records the named friends and enrols those who already have an account."""
    start, end = window_for(challenge, today)
    group = None
    if mode == 'group':
        group = ChallengeGroup.objects.create(challenge=challenge, creator=user, start_date=start, end_date=end)
    enrollment = Enrollment.objects.create(challenge=challenge, user=user, group=group, start_date=start, end_date=end)
    for username, email in members:
        friend = find_user(username, email)
        member = GroupMember.objects.create(group=group, username=username, email=email, user=friend)
        if friend is not None:
            Enrollment.objects.get_or_create(challenge=challenge, user=friend, defaults={'group': group, 'start_date': start, 'end_date': end})
            member.user = friend
    return enrollment


@transaction.atomic
def link_pending_memberships(user):
    """Run when an account appears or its username/email changes: any group that named this username or email
    now includes this person, on the same dates as everyone else in it."""
    username = (user.profile.username or '').lower()
    email = (user.email or '').lower()
    query = Q(email=email)
    if username:
        query |= Q(username=username)
    pending = GroupMember.objects.select_related('group', 'group__challenge').filter(query, user__isnull=True)
    for member in pending:
        group = member.group
        Enrollment.objects.get_or_create(challenge=group.challenge, user=user, defaults={'group': group, 'start_date': group.start_date, 'end_date': group.end_date})
        member.user = user
        member.save(update_fields=['user'])
