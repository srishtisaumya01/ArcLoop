"""Arcloop API settings.

Everything environment-specific comes from environment variables (optionally a git-ignored
``backend/.env``; see ``backend/.env.example``). Nothing secret is stored in this file.
"""
import os
from pathlib import Path

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

DATABASES = {
    'default': {
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
    'DEFAULT_AUTHENTICATION_CLASSES': ['accounts.authentication.BearerTokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_PARSER_CLASSES': ['rest_framework.parsers.JSONParser'],
    'EXCEPTION_HANDLER': 'config.errors.api_exception_handler',
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {'auth': os.environ.get('DJANGO_AUTH_THROTTLE', '30/min')},
    'UNAUTHENTICATED_USER': None,
}

# Opaque bearer tokens: stored hashed, expire, and can be revoked on logout or password change.
AUTH_TOKEN_LIFETIME_DAYS = int(os.environ.get('DJANGO_TOKEN_LIFETIME_DAYS', '30'))
# Links in password-reset emails point at the frontend.
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173').rstrip('/')

# Tokens travel in an Authorization header, never in cookies, so CORS needs no credentials.
CORS_ALLOWED_ORIGINS = _list('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173' if DEBUG else '')
CORS_ALLOW_CREDENTIALS = False

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
DEFAULT_FROM_EMAIL = os.environ.get('DJANGO_FROM_EMAIL', 'Arcloop <no-reply@localhost>')

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

# `manage.py test` only: a fast password hasher, so the suite is not dominated by PBKDF2. Never active otherwise.
import sys  # noqa: E402

if len(sys.argv) > 1 and sys.argv[1] == 'test':
    PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
