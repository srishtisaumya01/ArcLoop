"""Makes a verified, checksummed backup of the configured SQLite database (safe while the API runs)."""
import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.backup import BackupError, backup_database


class Command(BaseCommand):
    help = 'Back up the SQLite database with its online backup API, verify the copy, and write a .sha256 file beside it.'

    def add_arguments(self, parser):
        parser.add_argument('--to', default=os.environ.get('DJANGO_BACKUP_DIR'), help='Directory for backups (default: $DJANGO_BACKUP_DIR). Keep it OFF the database disk.')
        parser.add_argument('--keep', type=int, default=None, help='Afterwards keep only the newest N backups made by this command in that directory.')

    def handle(self, *args, **options):
        engine = settings.DATABASES['default']['ENGINE']
        if not engine.endswith('sqlite3'):
            raise CommandError(f'backup_db only supports SQLite (this database is {engine})')
        if not options['to']:
            raise CommandError('Say where to put the backup: --to DIR or set DJANGO_BACKUP_DIR.')
        try:
            result = backup_database(settings.DATABASES['default']['NAME'], options['to'], keep=options['keep'])
        except BackupError as error:
            raise CommandError(str(error))
        self.stdout.write(f"backup written: {result['path']}")
        self.stdout.write(f"size: {result['bytes']} bytes   sha256: {result['sha256']}")
        self.stdout.write('rows per table: ' + ', '.join(f'{table}={count}' for table, count in result['counts'].items() if count))
        if result['pruned']:
            self.stdout.write(f"pruned old backups: {', '.join(result['pruned'])}")
