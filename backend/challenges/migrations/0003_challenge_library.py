import json
from pathlib import Path

from django.db import migrations


def add_library_challenges(apps, schema_editor):
    """The catalogue grew from 6 to 26 challenges (seed.json). Adds the ones this database does not have yet. A challenge that is
    already there is left exactly as it is, so nothing someone edited is overwritten, and running this twice adds nothing."""
    Challenge = apps.get_model('challenges', 'Challenge')
    for row in json.loads((Path(__file__).resolve().parent.parent / 'seed.json').read_text(encoding='utf-8')):
        Challenge.objects.get_or_create(slug=row['slug'], defaults={**row, 'kind': 'official'})


class Migration(migrations.Migration):
    dependencies = [('challenges', '0002_member_lookup_indexes')]

    # Nothing to undo: removing challenges could take people's enrolments with them.
    operations = [migrations.RunPython(add_library_challenges, migrations.RunPython.noop)]
