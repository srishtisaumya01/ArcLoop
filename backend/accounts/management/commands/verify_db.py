"""Health check for cron or a monitor: database integrity, applied migrations, and (optionally) the age of the newest backup."""
import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from accounts.backup import check_sidecar, list_backups, newest_backup_age_hours, verify_file


class Command(BaseCommand):
    help = 'Exit non-zero (with a reason) if the database is damaged, migrations are pending, or the newest backup is too old.'

    def add_arguments(self, parser):
        parser.add_argument('--backup-dir', default=os.environ.get('DJANGO_BACKUP_DIR'), help='Also check this directory has a recent, intact backup.')
        parser.add_argument('--max-age-hours', type=float, default=26.0, help='Newest backup older than this is a failure (default 26: a daily backup plus slack).')

    def handle(self, *args, **options):
        problems = []
        engine = settings.DATABASES['default']['ENGINE']
        if not engine.endswith('sqlite3'):
            raise CommandError(f'verify_db only supports SQLite (this database is {engine})')
        path = settings.DATABASES['default']['NAME']
        result = verify_file(path)
        self.stdout.write(f"database: integrity={result['integrity']} references={result['foreign_keys']}")
        if not result['ok']:
            problems.append('the database failed its integrity or reference check')
        pending = MigrationExecutor(connection).migration_plan(MigrationExecutor(connection).loader.graph.leaf_nodes())
        self.stdout.write(f'pending migrations: {len(pending)}')
        if pending:
            problems.append(f'{len(pending)} migration(s) not applied: run `python manage.py migrate`')
        if options['backup_dir']:
            backups = list_backups(options['backup_dir'])
            age = newest_backup_age_hours(options['backup_dir'])
            if not backups:
                problems.append('no backups found in the backup directory')
            else:
                newest = verify_file(backups[-1])
                checksum = check_sidecar(backups[-1])  # catches damage SQLite's own check cannot see (bytes flipped in unused space)
                self.stdout.write(f'newest backup: {backups[-1].name}, {age:.1f} hours old, intact={newest["ok"]}, checksum={"ok" if checksum else "MISSING" if checksum is None else "MISMATCH"}, kept={len(backups)}')
                if checksum is False:
                    problems.append('the newest backup does not match its .sha256 checksum')
                if age > options['max_age_hours']:
                    problems.append(f'the newest backup is {age:.1f} hours old (limit {options["max_age_hours"]})')
                if not newest['ok']:
                    problems.append('the newest backup failed its check')
        if problems:
            raise CommandError('; '.join(problems))
        self.stdout.write(self.style.SUCCESS('ok'))
