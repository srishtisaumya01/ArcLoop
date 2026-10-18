"""Backup and restore, proven on DISPOSABLE databases only.

Every database here is a file in a temporary directory that the test creates and deletes. The commands are given that
path through DJANGO_DB_PATH; nothing in this file can name backend/db.sqlite3 or any real database.
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase

from accounts import backup as backup_module
from accounts.backup import BackupError, backup_database, list_backups, restore_database, verify_file

BACKEND_DIR = Path(__file__).resolve().parent.parent


def make_db(path, parents=2, children_each=3):
    conn = sqlite3.connect(str(path))
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE, label TEXT);
        """
    )
    for p in range(1, parents + 1):
        conn.execute('INSERT INTO parent (id, name) VALUES (?, ?)', (p, f'parent {p}'))
        for c in range(children_each):
            conn.execute('INSERT INTO child (parent_id, label) VALUES (?, ?)', (p, f'child {p}.{c}'))
    conn.commit()
    conn.close()


def counts(path):
    return verify_file(path)['counts']


class BackupModuleTests(SimpleTestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.live = self.dir / 'live.sqlite3'
        self.backups = self.dir / 'backups'
        make_db(self.live)

    def test_a_backup_is_a_verified_checksummed_consistent_copy(self):
        result = backup_database(self.live, self.backups)
        path = result['path']
        self.assertRegex(path.name, r'^arcloop-\d{8}-\d{6}\.sqlite3$')
        self.assertEqual(counts(path), {'child': 6, 'parent': 2})
        self.assertEqual(path.with_name(path.name + '.sha256').read_text().split()[0], result['sha256'])
        self.assertTrue(verify_file(path)['ok'])
        self.assertEqual(list(self.backups.glob('*.partial')), [])  # no half-written file is left behind

    def test_rows_still_only_in_the_write_ahead_log_are_included(self):
        # The case a plain file copy gets wrong: a writer's committed rows live in the -wal file until a checkpoint.
        writer = sqlite3.connect(str(self.live))
        writer.execute('PRAGMA journal_mode=WAL')
        writer.execute('PRAGMA wal_autocheckpoint=0')
        writer.execute("INSERT INTO parent (id, name) VALUES (99, 'only in the wal')")
        writer.commit()
        self.assertTrue(Path(f'{self.live}-wal').exists() and Path(f'{self.live}-wal').stat().st_size > 0)
        try:
            copied_only_main_file = self.dir / 'naive-copy.sqlite3'
            copied_only_main_file.write_bytes(self.live.read_bytes())
            self.assertEqual(counts(copied_only_main_file)['parent'], 2)  # a plain copy misses the row...
            self.assertEqual(counts(backup_database(self.live, self.backups)['path'])['parent'], 3)  # ...the backup does not
        finally:
            writer.close()

    def test_two_backups_in_one_second_do_not_overwrite(self):
        moment = datetime(2026, 3, 10, 12, 0, 0, tzinfo=timezone.utc)
        backup_database(self.live, self.backups, now=moment)
        with self.assertRaisesRegex(BackupError, 'already exists'):
            backup_database(self.live, self.backups, now=moment)

    def test_retention_keeps_the_newest_and_touches_only_its_own_files(self):
        self.backups.mkdir()
        (self.backups / 'notes.txt').write_text('mine')
        (self.backups / 'arcloop-latest.sqlite3').write_text('not our naming: untouched')
        for day in range(1, 6):
            backup_database(self.live, self.backups, keep=3, now=datetime(2026, 3, day, 3, 0, 0, tzinfo=timezone.utc))
        names = [p.name for p in list_backups(self.backups)]
        self.assertEqual(names, ['arcloop-20260303-030000.sqlite3', 'arcloop-20260304-030000.sqlite3', 'arcloop-20260305-030000.sqlite3'])
        self.assertEqual({p.name for p in self.backups.iterdir() if p.name.endswith('.sha256')}, {n + '.sha256' for n in names})
        self.assertTrue((self.backups / 'notes.txt').exists() and (self.backups / 'arcloop-latest.sqlite3').exists())
        with self.assertRaises(BackupError):
            backup_module.prune(self.backups, 0)

    def test_restore_brings_back_records_and_relationships_and_keeps_the_previous_database(self):
        good = backup_database(self.live, self.backups)['path']
        conn = sqlite3.connect(str(self.live))
        conn.execute('PRAGMA foreign_keys = ON')
        conn.execute('DELETE FROM parent WHERE id = 1')  # cascades to its children
        conn.execute("INSERT INTO parent (id, name) VALUES (50, 'junk')")
        conn.commit()
        conn.close()
        self.assertEqual(counts(self.live), {'child': 3, 'parent': 2})
        result = restore_database(good, self.live)
        self.assertEqual(counts(self.live), {'child': 6, 'parent': 2})
        check = verify_file(self.live)
        self.assertTrue(check['ok'] and check['foreign_keys'] == 'ok')
        conn = sqlite3.connect(str(self.live))
        self.assertEqual(conn.execute('SELECT COUNT(*) FROM child c JOIN parent p ON p.id = c.parent_id WHERE p.id = 1').fetchone()[0], 3)
        self.assertEqual(conn.execute('SELECT COUNT(*) FROM parent WHERE id = 50').fetchone()[0], 0)  # the junk is gone
        conn.close()
        self.assertEqual(counts(result['safety_copy']), {'child': 3, 'parent': 2})  # the replaced database is kept
        self.assertEqual(list(self.dir.glob('*.restoring')), [])

    def test_stale_wal_files_of_the_old_database_are_not_replayed_into_the_restored_one(self):
        good = backup_database(self.live, self.backups)['path']
        Path(f'{self.live}-wal').write_bytes(b'stale garbage that must not be applied')
        Path(f'{self.live}-shm').write_bytes(b'x' * 32768)
        restore_database(good, self.live)
        self.assertFalse(Path(f'{self.live}-wal').exists() and Path(f'{self.live}-wal').stat().st_size > 0 and b'stale' in Path(f'{self.live}-wal').read_bytes())
        self.assertEqual(counts(self.live), {'child': 6, 'parent': 2})

    def test_a_damaged_backup_is_refused_and_the_database_is_untouched(self):
        good = backup_database(self.live, self.backups)['path']
        before = self.live.read_bytes()
        # 1. Flipped bytes after the backup was made: the checksum catches it.
        data = bytearray(good.read_bytes())
        data[2000:2010] = b'\xff' * 10
        good.write_bytes(bytes(data))
        with self.assertRaisesRegex(BackupError, 'checksum'):
            restore_database(good, self.live)
        # 2. Not a database at all.
        garbage = self.dir / 'garbage.sqlite3'
        garbage.write_bytes(b'this is not sqlite' * 100)
        with self.assertRaisesRegex(BackupError, 'failed its check'):
            restore_database(garbage, self.live)
        # 3. A database with a broken relationship (orphan child).
        broken = self.dir / 'broken.sqlite3'
        make_db(broken)
        conn = sqlite3.connect(str(broken))
        conn.execute('PRAGMA foreign_keys = OFF')
        conn.execute("INSERT INTO child (parent_id, label) VALUES (777, 'orphan')")
        conn.commit()
        conn.close()
        with self.assertRaisesRegex(BackupError, 'failed its check'):
            restore_database(broken, self.live)
        self.assertEqual(self.live.read_bytes(), before)  # nothing above changed the live database
        # 4. A missing file, and the same file as the destination.
        with self.assertRaises(BackupError):
            restore_database(self.dir / 'nope.sqlite3', self.live)
        with self.assertRaisesRegex(BackupError, 'same file'):
            restore_database(self.live, self.live)

    def test_a_failure_while_building_the_restored_copy_leaves_the_original_in_place(self):
        good = backup_database(self.live, self.backups)['path']
        conn = sqlite3.connect(str(self.live))
        conn.execute("INSERT INTO parent (id, name) VALUES (60, 'newer than the backup')")
        conn.commit()
        conn.close()
        real = backup_module.verify_file
        calls = []

        def failing_second_check(path):
            calls.append(path)
            return real(path) if len(calls) == 1 else {'ok': False, 'integrity': 'simulated', 'foreign_keys': None, 'counts': {}}

        with mock.patch.object(backup_module, 'verify_file', failing_second_check):
            with self.assertRaisesRegex(BackupError, 'original database was not changed'):
                restore_database(good, self.live)
        self.assertEqual(counts(self.live)['parent'], 3)  # still the newer data
        self.assertEqual(list(self.dir.glob('*.restoring')), [])

    def test_verifying_a_bad_file_reports_instead_of_raising(self):
        bad = self.dir / 'bad.sqlite3'
        bad.write_bytes(b'\x00' * 4096)
        self.assertFalse(verify_file(bad)['ok'])
        self.assertFalse(verify_file(self.dir / 'missing.sqlite3')['ok'])


def snapshot_code():
    return r"""
import hashlib, json
from django.contrib.auth import get_user_model
from accounts.models import AuthToken, Profile
from planner.models import DayPlan, TaskOccurrence, TaskTemplate
from reminders.models import ReminderPreference, TaskReminder
User = get_user_model()
def digest(model):
    rows = sorted(json.dumps(r, sort_keys=True, default=str) for r in model.objects.all().values())
    return {'count': len(rows), 'sha256': hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
models = {m.__name__: m for m in (User, Profile, AuthToken, TaskTemplate, DayPlan, TaskOccurrence, ReminderPreference, TaskReminder)}
out = {name: digest(model) for name, model in models.items()}
out['links'] = {
    'occurrences_linked_to_a_template': TaskOccurrence.objects.filter(template__isnull=False).count(),
    'moved_copies_linked_to_their_source': TaskOccurrence.objects.filter(rescheduled_from__isnull=False).count(),
    'reminders_linked_to_an_occurrence': TaskReminder.objects.filter(occurrence__isnull=False).count(),
    'occurrences_per_user': {u.email: u.task_occurrences.count() for u in User.objects.order_by('email')},
}
print('SNAPSHOT ' + json.dumps(out, sort_keys=True))
"""


SEED_CODE = r"""
import datetime as dt
from django.contrib.auth import get_user_model
from accounts.models import AuthToken
from planner.models import DayPlan, TaskOccurrence, TaskTemplate
from reminders.models import ReminderPreference, TaskReminder
User = get_user_model()
for email, tz in (('alice@example.com', 'America/New_York'), ('bob@example.com', 'Pacific/Auckland')):
    user = User.objects.create_user(username=email, email=email, password='plum-ladder-orbit-42')
    user.profile.timezone = tz
    user.profile.display_name = email.split('@')[0].title()
    user.profile.save()
    AuthToken.issue(user)
    walk = TaskTemplate.objects.create(user=user, title='Walk', recurrence='daily', starts_on=dt.date(2026, 3, 1))
    gym = TaskTemplate.objects.create(user=user, title='Gym', recurrence='weekly', weekdays=[2, 4], starts_on=dt.date(2026, 3, 1))
    for day in (9, 10, 11):
        DayPlan.objects.create(user=user, plan_date=dt.date(2026, 3, day), day_mode='rest' if day == 11 else 'normal')
    first = TaskOccurrence.objects.create(user=user, plan_date=dt.date(2026, 3, 10), template=walk, title='Walk', completion=1, completed_at=dt.datetime(2026, 3, 10, 15, tzinfo=dt.timezone.utc))
    moved = TaskOccurrence.objects.create(user=user, plan_date=dt.date(2026, 3, 11), template=gym, title='Gym', rescheduled_from=first)
    TaskOccurrence.objects.create(user=user, plan_date=dt.date(2026, 3, 9), title='One-off with no template')
    ReminderPreference.objects.create(user=user, enabled=True, weekdays=[1, 2, 3])
    TaskReminder.objects.create(user=user, occurrence=moved, plan_date=moved.plan_date, remind_time=dt.time(8, 30))
print('SEEDED')
"""


class RecoveryProcedureTests(SimpleTestCase):
    """The documented procedure, step by step, through the real management commands, on a throwaway database."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.live = self.dir / 'live.sqlite3'
        self.backups = self.dir / 'backups'
        inherited = {k: v for k, v in os.environ.items() if k != 'DATABASE_URL'}  # these tools are SQLite-only: never inherit a PostgreSQL URL
        self.env = {**inherited, 'DJANGO_DEBUG': 'true', 'DJANGO_SECRET_KEY': '', 'DJANGO_DB_PATH': str(self.live), 'ARCLOOP_TEST_CLOCK': '', 'PYTHONIOENCODING': 'utf-8'}
        self.assertNotEqual(str(self.live), str(BACKEND_DIR / 'db.sqlite3'))  # never the project database

    def manage(self, *args, expect=0):
        result = subprocess.run([sys.executable, 'manage.py', *args], cwd=BACKEND_DIR, env=self.env, capture_output=True, text=True, timeout=180)
        self.assertEqual(result.returncode, expect, f'manage.py {" ".join(args[:2])}: {result.stdout[-600:]} {result.stderr[-600:]}')
        return result.stdout + result.stderr

    def snapshot(self):
        out = self.manage('shell', '-c', snapshot_code())
        return json.loads(re.search(r'SNAPSHOT (.*)', out).group(1))

    def test_backup_damage_restore_and_verify_a_realistic_database(self):
        self.manage('migrate', '--noinput')
        self.assertIn('SEEDED', self.manage('shell', '-c', SEED_CODE))
        original = self.snapshot()
        self.assertEqual((original['User']['count'], original['TaskOccurrence']['count'], original['TaskReminder']['count']), (2, 6, 2))
        self.assertEqual(original['links']['moved_copies_linked_to_their_source'], 2)

        # 1. Back up (the API could be running: this uses SQLite's online backup).
        out = self.manage('backup_db', '--to', str(self.backups), '--keep', '3')
        made = list_backups(self.backups)
        self.assertEqual(len(made), 1)
        self.assertIn('sha256:', out)
        self.assertTrue(verify_file(made[0])['ok'])

        # 2. Disaster: a user and their data are deleted, and junk is written.
        self.manage('shell', '-c', "from django.contrib.auth import get_user_model; get_user_model().objects.get(email='alice@example.com').delete(); print('DELETED')")
        damaged = self.snapshot()
        self.assertNotEqual(damaged, original)
        self.assertEqual(damaged['User']['count'], 1)

        # 3. Restore needs an explicit confirmation, and changes nothing without it.
        refused = self.manage('restore_db', '--from', str(made[0]), expect=1)
        self.assertIn('--yes', refused)
        self.assertEqual(self.snapshot(), damaged)
        # a damaged backup is refused and nothing changes
        broken = self.dir / 'broken.sqlite3'
        broken.write_bytes(b'not a database' * 50)
        self.manage('restore_db', '--from', str(broken), '--yes', expect=1)
        self.assertEqual(self.snapshot(), damaged)

        # 4. The real restore.
        out = self.manage('restore_db', '--from', str(made[0]), '--yes')
        self.assertIn('previous database was kept as', out)
        self.assertEqual(len(list(self.dir.glob('live.sqlite3.before-restore-*'))), 1)

        # 5. Every table, every row and every relationship is back exactly (row hashes, not just counts).
        self.assertEqual(self.snapshot(), original)

        # 6. The restored database is healthy and the documented check passes.
        out = self.manage('verify_db', '--backup-dir', str(self.backups))
        self.assertIn('integrity=ok references=ok', out)
        self.assertIn('pending migrations: 0', out)

        # 7. A restored user can sign in with their password and their stored session still resolves.
        out = self.manage(
            'shell',
            '-c',
            "from django.contrib.auth import authenticate; from accounts.models import AuthToken; "
            "u = authenticate(username='alice@example.com', password='plum-ladder-orbit-42'); "
            "print('LOGIN', bool(u), AuthToken.objects.filter(user=u).count())",
        )
        self.assertIn('LOGIN True 1', out)

    def test_verify_db_reports_a_stale_or_missing_backup_and_damage(self):
        self.manage('migrate', '--noinput')
        self.manage('verify_db')  # a fresh healthy database
        missing = self.manage('verify_db', '--backup-dir', str(self.backups), expect=1)
        self.assertIn('no backups found', missing)
        self.manage('backup_db', '--to', str(self.backups))
        self.manage('verify_db', '--backup-dir', str(self.backups))
        stale = self.manage('verify_db', '--backup-dir', str(self.backups), '--max-age-hours', '0', expect=1)
        self.assertIn('hours old', stale)
        newest = list_backups(self.backups)[-1]
        data = bytearray(newest.read_bytes())
        data[3000:3010] = b'\xff' * 10
        newest.write_bytes(bytes(data))
        bad = self.manage('verify_db', '--backup-dir', str(self.backups), expect=1)
        self.assertIn('does not match its .sha256 checksum', bad)  # SQLite's own check cannot see this kind of damage

    def test_commands_refuse_to_run_without_a_destination(self):
        self.manage('migrate', '--noinput')
        self.env.pop('DJANGO_BACKUP_DIR', None)
        self.assertIn('--to DIR', self.manage('backup_db', expect=1))
