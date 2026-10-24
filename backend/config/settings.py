"""Arcloop API settings.

Everything environment-specific comes from environment variables (optionally a git-ignored
``backend/.env``; see ``backend/.env.example``). Nothing secret is stored in this file.
"""
import os
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path):
    """Minimal KEY=VALUE reader so local setup needs no extra package. Real environment wins."""
    if not path.is_file():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BASE_DIR / '.env')


def _flag(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in {'1', 'true', 'yes', 'on'}


def _list(name, default=''):
    return [item.strip() for item in os.environ.get(name, default).split(',') if item.strip()]


DEBUG = _flag('DJANGO_DEBUG', False)

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('Set DJANGO_SECRET_KEY (or DJANGO_DEBUG=true for local development only).')
    # Local development only: never used when DEBUG is off, and tokens/reset links signed with it are worthless elsewhere.
    SECRET_KEY = 'insecure-local-development-key-do-not-use-anywhere-else'

ALLOWED_HOSTS = _list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1' if DEBUG else '')
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured('Set DJANGO_ALLOWED_HOSTS (comma-separated host names) when DJANGO_DEBUG is off.')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'accounts',
    'planner',
    'reminders',
    'challenges',
    'checkins',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'config.middleware.ApiSecurityHeadersMiddleware',
]

# Test-only clock header (see config/middleware.py). It can only be switched on in debug mode.
if _flag('ARCLOOP_TEST_CLOCK', False):
    if not DEBUG:
        raise ImproperlyConfigured('ARCLOOP_TEST_CLOCK requires DJANGO_DEBUG=true and must never be set in production.')
    MIDDLEWARE.append('config.middleware.TestClockMiddleware')
    # The same test-only server also uses a fast password hasher: its tests create hundreds of accounts.
    PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

def _postgres_from_url(url):
    parsed = urlsplit(url)
    if parsed.scheme not in {'postgres', 'postgresql'}:
        raise ImproperlyConfigured('DATABASE_URL must be a postgres:// or postgresql:// URL.')
    pooled = '-pooler.' in (parsed.hostname or '')
    return {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': unquote(parsed.path.lstrip('/')),
        'USER': unquote(parsed.username or ''),
        'PASSWORD': unquote(parsed.password or ''),
        'HOST': parsed.hostname or '',
        'PORT': str(parsed.port or ''),
        'OPTIONS': dict(parse_qsl(parsed.query)),
        # Neon's pooler runs PgBouncer in transaction mode: no persistent connections or server-side cursors.
        'CONN_MAX_AGE': 0 if pooled else 60,
        'CONN_HEALTH_CHECKS': not pooled,
        'DISABLE_SERVER_SIDE_CURSORS': pooled,
    }


DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()

DATABASES = {
    'default': _postgres_from_url(DATABASE_URL) if DATABASE_URL else {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.environ.get('DJANGO_DB_PATH', str(BASE_DIR / 'db.sqlite3')),
        'OPTIONS': {
            'timeout': 20,
            # SQLite allows one writer at a time. IMMEDIATE takes the write lock when a transaction starts, so two
            # simultaneous requests queue (up to `timeout`) instead of failing with "database is locked"; WAL lets
            # readers continue while one writer works. (WAL keeps -wal and -shm files beside the database; back up with
            # `sqlite3 .backup`, see docs/DEPLOYMENT.md.)
            'transaction_mode': 'IMMEDIATE',
            'init_command': 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;',
        },
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- API ---------------------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['accounts.authentication.TokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_PARSER_CLASSES': ['rest_framework.parsers.JSONParser'],
    'EXCEPTION_HANDLER': 'config.errors.api_exception_handler',
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {'auth': os.environ.get('DJANGO_AUTH_THROTTLE', '30/min'), 'csp': os.environ.get('DJANGO_CSP_REPORT_THROTTLE', '60/min')},
    'UNAUTHENTICATED_USER': None,
    # Client address for rate limiting and the security log (config/security_log.py): 0 = the connection's own address, so a
    # client-supplied X-Forwarded-For is ignored. Set to 1 below when exactly one trusted proxy sits in front.
    'NUM_PROXIES': 0,
}

# Opaque session tokens: stored hashed, expire, and can be revoked on logout or password change. Browsers carry theirs in an
# HttpOnly cookie, other clients as a bearer header (config/auth_cookies.py, accounts/authentication.py).
AUTH_TOKEN_LIFETIME_DAYS = int(os.environ.get('DJANGO_TOKEN_LIFETIME_DAYS', '7'))  # fixed from sign-in, no renewal; the cookie's Max-Age and the CSRF cookie follow it
AUTH_COOKIE_NAME = 'arcloop_session'
AUTH_COOKIE_PATH = '/api/'  # sent only to the API, never with page or asset requests
AUTH_COOKIE_SAMESITE = 'Strict'  # the API is only ever called by the app's own pages, so cross-site requests carry no cookie
AUTH_COOKIE_SECURE = not DEBUG  # HTTPS only in production; plain HTTP is allowed only for local development
# CSRF for cookie-authenticated writes: Django's own check. The cookie is readable by the page (it must echo it in a header).
CSRF_COOKIE_NAME = 'arcloop_csrf'
CSRF_COOKIE_PATH = '/'  # the page (any path) has to read it
CSRF_COOKIE_SAMESITE = 'Strict'
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_AGE = AUTH_TOKEN_LIFETIME_DAYS * 24 * 3600
# Links in password-reset emails point at the frontend.
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173' if DEBUG else '').rstrip('/')
if not DEBUG and not FRONTEND_URL.startswith('https://'):
    raise ImproperlyConfigured('Set FRONTEND_URL to the https:// address of the app (it is used in password-reset links).')

# The app and the API are ONE origin (`/api/` is routed to Django by the web server, and by the Vite proxy in development), so
# browsers make no cross-origin API calls and nothing is allowed by default. Cookie sessions are same-origin only:
# credentialed cross-origin requests are never allowed. List origins here only for a non-browser client that reads the API
# from a browser page with a bearer token (no cookies are involved for it).
CORS_ALLOWED_ORIGINS = _list('CORS_ALLOWED_ORIGINS')
CORS_ALLOW_CREDENTIALS = False

# Only the Django admin uses cookies and CSRF; API calls are bearer-token calls. List the admin's https origin here if the
# admin is served from a different origin than the API itself.
CSRF_TRUSTED_ORIGINS = _list('DJANGO_CSRF_TRUSTED_ORIGINS')

# A password-reset link stops working after this many seconds (Django's default is three days; an hour is enough).
PASSWORD_RESET_TIMEOUT = int(os.environ.get('DJANGO_PASSWORD_RESET_TIMEOUT', '3600'))

# Email (password-reset links). Nothing is ever sent unless SMTP is configured on purpose:
#   development (DEBUG)  -> printed to the server console
#   DJANGO_EMAIL_BACKEND -> may be set to the file backend (with DJANGO_EMAIL_FILE_PATH) for automated tests
#   production           -> SMTP, configured only through the variables below. Credentials come from the
#                           environment; they are never in the code or logged.
EMAIL_BACKEND = os.environ.get(
    'DJANGO_EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend',
)
EMAIL_FILE_PATH = os.environ.get('DJANGO_EMAIL_FILE_PATH', str(BASE_DIR / 'sent_emails'))
EMAIL_HOST = os.environ.get('DJANGO_EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.environ.get('DJANGO_EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('DJANGO_EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('DJANGO_EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = _flag('DJANGO_EMAIL_USE_TLS', True)
EMAIL_USE_SSL = _flag('DJANGO_EMAIL_USE_SSL', False)
EMAIL_TIMEOUT = 10
BREVO_API_KEY = os.environ.get('DJANGO_BREVO_API_KEY', '')  # used only with config.email_backends.BrevoEmailBackend (email over HTTPS)
DEFAULT_FROM_EMAIL = os.environ.get('DJANGO_FROM_EMAIL', 'Arcloop <no-reply@localhost>')
# Streak reminder emails (5 pm / 10 pm, each person's own clock). People who never changed the default timezone (UTC) are
# reminded on this one. CRON_SECRET lets the scheduler call /api/v1/cron/streak-reminders/ (unset: that endpoint does not exist).
REMINDER_DEFAULT_TIMEZONE = os.environ.get('DJANGO_REMINDER_DEFAULT_TIMEZONE', 'Asia/Kolkata')
CRON_SECRET = os.environ.get('DJANGO_CRON_SECRET', '')

if not DEBUG and EMAIL_BACKEND.endswith('smtp.EmailBackend') and EMAIL_HOST in ('', 'localhost'):
    # A production server with no mail host would fail on the first reset request; say so at start-up.
    import warnings

    warnings.warn('DJANGO_EMAIL_HOST is not set: password-reset emails cannot be delivered.', stacklevel=1)

if not DEBUG:
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = _flag('DJANGO_SECURE_SSL_REDIRECT', True)
    # HSTS tells browsers to use HTTPS only. Off (0) until HTTPS is confirmed to work everywhere, then raise it
    # (e.g. 31536000); it cannot be undone quickly once browsers have cached it.
    SECURE_HSTS_SECONDS = int(os.environ.get('DJANGO_HSTS_SECONDS', '0'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = _flag('DJANGO_HSTS_INCLUDE_SUBDOMAINS', False)
    # Behind a TLS-terminating proxy (nginx, a platform router) that sets X-Forwarded-Proto, so redirects and secure
    # cookies see the real scheme. Only enable when such a proxy is actually in front: a client could forge the header.
    if _flag('DJANGO_BEHIND_PROXY', False):
        SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
        REST_FRAMEWORK['NUM_PROXIES'] = 1  # the proxy's X-Forwarded-For (it must overwrite, not append: deploy/nginx.example.conf)

# Logging: everything to the process output (the process manager or platform keeps it). `arcloop.security` carries the
# security events (failed sign-ins, rate limiting, resets, deletions, CSP reports); no secrets or addresses in it.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '%(asctime)s %(levelname)s %(name)s %(message)s'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'}},
    'root': {'handlers': ['console'], 'level': os.environ.get('DJANGO_LOG_LEVEL', 'INFO')},
    'loggers': {'django.request': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False}},
}

# `manage.py test` only: a fast password hasher, so the suite is not dominated by PBKDF2. Never active otherwise.
import sys  # noqa: E402

if len(sys.argv) > 1 and sys.argv[1] == 'test':
    PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
