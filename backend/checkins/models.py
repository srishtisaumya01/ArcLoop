from django.conf import settings
from django.db import models


class DayCheckin(models.Model):
    """One row per person per day they used check-in. A day counts towards the streak only when they also checked out."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='day_checkins')
    date = models.DateField()  # the day in the person's own timezone
    checked_in_at = models.DateTimeField()
    checked_out_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'date'], name='one_checkin_per_day')]


class ReminderEmailLog(models.Model):
    """Which reminder emails went out, so each person gets each one at most once a day however often the job runs."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reminder_emails')
    date = models.DateField()  # the day in the person's own timezone
    slot = models.CharField(max_length=10)  # 'evening' (5 pm) or 'night' (10 pm)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'date', 'slot'], name='one_reminder_email_per_slot')]
