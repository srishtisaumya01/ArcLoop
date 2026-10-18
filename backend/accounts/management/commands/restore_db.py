"""Replaces the configured SQLite database with a backup. The API must be stopped first."""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.backup import BackupError, restore_database


class Command(BaseCommand):
    help = 'Restore the SQLite database from a backup file (stop the API first). The current database is kept beside it first.'

    def add_arguments(self, parser):
        parser.add_argument('--from', dest='backup', required=True, help='The backup file to restore.')
        parser.add_argument('--yes', action='store_true', help='I confirm the API is stopped and I want the current database replaced.')

    def handle(self, *args, **options):
        engine = settings.DATABASES['default']['ENGINE']
        if not engine.endswith('sqlite3'):
            raise CommandError(f'restore_db only supports SQLite (this database is {engine})')
        destination = settings.DATABASES['default']['NAME']
        if not options['yes']:
            raise CommandError(f'This replaces {destination} with {options["backup"]}. Stop the API, then run again with --yes.')
        try:
            result = restore_database(options['backup'], destination)
        except BackupError as error:
            raise CommandError(str(error))
        self.stdout.write(f"restored {result['restored_from']} into {destination}")
        if result['safety_copy']:
            self.stdout.write(f"the previous database was kept as {result['safety_copy']}")
        self.stdout.write('rows per table: ' + ', '.join(f'{table}={count}' for table, count in result['counts'].items() if count))
        self.stdout.write('next: run `python manage.py migrate` (a backup from an older version may need it), then `python manage.py verify_db`, then start the API.')
