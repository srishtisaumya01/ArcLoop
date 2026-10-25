"""The password-reset code email: the same look as the streak reminders (brand header with the logo, a clear card, one focus)."""
from html import escape

from django.conf import settings


def reset_code_email(user, code):
    """(subject, text, html) for the six-digit reset code."""
    base = settings.FRONTEND_URL
    profile = user.profile
    name = (profile.display_name or profile.username or user.email.split('@')[0]).split()[0].capitalize()
    subject = f'{code} is your Arcloop code'
    text = (
        f'Hi {name},\n\nYour Arcloop password reset code is {code}.\n'
        'It works for 10 minutes. Enter it on the reset page to choose a new password.\n\n'
        'If you did not ask for this, ignore this email: your password stays the same.\n'
        'Please do not share this code with anyone. Arcloop will never ask for it.\n'
    )
    digits = ''.join(
        f'<td style="padding:0 4px"><div style="width:44px;height:56px;border-radius:12px;background:#FFFFFF;border:2px solid #C9D8EE;'
        f'font:800 28px/56px Arial,Helvetica,sans-serif;color:#0A1F66;text-align:center">{escape(d)}</div></td>'
        for d in code
    )
    html = f"""<!doctype html><html><body style="margin:0;padding:0;background:#EEF3FA">
<div style="display:none;max-height:0;overflow:hidden;color:#EEF3FA">Your code is {escape(code)}. It works for 10 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FA"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 28px rgba(10,31,102,.12)">
 <tr><td style="background:#0F2F86;background-image:linear-gradient(115deg,#0A1F66 0%,#0F2F86 40%,#17698F 75%,#2ED68B 100%);padding:28px 32px">
  <img src="{base}/email-logo.png" width="150" alt="Arcloop" style="display:block;border:0;height:auto">
 </td></tr>
 <tr><td style="padding:32px 32px 8px">
  <p style="margin:0 0 6px;font:700 13px/1 Arial,Helvetica,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#17698F">Password reset</p>
  <h1 style="margin:0 0 12px;font:800 26px/1.2 Arial,Helvetica,sans-serif;color:#0B1B3A">Hi {escape(name)}, here is your code.</h1>
  <p style="margin:0;font:16px/1.55 Arial,Helvetica,sans-serif;color:#44546F">Enter this 6-digit code on the reset page to choose a new password.</p>
 </td></tr>
 <tr><td align="center" style="padding:24px 32px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="background:#F2F7FF;border-radius:18px"><tr><td style="padding:22px 18px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr>{digits}</tr></table>
  </td></tr></table>
  <p style="margin:14px 0 0;font:600 14px/1.4 Arial,Helvetica,sans-serif;color:#5B6B85">This code works for 10 minutes.</p>
 </td></tr>
 <tr><td style="padding:20px 32px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7E8;border-radius:14px"><tr>
   <td style="padding:14px 18px;font:14px/1.5 Arial,Helvetica,sans-serif;color:#7A4B00"><strong>Keep it to yourself.</strong> Arcloop will never ask you for this code. If you did not ask to reset your password, ignore this email: nothing changes.</td>
  </tr></table>
 </td></tr>
 <tr><td style="padding:0 32px 26px;text-align:center;font:italic 14px/1.5 Arial,Helvetica,sans-serif;color:#5B6B85">Consistency over perfection.</td></tr>
 <tr><td style="background:#F5F8FC;padding:18px 32px;text-align:center;font:12px/1.6 Arial,Helvetica,sans-serif;color:#7A8AA5">
  You are getting this because someone asked to reset the password for your Arcloop account.<br>Please do not reply to this email.
 </td></tr>
</table></td></tr></table></body></html>"""
    return subject, text, html


def welcome_email(user):
    """(subject, text, html) sent once, when an account is created."""
    base = settings.FRONTEND_URL
    profile = user.profile
    name = (profile.display_name or profile.username or user.email.split('@')[0]).split()[0].capitalize()
    go = f'{base}/app/challenges'
    subject = f'Welcome to Arcloop, {name}! Your first challenge is waiting'
    steps = [
        ('1', 'Pick a challenge', 'Join Winter Arc 90, a 7-day sprint, a DSA challenge, or create one of your own.'),
        ('2', 'Show up each day', 'Mark attendance in just one challenge and your day counts. No perfection needed.'),
        ('3', 'Build your streak', 'Reach 15, 30, 50, 75 and 100 days to unlock badges you can share.'),
        ('4', 'Bring your people', 'Start a challenge with friends and keep each other going.'),
    ]
    text = (
        f'Hi {name},\n\nWelcome to Arcloop! We are so glad you are here.\n\n'
        + '\n'.join(f'{n}. {title}: {body}' for n, title, body in steps)
        + f'\n\nJoin your first challenge: {go}\n\nConsistency over perfection. See you inside.\nThe Arcloop team\n'
    )
    rows = ''.join(
        f'<tr><td width="44" valign="top" style="padding:10px 0"><div style="width:32px;height:32px;border-radius:16px;background:#0F2F86;background-image:linear-gradient(135deg,#0F2F86,#17698F);'
        f'color:#FFFFFF;font:800 15px/32px Arial,Helvetica,sans-serif;text-align:center">{n}</div></td>'
        f'<td style="padding:10px 0"><div style="font:700 16px/1.3 Arial,Helvetica,sans-serif;color:#0B1B3A">{escape(title)}</div>'
        f'<div style="font:15px/1.5 Arial,Helvetica,sans-serif;color:#44546F">{escape(body)}</div></td></tr>'
        for n, title, body in steps
    )
    html = f"""<!doctype html><html><body style="margin:0;padding:0;background:#EEF3FA">
<div style="display:none;max-height:0;overflow:hidden;color:#EEF3FA">Your first challenge is waiting. Pick one and start your streak today.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FA"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 28px rgba(10,31,102,.12)">
 <tr><td style="background:#0F2F86;background-image:linear-gradient(115deg,#0A1F66 0%,#0F2F86 40%,#17698F 75%,#2ED68B 100%);padding:28px 32px">
  <img src="{base}/email-logo.png" width="150" alt="Arcloop" style="display:block;border:0;height:auto">
 </td></tr>
 <tr><td style="padding:34px 32px 8px">
  <p style="margin:0 0 6px;font:700 13px/1 Arial,Helvetica,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#17698F">Welcome aboard</p>
  <h1 style="margin:0 0 12px;font:800 28px/1.2 Arial,Helvetica,sans-serif;color:#0B1B3A">Hi {escape(name)}, your journey starts today.</h1>
  <p style="margin:0;font:16px/1.6 Arial,Helvetica,sans-serif;color:#44546F">We are so glad you joined Arcloop. Small habits, shown up for every day, change a life. Here is how to make the most of it:</p>
 </td></tr>
 <tr><td style="padding:14px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table></td></tr>
 <tr><td align="center" style="padding:26px 32px 10px">
  <a href="{go}" style="display:inline-block;background:#0A1F66;background-image:linear-gradient(115deg,#0A1F66,#17698F);color:#FFFFFF;text-decoration:none;font:700 17px/1 Arial,Helvetica,sans-serif;padding:17px 36px;border-radius:999px">Join your first challenge</a>
 </td></tr>
 <tr><td style="padding:14px 32px 28px;text-align:center;font:italic 15px/1.5 Arial,Helvetica,sans-serif;color:#5B6B85">Consistency over perfection. See you inside.</td></tr>
 <tr><td style="background:#F5F8FC;padding:18px 32px;text-align:center;font:12px/1.6 Arial,Helvetica,sans-serif;color:#7A8AA5">
  You are getting this one-time email because you created an Arcloop account.<br>Please do not reply to this email.
 </td></tr>
</table></td></tr></table></body></html>"""
    return subject, text, html
