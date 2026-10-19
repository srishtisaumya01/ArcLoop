import json
from pathlib import Path

from django.db import migrations


def seed_catalogue(apps, schema_editor):
    """Adds the Developer challenges (any that this database lacks) from seed.json; safe to run again."""
    Challenge = apps.get_model('challenges', 'Challenge')
    for row in json.loads((Path(__file__).resolve().parent.parent / 'seed.json').read_text(encoding='utf-8')):
        Challenge.objects.get_or_create(slug=row['slug'], defaults={**row, 'kind': 'official'})  # an existing one is left as it is


class Migration(migrations.Migration):
    dependencies = [('challenges', '0003_challenge_library')]
    operations = [migrations.RunPython(seed_catalogue, migrations.RunPython.noop)]
