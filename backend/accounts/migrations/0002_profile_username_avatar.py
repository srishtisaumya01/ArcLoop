import re

from django.db import migrations, models


def backfill_usernames(apps, schema_editor):
    """Gives every existing account a username made from the start of its email, unique and valid."""
    Profile = apps.get_model('accounts', 'Profile')
    taken = set(Profile.objects.exclude(username__isnull=True).values_list('username', flat=True))
    for profile in Profile.objects.select_related('user').filter(username__isnull=True).order_by('pk'):
        seed = (profile.user.email or profile.user.username).split('@')[0].lower()
        base = (re.sub(r'[^a-z0-9_.]', '', seed)[:24] or 'user').ljust(3, '0')
        candidate, n = base, 1
        while candidate in taken:
            n += 1
            candidate = f'{base[:26]}{n}'
        taken.add(candidate)
        profile.username = candidate
        profile.save(update_fields=['username'])


class Migration(migrations.Migration):
    dependencies = [('accounts', '0001_initial')]

    operations = [
        migrations.AddField(model_name='profile', name='username', field=models.CharField(blank=True, max_length=30, null=True, unique=True)),
        migrations.AddField(model_name='profile', name='avatar', field=models.BinaryField(blank=True, editable=False, null=True)),
        migrations.AddField(model_name='profile', name='avatar_type', field=models.CharField(blank=True, default='', max_length=20)),
        migrations.AddField(model_name='profile', name='avatar_updated_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.RunPython(backfill_usernames, migrations.RunPython.noop),
    ]
