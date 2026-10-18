"""Security events for the operator: who is failing to sign in, being rate limited, resetting or deleting accounts.

One logger (`arcloop.security`), one line per event, key=value. Never logs passwords, tokens, reset links or email
addresses. The client address is REMOTE_ADDR: behind a proxy that is the proxy's address, so a real deployment must
make the proxy's forwarded address available to the log (see docs/DEPLOYMENT.md) before using it to find abusers.
"""
import logging

logger = logging.getLogger('arcloop.security')


def client_ip(request):
    return request.META.get('REMOTE_ADDR', '-') if request is not None else '-'


def log_event(request, event, level=logging.INFO, **fields):
    extra = ' '.join(f'{key}={value}' for key, value in fields.items() if value is not None)
    logger.log(level, 'event=%s ip=%s %s', event, client_ip(request), extra)
