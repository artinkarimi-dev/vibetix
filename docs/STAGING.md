# Controlled staging workflow

This profile is a **loopback-only simulation environment**, separate from the production HTTPS/managed-service template. It is suitable for engineering evaluation with fictional data; it is not a public ticket-sales deployment. PostgreSQL/Redis stay private on the Compose network. Only `127.0.0.1:8088` is published. HTTP, development cookies, local email capture and explicit payment simulation are intentional in this isolated profile; production restrictions remain intact.

## Container workflow

Prerequisites: Docker Engine and Compose >=2.24.4 (the staging port override uses `!override`), Node 24 and the pinned pnpm version. From the repository:

```sh
pnpm staging:init
pnpm staging:up
pnpm staging:verify
pnpm staging:down
```

Initialization creates independent random credentials in ignored mode-600 `.env.staging.local`, exclusively; existing files are never overwritten. `.env.staging.example` documents names with unusable placeholders. Never use production credentials. The wrapper fixes the Compose project name to `vibetix-staging`, giving it a separate database volume, and removes inherited credential overrides. It does not choose production Compose. Startup builds frontend/API/worker and a separate migration job; waits for PostgreSQL/Redis, provisions separated roles, migrates, seeds fictional development data, applies grants and then starts runtime processes. This workflow is configured, not container-verified on a host without Docker.

Open `http://localhost:8088` (the exact origin matters). Verification executes read-only database preflight using independent runtime/migration connections, then checks real registration/login/catalog/logout. The full release suite separately checks booking, races, load, outbox crash/retry, TLS, outage and recovery behavior. Repeated smoke runs create fictional accounts. Shutdown preserves the staging volume and credentials. Do not delete volumes or rotate role passwords as a troubleshooting shortcut; coordinate upgrades and back up persistent staging data.

`staging:up` is not a zero-downtime production rollout or an automatic rollback. The staging migration job rechecks existing state on restart. Changing migration files already applied is forbidden. Real production uses a protected one-shot migration identity and an approved catalog import, with no development seed.

## Native/release workflow

On this Linux validation host, `pnpm test:preproduction` creates and tears down a separate native TLS PostgreSQL/Redis/nginx/API/worker lab. It does not connect to `.env.staging.local` or operator-supplied databases. It rejects occupied ports and uses generated local keys and isolated databases. It includes the hot-event workload and the existing backend and real browser suites. See the README for executable/client locations and overrides; no automatic large tool installation is performed.

```sh
pnpm release:verify
```

The release command performs frozen installation/generation, formatting, both typechecks, unit/build/budget/security/dependency checks, Chromium QA, the native load/recovery suite, SBOM inventory and build checksums. Set `PNPM_STORE_DIR` only if intentionally using a custom pnpm store; set `QA_CHROMIUM_EXECUTABLE` for a non-default browser. Native prerequisites include OpenSSL, TLS Redis, nginx/mime.types, the embedded PostgreSQL shared libraries and compatible PostgreSQL clients. A missing prerequisite fails or records nonexecution; it never becomes a pass. On a Docker host the command also attempts the isolated staging stack/smoke and preserves its volume on shutdown. Container smoke is not layer/CVE/hardening certification.

`artifacts/release/final-verification.json` records each command, result and evidence path even when a stage fails. Share only allowlisted summaries. Native `private-*` directories, local email captures, traces and full logs can hold generated secrets or test contact data. Do not upload the whole artifacts tree. Build checksums identify these outputs; they are not signed provenance or SLSA certification.

## Database release and recovery

For a dedicated target with separately provisioned roles: take and verify a backup, run `pnpm db:migrate` using only `MIGRATION_DATABASE_URL`, apply reviewed grants through the protected operations identity, then run `pnpm db:preflight` with both role URLs. The API/worker receive only runtime secrets. Production preflight requires strict verified TLS, safe effective roles, current unchanged migration checksums, validated critical constraints, unique indexes and the runtime registration trigger. No extra PostgreSQL extension is required by the current migrations. Preflight is read-only and never repairs privileges or migration state.

After restoring into a new empty database, reapply grants and run `pnpm db:integrity` using `INTEGRITY_DATABASE_URL` for a read-only operations/backup reader with SELECT on the application tables. It prints counts of violations, never rows or credentials. Run preflight against the restored role URLs and real application reads before traffic. Failed migrations require explicit assessment: use a reviewed forward fix, compatible application rollback, or a verified restore during a planned outage. No invented automatic down migration is provided.

## Deployment approval boundary

The release-engineering classification in `STAGING_RELEASE_REPORT.md` concerns executed local code and engineering gates. It is separate from approval of a particular hosted staging target. Before that deployment, execute pinned images with actual secret mounts, non-root users, read-only/tmpfs behavior, limits, readiness, restart/signals and private networks. Configure staging HTTPS/managed services, central monitoring and named operational ownership. Real payment/MFA/email/admission integrations can stay disabled while qualifying controlled staging. All real provider and production infrastructure gates remain mandatory before public sales.


If a full run failed only in operational/native verification, `pnpm release:verify --resume` retains earlier passing command records only after checking protected runtime/UI/test/dependency input modification times and matching compiled/static SHA-256 identities. It reruns formatting, security, the complete native load/recovery suite and checksums; the ledger marks retained rows with `reusedFrom` and evidence hashes. A protected input/output change or another failed prerequisite requires a full run. This local resumption guard trusts filesystem metadata and existing local evidence; it is not signed provenance or an adversarial cache attestation. Preserve failed-attempt ledgers before retrying. Native test listeners use reserved loopback ports outside the host's ordinary ephemeral range; occupied ports cause an explicit refusal without stopping existing services.
