# Backup and recovery

`scripts/ops/backup.mjs` provides encrypted logical backup and explicitly gated restore using supported PostgreSQL `pg_dump`/`pg_restore` tools. Use tools of the server major or a supported newer major; test extensions/version compatibility. It does not provision backups, WAL archiving, an object store, IAM or alerts.

## Operations

Provide `BACKUP_DATABASE_URL` for a dedicated backup reader (CONNECT, schema USAGE and SELECT on all required application/migration tables). Do not give backup encryption keys to the API. `BACKUP_KEY_FILE` is a mode-600 regular file containing 32 random bytes encoded as 64 hex characters. Store it separately from the archive, with versioned escrow/access review. The destination directory must be private (0700).

```sh
node scripts/ops/backup.mjs backup /private/backups/vibetix-YYYYMMDD.vbt
```

The tool streams a custom-format logical dump through AES-256-GCM with a fresh random nonce and authentication tag. It writes an exclusive mode-600 partial file, publishes without overwriting an existing archive, and removes its partial output on failure. The versioned `VBTB1` header identifies the encryption format. Maintain an external archive/key-version catalog; do not discard old keys after rotation. It excludes role ownership/grants; provisioning is reapplied separately. Credentials use a temporary mode-600 pgpass file in a private directory, never a URL command argument; stderr/credential contents are not printed.

Restore only a trusted archive into a **new, empty** dedicated database using `RESTORE_DATABASE_URL`, `DATABASE_EXPECTED_NAME` exactly matching it and `ALLOW_DATABASE_RESTORE=true`:

```sh
node scripts/ops/backup.mjs restore /private/backups/vibetix-YYYYMMDD.vbt
```

Missing authorization, system database targets and nonempty targets are rejected; no automatic DROP/CLEAN is performed. The archive is fully decrypted/authenticated before PostgreSQL sees it, then restored with exit-on-error and a single transaction. Temporary plaintext is mode-600 in a private directory; use encrypted storage/private tmpfs and prevent swap/core-dump exposure. Cleanup is not a promise of physical secure erasure. Restore requires DDL-capable recovery credentials, then reviewed role/grant application and application invariants before traffic.

Production connections require verified TLS; native tools use `verify-full` and `PGSSLROOTCERT` for private CAs. Operators can select reviewed binaries with `PG_DUMP_BIN`/`PG_RESTORE_BIN`; those paths are trusted configuration, not user inputs. Test the job identity's certificate/file permissions and installed client version. Extensions, external objects, role credentials, key escrow and infrastructure configuration require separate backups.

## Recovery objectives and scheduling

Proposed initial objectives, **not verified production guarantees**: RPO at most five minutes with monitored managed PostgreSQL continuous WAL/PITR; RTO at most 60 minutes, to be measured in staging. Daily logical backups alone imply up to 24 hours data loss. Recommend continuous managed PITR plus daily encrypted logical snapshots, daily job/failure/age alerts, offsite immutable copies in a separate account, a documented retention policy (for example 30 daily/12 monthly, reviewed against privacy obligations), and monthly restore drills after migrations and key rotations.

No scheduler, bucket, retention lock or production WAL pipeline has been provisioned. The local drill, when recorded as passed in the hardening report, demonstrates this script only on small disposable data; it does not measure production restore time or offsite recovery.

## Migration and disaster recovery checklist

1. Stop sales/writers and establish incident ownership; preserve evidence and the last known-good backup/key versions.
2. Restore to an isolated new target, verify authentication and constraints/counts, then reapply restricted runtime grants and provider TLS.
3. Reconcile sold/held inventory, orders, payment provider truth, webhook/outbox jobs and issued tickets. Do not replay fulfillment blindly; duplicates and already-settled payments require reconciliation. Redis counters are operational state and may reset; restart with controlled admission.
4. Restore/rotate secrets according to incident scope. Existing ticket key IDs/rotation/admission remain incomplete, so reconcile ticket validity explicitly.
5. Exercise account/owner/admin permissions, quotes/holds/idempotency and worker behavior before a controlled connection switch. Record actual recovery point and elapsed time, monitor, then reopen traffic.

Use expand/contract migrations and forward corrective migrations. Keep deployed schema compatible with the prior app during rollback windows. Do not edit applied migration history or run `prisma migrate reset` in production. A destructive migration rollback requires a reviewed data migration or new-target restore plus post-backup transaction reconciliation; rolling back an application image does not undo data changes.


Post-restore: run `pnpm db:integrity` with `INTEGRITY_DATABASE_URL` for an operations reader that can SELECT the application and migration tables. It uses read-only transactions, validates migration names/checksums/completion and checks sold/order/ticket/payment/hold/event consistency, duplicate sale/ticket relationships, money balances and outbox ownership. It does not print row identifiers or repair data. Run `pnpm db:preflight` with restored runtime/migration role URLs after reapplying grants, followed by real application reads. Native verification also compares source/restored row counts, exact constraint definitions, ownership/totals and audit/hold snapshots; it never overwrites the source.
