import json
import uuid
from pathlib import Path

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_catalogue(apps, schema_editor):
    Challenge = apps.get_model('challenges', 'Challenge')
    for row in json.loads((Path(__file__).resolve().parent.parent / 'seed.json').read_text(encoding='utf-8')):
        Challenge.objects.update_or_create(slug=row['slug'], defaults={**row, 'kind': 'official'})


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name='Challenge',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('slug', models.SlugField(max_length=90, unique=True)),
                ('kind', models.CharField(choices=[('official', 'official'), ('custom', 'custom')], default='official', max_length=10)),
                ('title', models.CharField(max_length=80)),
                ('category', models.CharField(default='Personal growth', max_length=40)),
                ('summary', models.CharField(blank=True, default='', max_length=300)),
                ('description', models.TextField(blank=True, default='')),
                ('details', models.JSONField(blank=True, default=dict)),
                ('duration_days', models.PositiveSmallIntegerField()),
                ('start_date', models.DateField(blank=True, null=True)),
                ('end_date', models.DateField(blank=True, null=True)),
                ('visibility', models.CharField(default='public', max_length=12)),
                ('featured', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='owned_challenges', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='ChallengeGroup',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='groups', to='challenges.challenge')),
                ('creator', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_groups', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='GroupMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.CharField(max_length=30)),
                ('email', models.CharField(max_length=150)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='members', to='challenges.challengegroup')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='group_memberships', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(model_name='groupmember', constraint=models.UniqueConstraint(fields=('group', 'username'), name='one_member_name_per_group')),
        migrations.CreateModel(
            name='Enrollment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enrollments', to='challenges.challenge')),
                ('group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='enrollments', to='challenges.challengegroup')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enrollments', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(model_name='enrollment', constraint=models.UniqueConstraint(fields=('challenge', 'user'), name='one_enrollment_per_challenge')),
        migrations.RunPython(seed_catalogue, migrations.RunPython.noop),
    ]
