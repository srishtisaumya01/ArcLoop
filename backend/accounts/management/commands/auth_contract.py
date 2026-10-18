"""Prints, as JSON, the names the browser and the server must agree on for cookie sessions.

The frontend keeps its own copy of the cookie and header names (src/services/api/apiClient.js).
tests/integration/authContract.integration.test.js runs this and checks the two copies are the same, so a rename on
one side cannot silently break sign-in."""
import json

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Print the session and CSRF cookie names and the CSRF header the frontend must use, as JSON.'

    def handle(self, *args, **options):
        header = settings.CSRF_HEADER_NAME.removeprefix('HTTP_').replace('_', '-').title()  # HTTP_X_CSRFTOKEN -> X-Csrftoken
        self.stdout.write(json.dumps({'csrf_cookie': settings.CSRF_COOKIE_NAME, 'csrf_header': header.lower(), 'session_cookie': settings.AUTH_COOKIE_NAME}))
