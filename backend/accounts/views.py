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

from config.errors import ApiError, validation_error

from .models import AuthToken
from .serializers import (
    AccountDeleteSerializer,
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


def session_payload(user, raw_token, token):
    return {'token': raw_token, 'expires_at': token.expires_at.isoformat(), 'user': {'id': user.pk, 'email': user.email}}


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
        raw, token = AuthToken.issue(user)
        return Response(session_payload(user, raw, token), status=status.HTTP_201_CREATED)


class LoginView(PublicAuthView):
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(request, username=data.validated_data['email'], password=data.validated_data['password'])
        if user is None:
            raise ApiError('invalid_credentials', 'Email or password is incorrect.', status.HTTP_401_UNAUTHORIZED)
        raw, token = AuthToken.issue(user)
        return Response(session_payload(user, raw, token))


class LogoutView(APIView):
    """Ends this device's session only."""

    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response({'id': request.user.pk, 'email': request.user.email, 'expires_at': request.auth.expires_at.isoformat()})


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
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(PublicAuthView):
    """Always answers the same way, so it cannot be used to find out who has an account."""

    def post(self, request):
        data = PasswordResetRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = User.objects.filter(username__iexact=data.validated_data['email'], is_active=True).first()
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f'{settings.FRONTEND_URL}/update-password?uid={uid}&token={token}'
            send_mail(
                'Reset your Arcloop password',
                f'Use this link to choose a new password. If you did not ask for it, you can ignore this email.\n\n{link}\n',
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
            )
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
            raise invalid
        user.set_password(new_password(data.validated_data['password'], user))  # also retires this link: its token is derived from the password hash
        user.save(update_fields=['password'])
        AuthToken.objects.filter(user=user).delete()
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
        with transaction.atomic():
            user.delete()  # cascades to the profile, tokens, templates, days, occurrences and reminders
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileView(APIView):
    def get(self, request):
        return Response(ProfileSerializer(request.user.profile).data)

    def patch(self, request):
        profile = request.user.profile
        data = ProfileSerializer(profile, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        return Response(ProfileSerializer(profile).data)
