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


class UserBadge(models.Model):
    """A streak badge a person has earned (kept for good, even if the streak later breaks)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='badges')
    code = models.CharField(max_length=20)  # e.g. 'streak-15'
    earned_on = models.DateField()  # the day the streak reached the badge's length
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'code'], name='one_badge_per_code')]
