"""One error shape for the whole API: {"error": {"code", "message", "fields"?}}.

Codes are stable strings the client maps to its own categories; messages are written for people and
never contain SQL, stack traces or internals.
"""
import logging

from .auth_cookies import clear_session_cookies, session_cookie_value
from .security_log import log_event

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response

logger = logging.getLogger(__name__)


class ApiError(exceptions.APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'validation_error'
    default_detail = 'That is not allowed.'

    def __init__(self, code=None, message=None, status_code=None, fields=None):
        super().__init__(message or self.default_detail, code or self.default_code)
        if status_code is not None:
            self.status_code = status_code
        self.fields = fields


def validation_error(message, fields=None, code='validation_error'):
    return ApiError(code, message, status.HTTP_400_BAD_REQUEST, fields)


def constraint_violation(message='That change is not allowed by the planner rules.', fields=None):
    return ApiError('constraint_violation', message, status.HTTP_400_BAD_REQUEST, fields)


def date_rule(message):
    return ApiError('date_rule', message, status.HTTP_400_BAD_REQUEST)


def limit_reached(message):
    return ApiError('limit_reached', message, status.HTTP_400_BAD_REQUEST)


def conflict(message='That already exists.'):
    return ApiError('conflict', message, status.HTTP_409_CONFLICT)


def permission_denied(message='You do not have permission to do that.'):
    return ApiError('permission_denied', message, status.HTTP_403_FORBIDDEN)


def not_found(message='That could not be found.'):
    return ApiError('not_found', message, status.HTTP_404_NOT_FOUND)


def _flatten(detail):
    """DRF serializer errors -> {field: first message}."""
    if isinstance(detail, dict):
        out = {}
        for key, value in detail.items():
            while isinstance(value, (list, tuple)) and value:
                value = value[0]
            out[key] = _flatten(value) if isinstance(value, dict) else str(value)
        return out
    return None


def api_exception_handler(exc, context):
    if isinstance(exc, ApiError):
        body = {'code': exc.get_codes(), 'message': str(exc.detail)}
        if exc.fields:
            body['fields'] = exc.fields
        return Response({'error': body}, status=exc.status_code)
    if isinstance(exc, exceptions.ValidationError):
        fields = _flatten(exc.detail)
        message = 'Please check the highlighted details.' if fields else str(exc.detail[0] if isinstance(exc.detail, list) else exc.detail)
        body = {'code': 'validation_error', 'message': message}
        if fields:
            body['fields'] = fields
        return Response({'error': body}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, (exceptions.AuthenticationFailed, exceptions.NotAuthenticated)):
        response = Response({'error': {'code': 'unauthenticated', 'message': 'Please log in again to continue.'}}, status=status.HTTP_401_UNAUTHORIZED)
        request = context.get('request')
        if request is not None and session_cookie_value(request):
            clear_session_cookies(response)  # the server no longer accepts this cookie: do not keep sending it
        return response
    if isinstance(exc, (exceptions.PermissionDenied, PermissionDenied)):
        return Response({'error': {'code': 'permission_denied', 'message': 'You do not have permission to do that.'}}, status=status.HTTP_403_FORBIDDEN)
    if isinstance(exc, (exceptions.NotFound, Http404)):
        return Response({'error': {'code': 'not_found', 'message': 'That could not be found.'}}, status=status.HTTP_404_NOT_FOUND)
    if isinstance(exc, exceptions.Throttled):
        log_event(context.get('request'), 'rate_limited', logging.WARNING, path=getattr(context.get('request'), 'path', None))
        return Response({'error': {'code': 'rate_limited', 'message': 'Too many attempts. Please wait a moment and try again.'}}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    if isinstance(exc, exceptions.MethodNotAllowed):
        return Response({'error': {'code': 'method_not_allowed', 'message': 'That is not supported.'}}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
    if isinstance(exc, exceptions.ParseError):
        return Response({'error': {'code': 'validation_error', 'message': 'The request could not be read.'}}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, exceptions.UnsupportedMediaType):
        return Response({'error': {'code': 'validation_error', 'message': 'Send JSON.'}}, status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
    logger.exception('Unhandled API error', exc_info=exc)
    return Response({'error': {'code': 'server_error', 'message': 'Something went wrong. Please try again.'}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
