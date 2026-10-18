import logging

from django.db import connection
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .security_log import log_event


class HealthView(APIView):
    """For uptime monitors and load balancers: 200 when the database answers, 503 when it does not.

    Deliberately says nothing else (no versions, paths or error text): it is public."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
                cursor.fetchone()
        except Exception:  # noqa: BLE001 - any failure means "not healthy"; the cause goes to the log, not the caller
            logging.getLogger('arcloop.health').exception('health check: database did not answer')
            return Response({'status': 'error'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'status': 'ok'})


class CspReportParser(JSONParser):
    media_type = 'application/csp-report'


class ReportsParser(JSONParser):
    media_type = 'application/reports+json'


class CspReportView(APIView):
    """Receives Content-Security-Policy violation reports from browsers (`report-uri`).

    Public by necessity (browsers send no credentials), so it is rate limited, accepts only a small body, and logs only a
    few short, sanitised fields: the directive, the kind of blocked resource and the path of the page. No query strings
    (they can hold reset tokens), no sample text, no headers."""

    permission_classes = [AllowAny]
    authentication_classes = []
    parser_classes = [CspReportParser, ReportsParser, JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'csp'
    MAX_BYTES = 10_000

    @staticmethod
    def _short(value, limit=120):
        text = str(value or '')
        return text.split('?')[0].split('#')[0][:limit].replace('\n', ' ').replace('\r', ' ')

    def post(self, request):
        if int(request.META.get('CONTENT_LENGTH') or 0) > self.MAX_BYTES:
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        body = request.data
        report = body.get('csp-report', body) if isinstance(body, dict) else {}
        if isinstance(body, list) and body and isinstance(body[0], dict):
            report = body[0].get('body', {})
        if not isinstance(report, dict):
            report = {}
        log_event(
            request,
            'csp_violation',
            logging.WARNING,
            directive=self._short(report.get('effective-directive') or report.get('violated-directive') or report.get('effectiveDirective'), 60),
            blocked=self._short(report.get('blocked-uri') or report.get('blockedURL'), 80),
            page=self._short(report.get('document-uri') or report.get('documentURL'), 120),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
