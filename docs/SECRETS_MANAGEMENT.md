# Secrets management

Only non-sensitive, explicitly allowlisted `VITE_` settings may enter the frontend build. Unknown public build variables and fixture deployable builds are rejected. Backend secrets must never use this prefix. Build-time placeholders and test credentials are not deployment secrets.

Runtime validates the database URL, signing key, origin, Redis configuration, limits and proxy trust. Production requires HTTPS, strict DB TLS options, authenticated TLS Redis and an independent abuse HMAC key; payment simulation/local email capture remain prohibited. Invalid configuration errors identify field names, not supplied secret values.

For `DATABASE_URL`, `REDIS_URL`, `TICKET_SIGNING_KEY` and `ABUSE_KEY_SECRET`, use either the environment value **or** the corresponding `_FILE` path. Supplying both is rejected. Files are read at startup, bounded to 64 KiB, and failures do not print contents/paths. Mount managed secrets read-only with permissions that allow the non-root process to read them. Kubernetes projected secret symlinks are supported; the mount and path configuration are trusted operator inputs.

## Local / CI / production

Local setup generates random, ignored mode-600 env files and never overwrites existing files. Keep directories private and use fictional test contact/card data. Native test tooling intentionally uses a separate disposable database and loopback services.

CI uses public throwaway service credentials only for isolated test containers, creates independent migration/runtime test credentials in memory, and never accesses production secrets. Do not add secret environments to untrusted PR runs. Persisted checkout credentials are disabled; artifacts are allowlisted rather than uploading all `artifacts/`, which can contain local PostgreSQL data, env material or contact details.

Production: use a managed secret store/workload identity; export only required runtime secrets. Keep bootstrap, migration, backup-encryption and backup-reader credentials out of API/worker secrets. Run migrations in a separate protected job. The provided Compose template reads secrets from externally managed files; plain Compose file-backed secrets are **not** a secret-manager or host encryption solution. Prevent accidental `docker compose config` output/artifact exposure.

Generate independent cryptographic random values (at least 32 random bytes) for signing, abuse HMAC, role passwords and backup encryption. Do not reuse keys between environments or purposes. Configuration length/format checks do not prove entropy. Restrict access to stores, files, snapshots and logs, and document owners/expiry/rotation.

Rotate DB/Redis credentials with coordinated rollout and revoke old access. All instances must share the current abuse key; changing it resets counter identity. Existing ticket signing has no key IDs/rotation ring: a signing-key change can invalidate old QR artifacts and requires an explicit ticket migration/reissue policy. Retain versioned backup decryption keys offsite in a separate controlled store; losing them loses recovery capability. Secrets are loaded once per process, so changing a mount requires a controlled restart.

The focused secret checks scan selected shipped source/configuration files and frontend assets for high-confidence patterns. They do not prove that no secret exists, scan ignored private directories/history, or verify remote store access. Review and rotate actual suspected exposures rather than treating a green pattern scan as certification.
