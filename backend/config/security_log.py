"""Security events for the operator: who is failing to sign in, being rate limited, resetting or deleting accounts.

One logger (`arcloop.security`), one line per event, key=value. Never logs passwords, tokens, reset links or email
addresses. The client address is the one rate limiting uses (REST_FRAMEWORK NUM_PROXIES): the connection's own address,
or the proxy-supplied one when DJANGO_BEHIND_PROXY is set (see docs/DEPLOYMENT.md).
"""
import logging

from rest_framework.throttling import BaseThrottle

logger = logging.getLogger('arcloop.security')


def client_ip(request):
    return BaseThrottle().get_ident(request) or '-' if request is not None else '-'


def log_event(request, event, level=logging.INFO, **fields):
    extra = ' '.join(f'{key}={value}' for key, value in fields.items() if value is not None)
    logger.log(level, 'event=%s ip=%s %s', event, client_ip(request), extra)
