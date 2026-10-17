from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Profile, valid_timezones

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


class RegisterSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL)
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    def validate(self, attrs):
        try:
            attrs['password'] = checked_password(attrs['password'], User(username=attrs['email'], email=attrs['email']))
        except serializers.ValidationError as e:
            raise serializers.ValidationError({'password': e.detail})
        return attrs


class LoginSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class ProfileSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user_id', read_only=True)
    display_name = serializers.CharField(max_length=60, allow_null=True, required=False, allow_blank=False)
    interests = serializers.ListField(child=serializers.CharField(max_length=60), required=False, max_length=10)

    class Meta:
        model = Profile
        fields = ['id', 'display_name', 'timezone', 'interests', 'profile_visibility', 'progress_visibility', 'created_at']
        read_only_fields = ['created_at']

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
