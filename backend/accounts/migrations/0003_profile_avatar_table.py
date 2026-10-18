import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def move_avatars(apps, schema_editor):
    Profile = apps.get_model('accounts', 'Profile')
    ProfileAvatar = apps.get_model('accounts', 'ProfileAvatar')
    for profile in Profile.objects.exclude(avatar__isnull=True):
        ProfileAvatar.objects.create(user_id=profile.pk, data=profile.avatar, content_type=profile.avatar_type or 'image/jpeg')


class Migration(migrations.Migration):
    dependencies = [('accounts', '0002_profile_username_avatar')]

    operations = [
        migrations.CreateModel(
            name='ProfileAvatar',
            fields=[
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='avatar_image', serialize=False, to=settings.AUTH_USER_MODEL)),
                ('data', models.BinaryField()),
                ('content_type', models.CharField(max_length=20)),
            ],
        ),
        migrations.RunPython(move_avatars, migrations.RunPython.noop),
        migrations.RemoveField(model_name='profile', name='avatar'),
        migrations.RemoveField(model_name='profile', name='avatar_type'),
    ]
