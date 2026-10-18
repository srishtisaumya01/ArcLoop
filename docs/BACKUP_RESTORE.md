# SQLite backup and restore

What is **verified**: the commands below were run end to end on **disposable databases** (a temporary folder created and deleted by the test, never `backend/db.sqlite3`): a database was migrated and filled with related records (users, profiles, sign-in tokens, templates, day plans, occurrences including moved copies, reminders), backed up, deliberately damaged, restored, and every table compared **row by row with hashes**, plus a sign-in with the restored password. See `backend/tests/test_backup.py` (`npm run test:backend`).

What is **not** verified: a restore of a real production database, restores under real load, a backup taken from a different SQLite or Django version than the one restoring it, off-machine storage, encryption, and any schedule (cron or a platform scheduler): those depend on your deployment and have not been built or run. Do not describe recovery as proven for production until you have performed the drill in section 6 on your real setup.

## 1. How the tooling works

- `python manage.py backup_db --to DIR [--keep N]` uses SQLite's **online backup API**: a consistent copy while the API is running, including rows still in the write-ahead log. A plain `cp` of `db.sqlite3` can silently miss committed data (tested: a copy missed a row that the backup included).
- The copy is written to a `.partial` file, checked (`PRAGMA integrity_check`, `PRAGMA foreign_key_check`), and only then renamed `arcloop-YYYYMMDD-HHMMSS.sqlite3` (UTC). A `.sha256` file is written beside it. An interrupted or failing backup never looks like a good one.
- `python manage.py restore_db --from FILE --yes` replaces the configured database. It refuses a backup whose checksum does not match, that fails its checks, or that is the destination itself; it keeps the replaced database as `<name>.before-restore-<time>`; it builds and checks the restored copy next to the destination and swaps it in only if it is good (a failure part-way leaves the original in place); it removes the old database's `-wal`/`-shm` files so stale log data is never replayed into the restored database.
- `python manage.py verify_db [--backup-dir DIR] [--max-age-hours H]` exits non-zero (with the reason) if the database fails its integrity or reference check, migrations are pending, or the newest backup is missing, too old, damaged, or does not match its checksum. Use it from cron or a monitor.
- Retention: `--keep N` keeps the newest N files that **this tool named** in that directory and touches nothing else (tested).

Set `DJANGO_BACKUP_DIR` to avoid typing `--to`. The commands read the database path from `DJANGO_DB_PATH` like the server does.

## 2. Taking a backup

```bash
cd backend
# the API may be running
python manage.py backup_db --to /var/backups/arcloop --keep 30
python manage.py verify_db --backup-dir /var/backups/arcloop     # expect: ok
```

Then copy the new `.sqlite3` and `.sha256` **off the machine** (section 4).

## 3. Restoring

```bash
# 1. Stop the API (systemd, container, process manager): nothing may write during a restore.
# 2. Pick the backup and check its checksum yourself if you copied it back from storage:
sha256sum -c arcloop-20261018-030000.sqlite3.sha256        # run in the folder holding both files
cd backend
python manage.py restore_db --from /var/backups/arcloop/arcloop-20261018-030000.sqlite3         # refuses: needs --yes
python manage.py restore_db --from /var/backups/arcloop/arcloop-20261018-030000.sqlite3 --yes
python manage.py migrate            # a no-op for a current backup; brings an older one up to date
python manage.py verify_db
# 3. Start the API, sign in with a test account, open My Day and Week.
```

The previous database is kept beside the live one as `...before-restore-<time>`: delete it only once you are satisfied (it holds the data you replaced, so it is as sensitive as the database).

If the restore says the backup is damaged, try the next older backup; do not edit the file.

## 4. Frequency, retention, storage

These are **recommendations** (nothing here is scheduled by the repository):

| Question | Recommendation | Why |
| --- | --- | --- |
| Frequency | At least daily, off-peak; hourly if losing a day of plans would be unacceptable | Your recovery point is your newest good backup: there is no replication or point-in-time recovery with SQLite |
| Retention | 14 daily + 8 weekly + 6 monthly (adjust to your needs and your privacy policy) | Lets you recover from a mistake noticed days late, while bounding how long deleted accounts survive in backups |
| Where | A **different disk and machine/provider** from the database; object storage with versioning and a lifecycle rule is ideal | A backup on the same disk dies with it |
| Protection | Encrypt at rest and in transit; restrict access to the operator; the tool already makes files owner-only where the filesystem allows | Backups contain emails, password hashes (not plain passwords), hashed sign-in tokens and every user's plans |
| Integrity | Run `verify_db --backup-dir ...` after each backup (alert on failure); keep the `.sha256` files with the backups | Catches damage in storage that SQLite's own check cannot see (verified: flipped bytes in unused space pass `integrity_check` but fail the checksum) |
| Account deletion | Deleted accounts remain in older backups until those expire: state the retention in the privacy policy; if you restore, re-apply deletions made since the backup (keep a record of deletion requests and dates) | A restore resurrects deleted users |

## 5. Limitations

- **Recovery point:** you lose everything written since the last good backup.
- **One writer, one file:** SQLite is not replicated. If the disk is lost, only off-machine backups remain.
- **The API must be stopped for a restore**; the tool cannot detect a running server (on Windows it fails to replace a file in use; on Linux it could replace the file under a running process, which would then keep using the old one). `--yes` is your statement that it is stopped.
- **Version drift:** a backup from an older release needs `migrate`; a backup from a **newer** release than the code restoring it is unsupported.
- **Tokens:** restoring brings back sign-in tokens as they were; anyone whose token was revoked after the backup is signed in again until it expires. After a restore from before a security incident, revoke all sessions (delete the `accounts_authtoken` rows via `python manage.py shell`) and consider forcing password resets.
- **No logical (per-user) restore:** it is all or nothing.

## 6. Recovery drill (do this on your real setup before relying on it)

1. Take a real backup (section 2) to your off-machine location, then **download it from there** (proves the storage path).
2. On a **separate machine or folder**, point `DJANGO_DB_PATH` at an empty path and run `restore_db --from <downloaded file> --yes`.
3. `migrate`, `verify_db`, start a second API instance against it, sign in with a known test account, open a day with tasks.
4. Record the date, the backup used, how long it took, and what was missing. Repeat after any change to the backup setup, and at least quarterly.

Only after this has passed on the real setup should the recovery be called tested for production.
