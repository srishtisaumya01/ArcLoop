"""SQLite backup, verification and restore, working only on the file paths it is given.

Nothing here reads Django settings or connects to "the" database: the management commands (backup_db, restore_db,
verify_db) pass in the configured path, and the tests pass a disposable file. That makes it impossible for a test, or a
typo, to touch a database nobody named.

Backups use SQLite's online backup API, which gives a consistent copy while the API is running (WAL contents included);
copying the .sqlite3 file with `cp` does not. A backup is written to a ``.partial`` file, verified, and only then renamed to
its final name, so an interrupted or corrupt backup never looks like a good one. A sidecar ``.sha256`` file lets a later
restore detect a backup that was damaged in storage.
"""
import hashlib
import os
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

BACKUP_NAME = re.compile(r'^arcloop-\d{8}-\d{6}\.sqlite3$')


class BackupError(Exception):
    """A backup or restore was refused or failed; the message is safe to show an operator (no data)."""


def _stamp(now=None):
    return (now or datetime.now(timezone.utc)).strftime('%Y%m%d-%H%M%S')


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _open_readonly(path):
    if not Path(path).is_file():
        raise BackupError(f'{path} does not exist')
    return sqlite3.connect(f'file:{Path(path).as_posix()}?mode=ro', uri=True)


def table_counts(conn):
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    return {name: conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in tables}  # names come from SQLite itself


def verify_file(path):
    """Opens a database file read-only and checks it. Returns {ok, integrity, foreign_keys, counts}; never raises for a bad file."""
    try:
        conn = _open_readonly(path)
    except (BackupError, sqlite3.Error) as error:
        return {'ok': False, 'integrity': f'cannot open: {error}', 'foreign_keys': None, 'counts': {}}
    try:
        try:
            integrity = [row[0] for row in conn.execute('PRAGMA integrity_check')]
            foreign_keys = conn.execute('PRAGMA foreign_key_check').fetchall()
            counts = table_counts(conn)
        except sqlite3.Error as error:
            return {'ok': False, 'integrity': f'unreadable: {error}', 'foreign_keys': None, 'counts': {}}
        ok = integrity == ['ok'] and not foreign_keys
        return {'ok': ok, 'integrity': 'ok' if integrity == ['ok'] else '; '.join(integrity[:3]), 'foreign_keys': 'ok' if not foreign_keys else f'{len(foreign_keys)} broken reference(s)', 'counts': counts}
    finally:
        conn.close()


def _backup_to(src_path, dest_path):
    source = _open_readonly(src_path)
    try:
        target = sqlite3.connect(str(dest_path))
        try:
            source.backup(target)
        finally:
            target.close()
    finally:
        source.close()


def backup_database(src_path, dest_dir, keep=None, now=None):
    """Writes a verified, checksummed copy of `src_path` into `dest_dir` and returns its details.

    `keep`: if given, afterwards only the newest `keep` backups made by this tool in `dest_dir` are kept."""
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = f'arcloop-{_stamp(now)}.sqlite3'
    final, partial = dest_dir / name, dest_dir / f'{name}.partial'
    if final.exists():
        raise BackupError(f'{final.name} already exists (two backups in the same second)')
    try:
        _backup_to(src_path, partial)
        checked = verify_file(partial)
        if not checked['ok']:
            raise BackupError(f"the new backup failed its own check: integrity={checked['integrity']}, references={checked['foreign_keys']}")
        os.replace(partial, final)
    finally:
        if partial.exists():
            partial.unlink()
    digest = sha256_file(final)
    Path(f'{final}.sha256').write_text(f'{digest}  {final.name}\n', encoding='utf-8')
    for path in (final, Path(f'{final}.sha256')):
        try:
            path.chmod(0o600)  # owner only (a no-op on filesystems without modes, such as Windows)
        except OSError:
            pass
    removed = prune(dest_dir, keep) if keep else []
    return {'path': final, 'bytes': final.stat().st_size, 'sha256': digest, 'counts': checked['counts'], 'pruned': removed}


def list_backups(dest_dir):
    dest_dir = Path(dest_dir)
    if not dest_dir.is_dir():
        return []
    return sorted((p for p in dest_dir.iterdir() if BACKUP_NAME.match(p.name)), key=lambda p: p.name)


def prune(dest_dir, keep):
    """Deletes all but the newest `keep` backups (and their checksum files). Touches only files this tool names."""
    if keep < 1:
        raise BackupError('keep at least one backup')
    old = list_backups(dest_dir)[:-keep]
    for path in old:
        path.unlink()
        Path(f'{path}.sha256').unlink(missing_ok=True)
    return [p.name for p in old]


def check_sidecar(backup_path):
    """True/False if a checksum file exists and does/doesn't match; None if there is none."""
    sidecar = Path(f'{backup_path}.sha256')
    if not sidecar.is_file():
        return None
    expected = sidecar.read_text(encoding='utf-8').split()[0]
    return expected == sha256_file(backup_path)


def restore_database(backup_path, dest_path, now=None):
    """Replaces the database at `dest_path` with the backup. The API must be stopped.

    Refuses a backup that is damaged (checksum or integrity) or is the destination itself. The existing database is kept
    beside it as ``<name>.before-restore-<time>`` first. The restored copy is built and verified next to the destination
    and only then swapped in, so a failure part-way leaves the original in place."""
    backup_path, dest_path = Path(backup_path), Path(dest_path)
    if backup_path.resolve() == dest_path.resolve():
        raise BackupError('the backup and the destination are the same file')
    if check_sidecar(backup_path) is False:
        raise BackupError('the backup does not match its .sha256 checksum: it was damaged after it was made')
    checked = verify_file(backup_path)
    if not checked['ok']:
        raise BackupError(f"the backup failed its check: integrity={checked['integrity']}, references={checked['foreign_keys']}")

    safety = None
    if dest_path.exists():
        safety = dest_path.with_name(f'{dest_path.name}.before-restore-{_stamp(now)}')
        try:
            _backup_to(dest_path, safety)  # consistent, includes anything still in the WAL
        except sqlite3.Error:
            shutil.copy2(dest_path, safety)  # a damaged database cannot be backed up with SQLite: keep the raw file
    staging = dest_path.with_name(f'{dest_path.name}.restoring')
    staging.unlink(missing_ok=True)
    try:
        _backup_to(backup_path, staging)
        again = verify_file(staging)
        if not again['ok']:
            raise BackupError('the restored copy failed its check; the original database was not changed')
        for suffix in ('-wal', '-shm'):
            Path(f'{dest_path}{suffix}').unlink(missing_ok=True)  # leftovers of the old database must not be replayed into the new one
        os.replace(staging, dest_path)
    finally:
        staging.unlink(missing_ok=True)
    return {'restored_from': backup_path, 'safety_copy': safety, 'counts': again['counts']}


def newest_backup_age_hours(dest_dir, now=None):
    backups = list_backups(dest_dir)
    if not backups:
        return None
    modified = datetime.fromtimestamp(backups[-1].stat().st_mtime, tz=timezone.utc)
    return ((now or datetime.now(timezone.utc)) - modified).total_seconds() / 3600
