"""Sending email over HTTPS instead of SMTP.

Many hosts (Render's and Railway's free and hobby plans among them) block outgoing SMTP ports, so a mail server such as Gmail
never answers. Brevo's web API goes out over ordinary HTTPS and works anywhere. Switch it on with
DJANGO_EMAIL_BACKEND=config.email_backends.BrevoEmailBackend and DJANGO_BREVO_API_KEY=<key>; nothing else changes
(DJANGO_FROM_EMAIL must be an address you verified as a sender in Brevo)."""
import json
import logging
import urllib.error
import urllib.request
from email.utils import parseaddr

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

log = logging.getLogger(__name__)
ENDPOINT = 'https://api.brevo.com/v3/smtp/email'


class BrevoEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages or []:
            try:
                self._send(message)
                sent += 1
            except Exception as error:  # noqa: BLE001 - the key and the recipient are never logged, only the kind of failure
                log.error('brevo send failed: %s', type(error).__name__)
                if not self.fail_silently:
                    raise
        return sent

    def _send(self, message):
        name, address = parseaddr(message.from_email or settings.DEFAULT_FROM_EMAIL)
        html = next((content for content, kind in getattr(message, 'alternatives', []) if kind == 'text/html'), None)
        payload = {
            'sender': {'name': name or 'Arcloop', 'email': address},
            'to': [{'email': recipient} for recipient in message.to],
            'subject': message.subject,
            'textContent': message.body,
        }
        if html:
            payload['htmlContent'] = html
        request = urllib.request.Request(
            ENDPOINT,
            data=json.dumps(payload).encode('utf-8'),
            headers={'api-key': settings.BREVO_API_KEY, 'content-type': 'application/json', 'accept': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - a fixed https address
            if response.status >= 300:
                raise urllib.error.HTTPError(ENDPOINT, response.status, 'brevo error', response.headers, None)


class GoogleScriptEmailBackend(BaseEmailBackend):
    """Sends through a tiny free Google Apps Script web app that belongs to the Gmail account the mail should come from.

    The server calls it over HTTPS (so no blocked SMTP port) with a shared secret; the script then sends with GmailApp, which
    is free for a normal Gmail account (about 100 emails a day). Set DJANGO_EMAIL_BACKEND=config.email_backends.GoogleScriptEmailBackend,
    DJANGO_MAIL_RELAY_URL (the web app address) and DJANGO_MAIL_RELAY_SECRET (the same secret stored in the script)."""

    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages or []:
            try:
                self._send(message)
                sent += 1
            except Exception as error:  # noqa: BLE001 - only the kind of failure is logged, never the secret or the address
                log.error('mail relay send failed: %s', type(error).__name__)
                if not self.fail_silently:
                    raise
        return sent

    def _send(self, message):
        html = next((content for content, kind in getattr(message, 'alternatives', []) if kind == 'text/html'), '')
        payload = {'secret': settings.MAIL_RELAY_SECRET, 'to': ','.join(message.to), 'subject': message.subject, 'text': message.body, 'html': html}
        request = urllib.request.Request(
            settings.MAIL_RELAY_URL,
            data=json.dumps(payload).encode('utf-8'),
            headers={'content-type': 'application/json'},
            method='POST',
        )
        # Apps Script answers a POST with a redirect to the result; urllib follows it (as a GET), which is what it expects.
        with urllib.request.urlopen(request, timeout=25) as response:  # noqa: S310 - https address from the environment
            if response.read(200).strip() != b'ok':
                raise RuntimeError('the mail relay did not accept the message')
