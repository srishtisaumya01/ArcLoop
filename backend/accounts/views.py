import logging

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.auth_cookies import clear_session_cookies, set_session_cookies
from config.errors import ApiError, validation_error
from config.security_log import log_event

from django.http import HttpResponse
from django.utils import timezone

from .models import AuthToken, Profile
from .serializers import (
    AccountDeleteSerializer,
    EmailChangeSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    RegisterSerializer,
    checked_password,
)

User = get_user_model()
WEAK = 'That password is too easy to guess. Try a longer or less common one.'


def user_body(user):
    return {'id': user.pk, 'email': user.email, 'username': user.profile.username}


def start_session(request, user, transport, status_code):
    """Issues a session for `user` and answers in the requested transport. The cookie transport never puts the token in
    the body: the browser's script must not hold the credential."""
    raw, token = AuthToken.issue(user)
    body = {'expires_at': token.expires_at.isoformat(), 'user': user_body(user)}
    if transport == 'cookie':
        response = Response(body, status=status_code)
        set_session_cookies(request, response, raw, token)
        return response
    return Response({'token': raw, **body}, status=status_code)


def new_password(raw, user):
    try:
        return checked_password(raw, user)
    except serializers.ValidationError as e:
        raise validation_error(WEAK, {'password': str(e.detail[0])}, 'weak_password')


class PublicAuthView(APIView):
    """Public auth endpoints: no credentials needed, one shared throttle scope."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'


class RegisterView(PublicAuthView):
    def post(self, request):
        data = RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email, password = data.validated_data['email'], data.validated_data['password']
        try:
            with transaction.atomic():
                if User.objects.filter(username__iexact=email).exists():
                    raise IntegrityError
                user = User.objects.create_user(username=email, email=email, password=password)
        except IntegrityError:
            raise validation_error('An account may already exist for that email. Try logging in or resetting your password.', {'email': 'Try another email, or log in.'}, 'email_taken')
            chosen = data.validated_data.get('username')
            if chosen:
                if Profile.objects.filter(username=chosen).exclude(pk=user.pk).exists():
                    raise validation_error('That username is taken. Try another.', {'username': 'That username is taken. Try another.'}, 'username_taken')
                Profile.objects.filter(pk=user.pk).update(username=chosen)
                user.profile.username = chosen
        log_event(request, 'registered', user=user.pk)
        return start_session(request, user, data.validated_data['transport'], status.HTTP_201_CREATED)


class LoginView(PublicAuthView):
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        identifier = data.validated_data['identifier']
        if '@' in identifier:
            login_name = identifier  # the account's sign-in name is its email
        else:
            profile = Profile.objects.select_related('user').filter(username=identifier).first()
            login_name = profile.user.username if profile else identifier
        user = authenticate(request, username=login_name, password=data.validated_data['password'])
        if user is None:
            log_event(request, 'login_failed', logging.WARNING)  # no email: it may be someone else's
            raise ApiError('invalid_credentials', 'Username or password is incorrect.', status.HTTP_401_UNAUTHORIZED)
        return start_session(request, user, data.validated_data['transport'], status.HTTP_200_OK)


class LogoutView(APIView):
    """Ends this device's session only."""

    def post(self, request):
        request.auth.delete()
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_session_cookies(response)  # harmless for a bearer client; a browser's cookies go
        return response


class MeView(APIView):
    def get(self, request):
        return Response({**user_body(request.user), 'expires_at': request.auth.expires_at.isoformat()})


class PasswordChangeView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        data = PasswordChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not request.user.check_password(data.validated_data['current_password']):
            raise validation_error('Your current password is incorrect.', {'current_password': 'That is not your current password.'}, 'invalid_credentials')
        request.user.set_password(new_password(data.validated_data['password'], request.user))
        request.user.save(update_fields=['password'])
        AuthToken.objects.filter(user=request.user).exclude(pk=request.auth.pk).delete()  # other devices must log in again
        log_event(request, 'password_changed', user=request.user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmailChangeView(APIView):
    """Changes the sign-in email. Needs the password again: a stolen session alone must not be able to take the account."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        data = EmailChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user, email = request.user, data.validated_data['email']
        if not user.check_password(data.validated_data['password']):
            raise validation_error('Your password is incorrect.', {'password': 'That is not your password.'}, 'invalid_credentials')
        if User.objects.filter(username__iexact=email).exclude(pk=user.pk).exists():
            raise validation_error('That email is already used by another account.', {'email': 'Try another email.'}, 'email_taken')
        user.username = user.email = email  # the email is also the account's sign-in name inside Django
        user.save(update_fields=['username', 'email'])
        log_event(request, 'email_changed', user=user.pk)
        return Response(user_body(user))


MAX_AVATAR_BYTES = 300_000
IMAGE_SIGNATURES = [(b'\xff\xd8\xff', 'image/jpeg'), (b'\x89PNG\r\n\x1a\n', 'image/png')]


def sniff_image(raw):
    """The image type judged from the file's own first bytes (never from what the client claims), or None."""
    for signature, kind in IMAGE_SIGNATURES:
        if raw.startswith(signature):
            return kind
    if raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
        return 'image/webp'
    return None


class AvatarView(APIView):
    """The signed-in person's profile picture: GET it, PUT a new one (the raw image bytes), DELETE it."""

    def get(self, request):
        profile = request.user.profile
        if not profile.avatar:
            raise ApiError('not_found', 'No profile picture.', status.HTTP_404_NOT_FOUND)
        response = HttpResponse(bytes(profile.avatar), content_type=profile.avatar_type)
        response['Cache-Control'] = 'private, max-age=86400'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def put(self, request):
        raw = request.body
        if not raw or len(raw) > MAX_AVATAR_BYTES:
            raise validation_error('Choose a picture under 300 KB.', {'avatar': 'Choose a picture under 300 KB.'}, 'avatar_too_large')
        kind = sniff_image(raw)
        if kind is None:
            raise validation_error('Use a JPEG, PNG or WebP picture.', {'avatar': 'Use a JPEG, PNG or WebP picture.'}, 'avatar_type')
        profile = request.user.profile
        profile.avatar, profile.avatar_type, profile.avatar_updated_at = raw, kind, timezone.now()
        profile.save(update_fields=['avatar', 'avatar_type', 'avatar_updated_at'])
        return Response(ProfileSerializer(profile).data)

    def delete(self, request):
        profile = request.user.profile
        profile.avatar, profile.avatar_type, profile.avatar_updated_at = None, '', None
        profile.save(update_fields=['avatar', 'avatar_type', 'avatar_updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(PublicAuthView):
    """Always answers the same way, so it cannot be used to find out who has an account."""

    def post(self, request):
        data = PasswordResetRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = User.objects.filter(username__iexact=data.validated_data['email'], is_active=True).first()
        log_event(request, 'password_reset_requested')  # whether or not the address exists: the log must not reveal it either
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f'{settings.FRONTEND_URL}/update-password?uid={uid}&token={token}'
            try:
                send_mail(
                    'Reset your Arcloop password',
                    f'Use this link to choose a new password. If you did not ask for it, you can ignore this email.\n\n{link}\n',
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                )
            except Exception as error:  # noqa: BLE001 - any mail failure: the caller must not learn that this address has an account
                # Answering 500 only for real accounts would reveal which addresses exist exactly when mail is broken.
                # The operator sees it in the log (error type only: the message may contain the address or credentials).
                log_event(request, 'reset_email_failed', logging.ERROR, error=type(error).__name__, user=user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(PublicAuthView):
    def post(self, request):
        data = PasswordResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        invalid = ApiError('invalid_reset_link', 'This reset link is invalid or has expired. Request a new one.', status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(data.validated_data['uid'])), is_active=True)
        except (ValueError, TypeError, OverflowError, User.DoesNotExist):
            raise invalid
        if not default_token_generator.check_token(user, data.validated_data['token']):
            log_event(request, 'password_reset_failed', logging.WARNING)
            raise invalid
        user.set_password(new_password(data.validated_data['password'], user))  # also retires this link: its token is derived from the password hash
        user.save(update_fields=['password'])
        AuthToken.objects.filter(user=user).delete()
        log_event(request, 'password_reset_done', user=user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountDeleteView(APIView):
    """Permanently deletes the signed-in account and everything it owns.

    Needs the account password again (a stolen token alone cannot do this) and the typed word DELETE.
    Staff and superuser accounts are refused: they are managed in the admin, never through this endpoint.
    The user, profile, tokens, task templates, day plans, task occurrences and reminders go together, in one
    transaction. A repeat request finds no session (the token is gone) and is answered 401.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'
    CONFIRMATION = 'DELETE'

    def post(self, request):
        data = AccountDeleteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = request.user
        if user.is_staff or user.is_superuser:
            raise ApiError('permission_denied', 'This account cannot be deleted here.', status.HTTP_403_FORBIDDEN)
        if not user.check_password(data.validated_data['password']):
            raise validation_error('Your password is incorrect.', {'password': 'That is not your password.'}, 'invalid_credentials')
        if data.validated_data['confirmation'] != self.CONFIRMATION:
            message = f'Type {self.CONFIRMATION} to confirm.'
            raise validation_error(message, {'confirmation': message}, 'confirmation_required')
        user_id = user.pk
        with transaction.atomic():
            user.delete()  # cascades to the profile, tokens, templates, days, occurrences and reminders
        log_event(request, 'account_deleted', user=user_id)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_session_cookies(response)
        return response


class ProfileView(APIView):
    def get(self, request):
        return Response(ProfileSerializer(request.user.profile).data)

    def patch(self, request):
        profile = request.user.profile
        data = ProfileSerializer(profile, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        return Response(ProfileSerializer(profile).data)
