import re
import secrets
from datetime import date

from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from config.errors import ApiError, validation_error

from .models import Challenge, Enrollment, GroupMember
from .services import MAX_GROUP_MEMBERS, clean_members, enroll, today_for

MAX_CUSTOM_DAYS = 400


def group_body(group):
    return {
        'id': str(group.pk),
        'members': [{'username': m.username, 'joined': m.user_id is not None} for m in group.members.all().order_by('id')],
    }


def enrollment_body(enrollment):
    return {
        'id': str(enrollment.pk),
        'mode': 'group' if enrollment.group_id else 'solo',
        'start_date': enrollment.start_date.isoformat(),
        'end_date': enrollment.end_date.isoformat(),
        'group': group_body(enrollment.group) if enrollment.group_id else None,
    }


def challenge_body(challenge, enrollment=None):
    details = challenge.details or {}
    return {
        'slug': challenge.slug,
        'kind': challenge.kind,
        'title': challenge.title,
        'category': challenge.category,
        'summary': challenge.summary,
        'description': challenge.description,
        'organizer': details.get('organizer'),
        'rules': details.get('rules', []),
        'habits': details.get('habits', []),
        'participation': details.get('participation', ''),
        'scoring': details.get('scoring', ''),
        'featured': challenge.featured,
        'duration_days': challenge.duration_days,
        'start_date': challenge.start_date.isoformat() if challenge.start_date else None,
        'end_date': challenge.end_date.isoformat() if challenge.end_date else None,
        'enrollment': enrollment_body(enrollment) if enrollment else None,
    }


def visible_to(user):
    """The catalogue, plus the custom challenges this person made or is in."""
    return Challenge.objects.filter(Q(kind='official') | Q(owner=user) | Q(enrollments__user=user)).distinct()


def enrollments_of(user):
    return {e.challenge_id: e for e in Enrollment.objects.filter(user=user).select_related('group')}


class ChallengeListView(APIView):
    """GET: the challenges this person can see (each says whether they are in it). `?q=` searches title, category and summary.
    POST: makes a custom challenge and enrols its maker."""

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        rows = visible_to(request.user)
        if query:
            rows = rows.filter(Q(title__icontains=query) | Q(category__icontains=query) | Q(summary__icontains=query))
        mine = enrollments_of(request.user)
        ordered = sorted(rows, key=lambda c: (not c.featured, c.kind != 'official', c.title.lower()))
        return Response({'results': [challenge_body(c, mine.get(c.pk)) for c in ordered]})

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        title = str(data.get('title', '')).strip()
        if not 1 <= len(title) <= 80:
            raise validation_error('Give your challenge a name of up to 80 characters.', {'title': 'Give your challenge a name of up to 80 characters.'})
        try:
            start, end = date.fromisoformat(str(data.get('start_date'))), date.fromisoformat(str(data.get('end_date')))
        except ValueError:
            raise validation_error('Choose a start date and an end date.', {'start_date': 'Choose a start date and an end date.'})
        if end < start:
            raise validation_error('The end date must be on or after the start date.', {'end_date': 'The end date must be on or after the start date.'})
        days = (end - start).days + 1
        if days > MAX_CUSTOM_DAYS:
            raise validation_error(f'A challenge can last up to {MAX_CUSTOM_DAYS} days.', {'end_date': f'A challenge can last up to {MAX_CUSTOM_DAYS} days.'})
        summary = str(data.get('summary', '')).strip()[:300]
        slug = f"my-{re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:40] or 'challenge'}-{secrets.token_hex(3)}"
        challenge = Challenge.objects.create(
            slug=slug, kind='custom', owner=request.user, title=title, category='My challenge', summary=summary,
            description=summary, duration_days=days, start_date=start, end_date=end, visibility='private',
            details={'organizer': {'name': 'You', 'role': 'Your own challenge'}},
        )
        enrollment = Enrollment.objects.create(challenge=challenge, user=request.user, start_date=start, end_date=end)
        return Response(challenge_body(challenge, enrollment), status=status.HTTP_201_CREATED)


def get_visible(request, slug):
    challenge = visible_to(request.user).filter(slug=slug).first()
    if challenge is None:
        raise ApiError('not_found', 'That challenge was not found.', status.HTTP_404_NOT_FOUND)
    return challenge


class ChallengeDetailView(APIView):
    def get(self, request, slug):
        challenge = get_visible(request, slug)
        return Response(challenge_body(challenge, enrollments_of(request.user).get(challenge.pk)))


class MyChallengesView(APIView):
    """Everything this person is in, soonest to finish first, each with its dates and its group."""

    def get(self, request):
        rows = Enrollment.objects.filter(user=request.user).select_related('challenge', 'group').order_by('end_date', 'start_date')
        return Response({'today': today_for(request.user).isoformat(), 'results': [challenge_body(e.challenge, e) for e in rows]})


class EnrollView(APIView):
    """Joins a catalogue challenge: `{mode: 'solo'}` or `{mode: 'group', members: [{username, email}, ...]}`."""

    def post(self, request, slug):
        challenge = get_visible(request, slug)
        data = request.data if isinstance(request.data, dict) else {}
        mode = data.get('mode')
        if mode not in ('solo', 'group'):
            raise validation_error('Choose to continue solo or in a group.', {'mode': 'Choose to continue solo or in a group.'})
        if challenge.kind != 'official' or challenge.visibility != 'public':
            raise ApiError('permission_denied', 'This challenge cannot be joined.', status.HTTP_403_FORBIDDEN)
        if Enrollment.objects.filter(challenge=challenge, user=request.user).exists():
            raise validation_error('You are already in this challenge.', None, 'already_enrolled')
        today = today_for(request.user)
        if challenge.end_date and challenge.end_date < today:
            raise validation_error('This challenge has already ended.', None, 'challenge_ended')
        members = []
        if mode == 'group':
            raw = data.get('members')
            if not isinstance(raw, list) or not raw:
                raise validation_error('Add at least one friend to start in a group.', {'members': 'Add at least one friend to start in a group.'})
            if len(raw) > MAX_GROUP_MEMBERS - 1:
                raise validation_error(f'A group can have up to {MAX_GROUP_MEMBERS} people, you included.', {'members': 'Too many friends.'})
            members, problems = clean_members(raw, request.user)
            if problems:
                raise validation_error('Please check the highlighted friends.', {'members': {str(k): v for k, v in problems.items()}})
        enrollment = enroll(request.user, challenge, mode, members, today)
        return Response(challenge_body(challenge, enrollment), status=status.HTTP_201_CREATED)


class LeaveView(APIView):
    """Leaves a challenge (only for this person; a group carries on without them). A custom challenge is deleted with its owner's leaving."""

    def delete(self, request, slug):
        challenge = get_visible(request, slug)
        Enrollment.objects.filter(challenge=challenge, user=request.user).delete()
        GroupMember.objects.filter(group__challenge=challenge, user=request.user).delete()
        if challenge.kind == 'custom' and challenge.owner_id == request.user.pk:
            challenge.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
