from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import USERNAME_PATTERN, Profile, valid_timezones

User = get_user_model()
MAX_EMAIL = 150  # the username column is 150 characters and holds the email


def checked_password(value, user=None):
    """Django's configured password rules; raises a DRF ValidationError listing every problem."""
    try:
        validate_password(value, user)
    except DjangoValidationError as e:
        raise serializers.ValidationError(list(e.messages))
    return value


class EmailField(serializers.EmailField):
    def to_internal_value(self, data):
        return super().to_internal_value(data).strip().lower()


def clean_username(value):
    """Usernames are 3-30 letters, digits, dots and underscores, stored lower-case."""
    value = value.strip().lower()
    if not USERNAME_PATTERN.match(value):
        raise serializers.ValidationError('Use 3 to 30 letters, numbers, dots or underscores.')
    return value


class UsernameField(serializers.CharField):
    def to_internal_value(self, data):
        return clean_username(super().to_internal_value(data))


class SessionRequestSerializer(serializers.Serializer):
    """What sign-in and registration share. `transport` says how the session reaches the client: a browser asks for
    `cookie` (HttpOnly cookie, no token in the body); scripts and tools take the default `token` (bearer)."""

    transport = serializers.ChoiceField(choices=['token', 'cookie'], default='token')


class RegisterSerializer(SessionRequestSerializer):
    email = EmailField(max_length=MAX_EMAIL)
    username = UsernameField(max_length=60, required=False)
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    def validate(self, attrs):
        try:
            attrs['password'] = checked_password(attrs['password'], User(username=attrs['email'], email=attrs['email']))
        except serializers.ValidationError as e:
            raise serializers.ValidationError({'password': e.detail})
        return attrs


class LoginSerializer(SessionRequestSerializer):
    """Signs in with a username (the usual way) or, for older clients, an email address."""

    username = serializers.CharField(max_length=MAX_EMAIL, required=False)
    email = serializers.CharField(max_length=MAX_EMAIL, required=False)
    password = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate(self, attrs):
        identifier = (attrs.get('username') or attrs.get('email') or '').strip().lower()
        if not identifier:
            raise serializers.ValidationError({'username': 'Enter your username.'})
        attrs['identifier'] = identifier
        return attrs


class EmailChangeSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    email = EmailField(max_length=MAX_EMAIL)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class AccountDeleteSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    confirmation = serializers.CharField(max_length=20, trim_whitespace=False)


class ProfileSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user_id', read_only=True)
    display_name = serializers.CharField(max_length=60, allow_null=True, required=False, allow_blank=False)
    username = UsernameField(max_length=60, required=False)
    avatar_version = serializers.SerializerMethodField()
    interests = serializers.ListField(child=serializers.CharField(max_length=60), required=False, max_length=10)

    class Meta:
        model = Profile
        fields = ['id', 'username', 'display_name', 'avatar_version', 'timezone', 'interests', 'profile_visibility', 'progress_visibility', 'created_at']
        read_only_fields = ['created_at']

    def get_avatar_version(self, profile):
        """Changes whenever the picture does (so browsers fetch the new one); null when there is no picture."""
        return int(profile.avatar_updated_at.timestamp()) if profile.avatar_updated_at else None

    def validate_username(self, value):
        taken = Profile.objects.filter(username=value)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError('That username is taken. Try another.')
        return value

    def validate_display_name(self, value):
        if value is None:
            return None
        value = value.strip()
        if not 1 <= len(value) <= 60:
            raise serializers.ValidationError('Keep your name between 1 and 60 characters.')
        return value

    def validate_timezone(self, value):
        if value not in valid_timezones():
            raise serializers.ValidationError('That timezone isn’t recognised.')
        return value

    def validate_interests(self, value):
        if len(','.join(value)) > 400:
            raise serializers.ValidationError('Too many interests.')
        return value
