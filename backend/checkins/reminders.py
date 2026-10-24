"""Streak reminder emails: a friendly note at 5 pm and a last call at 10 pm (each person's own clock) to anyone who is in a
running challenge and has not marked attendance today. Safe to run as often as you like: each person gets each one once a day."""
import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from html import escape
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

from challenges.models import Enrollment

from .models import ReminderEmailLog
from .services import done_dates
from .streaks import streaks

log = logging.getLogger(__name__)
User = get_user_model()
SLOTS = {17: 'evening', 22: 'night'}  # local hour -> slot
UNSUB_SALT = 'arcloop.unsubscribe'


def unsubscribe_token(user):
    return signing.dumps({'u': user.pk}, salt=UNSUB_SALT)


def user_from_unsubscribe_token(token):
    try:
        data = signing.loads(token, salt=UNSUB_SALT, max_age=60 * 60 * 24 * 365)
        return User.objects.filter(pk=data['u']).first()
    except signing.BadSignature:
        return None


def zone_for(user):
    name = user.profile.timezone
    if name == 'UTC':  # the untouched default: most people here are in India, so remind them on Indian time
        name = settings.REMINDER_DEFAULT_TIMEZONE
    try:
        return ZoneInfo(name)
    except Exception:  # noqa: BLE001
        return ZoneInfo('UTC')


def first_name(user):
    profile = user.profile
    return (profile.display_name or profile.username or user.email.split('@')[0]).split()[0].capitalize()


def render(user, slot, streak, challenges, hours_left):
    """(subject, text, html) for one reminder."""
    name = first_name(user)
    base = settings.FRONTEND_URL
    open_url = f'{base}/app/challenges'
    unsub = f"{base}/api/v1/email/unsubscribe/?t={unsubscribe_token(user)}"
    night = slot == 'night'
    if streak > 0:
        headline = f'Your {streak}-day streak ends tonight' if night else f'Keep your {streak}-day streak going'
    else:
        headline = 'One tick keeps you in the game' if night else 'A small step today starts a streak'
    subject = f'Last call, {name}: {headline.lower()}' if night else f'Hey {name}, {headline[0].lower() + headline[1:]}'
    if night:
        lead = f'About {hours_left} hours left in your day. Marking attendance in just one challenge is enough to keep your streak alive.'
    else:
        lead = 'You have not marked attendance today. It takes ten seconds, and one challenge is enough to keep your streak alive.'
    rows_text = '\n'.join(f'  - {c["title"]} (day {c["day"]} of {c["total"]})' for c in challenges)
    text = f'Hi {name},\n\n{headline}.\n{lead}\n\nYour challenges today:\n{rows_text}\n\nMark attendance: {open_url}\n\nPlease do not reply to this email.\nStop these reminders: {unsub}\n'
    rows_html = ''.join(
        f'<tr><td style="padding:12px 16px;border-top:1px solid #E3EAF4;font:600 15px/1.3 Arial,Helvetica,sans-serif;color:#0B1B3A">{escape(c["title"])}</td>'
        f'<td align="right" style="padding:12px 16px;border-top:1px solid #E3EAF4;font:14px/1.3 Arial,Helvetica,sans-serif;color:#5B6B85;white-space:nowrap">Day {c["day"]} of {c["total"]}</td></tr>'
        for c in challenges
    )
    accent = '#F59E0B' if not night else '#EF4444'
    badge = f'{streak}' if streak > 0 else '0'
    html = f"""<!doctype html><html><body style="margin:0;padding:0;background:#EEF3FA">
<div style="display:none;max-height:0;overflow:hidden;color:#EEF3FA">{escape(lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FA"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 28px rgba(10,31,102,.12)">
 <tr><td style="background:#0F2F86;background-image:linear-gradient(115deg,#0A1F66 0%,#0F2F86 40%,#17698F 75%,#2ED68B 100%);padding:28px 32px">
  <img src="{base}/email-logo.png" width="150" alt="Arcloop" style="display:block;border:0;height:auto">
 </td></tr>
 <tr><td style="padding:32px 32px 8px">
  <p style="margin:0 0 6px;font:700 13px/1 Arial,Helvetica,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:{accent}">{'Last call' if night else 'Friendly nudge'}</p>
  <h1 style="margin:0 0 12px;font:800 26px/1.2 Arial,Helvetica,sans-serif;color:#0B1B3A">Hi {escape(name)}, {escape(headline[0].lower() + headline[1:])}.</h1>
  <p style="margin:0;font:16px/1.55 Arial,Helvetica,sans-serif;color:#44546F">{escape(lead)}</p>
 </td></tr>
 <tr><td style="padding:20px 32px 4px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F5F8FC;border-radius:16px"><tr>
   <td width="84" align="center" style="padding:18px 0 18px 18px"><div style="width:64px;height:64px;border-radius:32px;background:{accent};color:#FFFFFF;font:800 28px/64px Arial,Helvetica,sans-serif;text-align:center">{badge}</div></td>
   <td style="padding:18px 20px;font:15px/1.45 Arial,Helvetica,sans-serif;color:#44546F"><strong style="color:#0B1B3A;font-size:17px">{'day streak' if streak != 1 else 'day streak'}</strong><br>{'Mark attendance today to keep it.' if streak > 0 else 'Mark attendance today to start one.'}</td>
  </tr></table>
 </td></tr>
 <tr><td style="padding:20px 32px 4px">
  <p style="margin:0 0 8px;font:700 13px/1 Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5B6B85">Your challenges today</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3EAF4;border-radius:14px;border-collapse:separate;overflow:hidden">{rows_html}</table>
 </td></tr>
 <tr><td align="center" style="padding:28px 32px 12px">
  <a href="{open_url}" style="display:inline-block;background:#0A1F66;background-image:linear-gradient(115deg,#0A1F66,#17698F);color:#FFFFFF;text-decoration:none;font:700 16px/1 Arial,Helvetica,sans-serif;padding:16px 34px;border-radius:999px">Mark attendance</a>
 </td></tr>
 <tr><td style="padding:12px 32px 28px;text-align:center;font:italic 14px/1.5 Arial,Helvetica,sans-serif;color:#5B6B85">Consistency over perfection. See you inside.</td></tr>
 <tr><td style="background:#F5F8FC;padding:18px 32px;text-align:center;font:12px/1.6 Arial,Helvetica,sans-serif;color:#7A8AA5">
  You are getting this because you are in a running challenge on Arcloop and have not marked attendance today.<br>
  <a href="{unsub}" style="color:#5B6B85">Stop these reminders</a>
 </td></tr>
</table></td></tr></table></body></html>"""
    return subject, text, html


def due_slot(now_local):
    return SLOTS.get(now_local.hour)


def send_reminders(now=None, only_slot=None, dry_run=False, only_email=None):
    """Sends whatever is due right now. Returns a short summary dict."""
    now = now or timezone.now()
    summary = {'checked': 0, 'sent': 0, 'skipped_marked': 0, 'failed': 0}
    window = now.astimezone(dt_timezone.utc).date()
    ids = (
        Enrollment.objects.filter(end_date__gte=window - timedelta(days=1), start_date__lte=window + timedelta(days=1))
        .values_list('user_id', flat=True)
        .distinct()
    )
    users = User.objects.filter(pk__in=ids, is_active=True, profile__email_reminders=True).select_related('profile')
    if only_email:
        users = users.filter(username__iexact=only_email)
    for user in users:
        local = now.astimezone(zone_for(user))
        slot = only_slot or due_slot(local)
        if slot is None:
            continue
        summary['checked'] += 1
        today = local.date()
        if ReminderEmailLog.objects.filter(user=user, date=today, slot=slot).exists() and not only_email:
            continue
        done, marked = done_dates(user, today)
        if today in marked:
            summary['skipped_marked'] += 1
            continue
        live = [e for e in Enrollment.objects.filter(user=user, start_date__lte=today, end_date__gte=today).select_related('challenge')]
        if not live:
            continue
        challenges = [{'title': e.challenge.title, 'day': (today - e.start_date).days + 1, 'total': (e.end_date - e.start_date).days + 1} for e in live]
        streak = streaks(done, today)[0]
        hours_left = max(1, round((datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=local.tzinfo) - local).total_seconds() / 3600))
        subject, text, html = render(user, slot, streak, challenges, hours_left)
        if dry_run:
            print(f'[dry-run] {user.email} {slot}: {subject}')
            summary['sent'] += 1
            continue
        try:
            message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [user.email])
            message.attach_alternative(html, 'text/html')
            message.send()
            ReminderEmailLog.objects.get_or_create(user=user, date=today, slot=slot)
            summary['sent'] += 1
        except Exception as error:  # noqa: BLE001 - one bad address must not stop the others
            summary['failed'] += 1
            log.error('reminder email failed: %s (user %s)', type(error).__name__, user.pk)
    ReminderEmailLog.objects.filter(date__lt=window - timedelta(days=14)).delete()  # keep the table small
    return summary
