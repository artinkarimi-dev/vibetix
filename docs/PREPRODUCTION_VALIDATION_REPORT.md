# VIBETIX pre-production infrastructure validation

The later [staging release engineering report](STAGING_RELEASE_REPORT.md) records the expanded load/outbox/UTC/integrity sprint and its local engineering classification. Approval of actual containers/hosted staging and public production remains subject to the external gates documented there.

2026-10-15. Final native verification completed, including the proxy-header correction. This is an execution report, not public production approval. The existing application audit and production-hardening controls were preserved.

## Environment and boundaries

Docker/Podman CLI, Docker socket, image scanner, Git remote metadata and remote CI executor are unavailable. Container builds, runtime mounts/capabilities/layers, public TLS and hosted infrastructure remain release gates. No Docker runtime claim is made from YAML/source inspection.

An isolated native lab runs real PostgreSQL with TLS and separate migrator/runtime credentials, authenticated TLS Redis with a restricted application ACL, compiled API/worker processes, and native nginx with a temporary local CA. Every native listener is loopback-only; nginx alone would be public at the deployment boundary. Tests create their own cluster/databases, reject occupied ports, never restore over a source database, and clean up only their own processes/data.

Native nginx and Redis package versions differ from pinned container images. Their execution validates behavior on this host, not the unbuilt image contents or sandbox.

## Actual deployment defects found and corrected

1. Fresh migration failed because schema ownership alone did not authorize the initial `CREATE SCHEMA IF NOT EXISTS`. The migrator now receives CREATE on its dedicated database; this permits schema creation and does not give cluster-level CREATEDB or runtime authority. Old migrations were not edited. A subsequent fresh migration succeeded as the non-superuser migrator.
2. Native nginx failed creating default HTTP temp directories outside `/tmp`. Both nginx configurations now set all HTTP temp paths at HTTP scope, including the redirect server and otherwise-unused FastCGI/uWSGI/SCGI paths. Native syntax/startup then passed. Read-only container execution remains unverified.
3. Liveness and readiness were conflated. `/live` now checks process availability; `/ready` and compatible `/health` check dependencies and return a generic 503. Real dependency outages exercised this separation.
4. The TLS template lacked HTTP redirect handling. A canonical 308 redirect is now present, and the production Compose example publishes HTTP only for that redirect alongside HTTPS. The native local adaptation executed it.
5. Worker failures were plain text and shutdown could start another expiry transaction/stage after SIGTERM. Worker failure events are structured, and expiry/shutdown checks stop scheduling new work between transactions/stages. A lock-blocked worker transaction was allowed to finish safely before exit.
6. Runtime pool/wait settings relied on defaults. The datasource now bounds pool size and connection/pool waits (defaults 10 connections/5 seconds/5 seconds, bounded overrides); database role statement/idle-transaction limits are also exercised.

7. Wire-level capture exposed conflicting duplicate edge/upstream security policies (including HSTS includeSubDomains and frame/referrer policies). Both nginx configurations now suppress the upstream copies of edge-owned headers while preserving API no-store. The native harness requires identical single edge policies on frontend and successful API responses.

The native test harness also needed a Redis-7.0-compatible ACL and a PostgreSQL regclass-to-text cast; those were lab compatibility issues, not claims of additional production security defects.

## Execution ledger

Commands ran against the current workspace. Evidence is in ignored `artifacts/preproduction/`; logs are local evidence, not remote CI attestations.

| Execution | Result / evidence |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed online after offline metadata was unavailable; `install.log`. No lockfile bypass. |
| `pnpm typecheck`, `pnpm backend:typecheck` | Passed; `checks.log`. |
| `pnpm test` | 18 frontend unit tests passed; `checks.log`. |
| Existing production/backend security suite | 28 passed, zero skipped; `existing-backend-tests.log`, run against TLS PostgreSQL with restricted runtime credentials and authenticated TLS Redis. |
| `pnpm build`, `pnpm backend:build` | Passed; `checks.log`. |
| `pnpm test:e2e` | 32 Chromium checks passed, including responsive and accessibility checks; `legacy-qa.log` / `legacy-qa.json`. Other browser engines were not rerun. |
| Existing full-stack browser journey | Passed with the runtime role, TLS Redis and fixture fallback disabled; `fullstack-qa.json`. Browser navigation uses HTTP loopback; separate native API integration verifies HTTPS. |
| `pnpm test:preproduction` | 16 native execution groups passed; `execution.log` / `results.json`. Includes real process outages, recovery, restricted roles, TLS negatives, shutdown, migration failure and encrypted recovery. |
| `pnpm audit --json` | Zero known advisories reported at execution time; `dependency-audit.json`. Not an absence-of-vulnerabilities guarantee. |
| `pnpm security:check` | Passed selected source/asset checks, fixture build rejection and unsafe public variable rejection; `security-checks.log`. Limited pattern scan excludes ignored private files and Git history. |
| `pnpm format:check`, `pnpm build:audit`, `pnpm images:audit` | Passed; initial JS gzip 121,695 bytes, CSS gzip 14,437 bytes; 20 raster assets / 1,136,344 bytes / zero asset problems. |
| Native nginx syntax and startup | Passed using adapted paths/ports/hostname/upstream from the production TLS template; `nginx-syntax.log`. The local HTTP configuration also passed native syntax validation (`nginx-local-syntax.log`), without claiming container execution. |
| Runtime SBOM | `sbom.cdx.json`: CycloneDX 1.6 component inventory of 143 declared production dependencies from pnpm. No dependency edges or OS/container package coverage. npm's SBOM command could not read this pnpm layout, so its failure is not represented as success. |
| Docker image build/run/scan, remote CI, public TLS | Not executed: required runtime, scanner, repository/remote execution context or public target is absent. Gates remain open. |

### Native versions and packaging limits

Node v24.21.0; PostgreSQL 18.4; Redis 7.0.15; Ubuntu nginx 1.24.0; native processes UID 1000. The pinned Docker recipes target PostgreSQL 17, Redis 7.4, nginx 1.28 and Node 24. Successful native execution does not establish behavior of those images, their UID mappings, capabilities, read-only mounts, tmpfs, PID/resource limits, signal forwarding, startup/restart policy, secret mounts or layers. Native Redis was extracted locally with a compatible least-privilege ACL; it is not the deployed managed service.

### Database, inventory and recovery evidence

All three existing migrations ran forward using the dedicated non-superuser migrator. Runtime SQL attempts to create roles/databases/tables, alter schemas, drop tables, mutate historical audit rows or read migration history failed with permission errors; a runtime migration attempt failed. A separate rolled-back probe verifies migrator schema creation. Runtime registration/login/catalog/favorites/holds/orders/tickets and worker expiry succeeded. Statement timeout is 15 seconds and idle-in-transaction timeout 20 seconds. Pool defaults are 10 connections and 5-second connection/pool waits; overrides are bounded. Event transactions retain their application-level timeout. This does not establish a hosted connection budget or load capacity.

PostgreSQL TLS accepted the local trusted CA and rejected a wrong CA and a trusted wrong-hostname certificate. Redis used TLS and authenticated, prefix-restricted application commands; wrong password and wrong CA failed. Two independent API processes shared login, registration, hold and checkout budgets. Keys used HMAC identifiers and bounded TTLs, with inspection performed through a separate test-only credential rather than granting KEYS to the application.

Two users racing for one exact seat produced one winner and one conflict. Duplicate idempotent checkout returned one order. Cross-user order reads returned 404, invalid sessions returned 401, and customer admin access returned 403. Production HTTPS checkout simulation was rejected without an order or fulfillment. Successful orders in the lab are explicitly test-mode simulation; no real money was collected.

A populated encrypted logical backup restored into a new empty database: 22 users, 11 events, 1 hold, 8 orders, 8 tickets and 2 audit rows. Counts, order totals, ownership, seat/ticket/hold snapshots, audit content and constraint definitions matched. Queries found zero sold-seat orphans, unbalanced orders, invalid tickets or invalid holds. Restored application catalog/order reads succeeded; runtime audit deletion remained denied. Wrong key, tampered archive and nonempty-target restore were rejected. Source data was not overwritten. This proves local logical recovery only, not offsite recovery, WAL/PITR, provider snapshots or production RPO/RTO.

A deliberately failing additive migration ran against an isolated copy of the migration directory; transactional DDL rolled back, the failed record was explicitly resolved as rolled back, and the normal migration workflow recovered. Existing migration files were preserved. No generic automatic rollback is promised: use reviewed forward fixes and expand/contract changes, or verified restore during a planned outage; a failed deployment needs explicit operator assessment.

### Failure, proxy and shutdown evidence

Real Redis termination left `/live` at 200 and `/ready` at 503; protected checkout failed closed and created no order. Redis restart recovered service automatically. Real PostgreSQL termination similarly left liveness available while readiness and private API operations failed safely; restarting the preserved cluster recovered access. Expired holds persisted while the worker was stopped and were released after worker recovery. Existing browser QA covers API-unavailable UI behavior and expired-hold recovery without fixture authority.

SIGTERM refused new API work, allowed a lock-blocked active checkout to finish, exited successfully and preserved session/idempotency behavior after restart. A worker SIGTERM waited for its lock-blocked expiry transaction, completed it and exited successfully without scheduling another stage. This exercises native processes; no bounded rolling-release latency or container signal propagation is certified.

Native nginx served local-CA-verified HTTPS, redirected HTTP with canonical 308, enforced a 32KB body cap and returned expected security, asset-cache and API no-store headers. It overwrote hostile forwarded addresses; direct requests from a distinct untrusted loopback peer could not spoof their source into Redis abuse keys. Only the configured proxy address is trusted. TLS is limited to 1.2/1.3, session tickets are disabled and the configured connect/read timeouts are 5/20 seconds. Slow-upstream timeout expiry, WebSockets (none used by this application), public certificate renewal and external load-balancer forwarding were not exercised. Canonical hostname and certificate paths remain deployment inputs.

### Logs, secrets and supply chain

Observed fixed structured events: `login_failed`, `rate_limited`, `authorization_failed`, `booking_rejected`, `abuse_store_unavailable`, `dependency_unavailable`, `worker_iteration_failed`. Admin mutations retain transactional append-only database audit records. Generated lab secrets, account credentials/emails, session tokens and backup key sentinels were checked against service logs without reporting values. Production API started using file-backed secrets. These checks do not certify all infrastructure logs, real provider payloads or secret rotation.

CI actions and Docker bases use immutable pins; CI permissions are read-only, checkout credentials are not persisted and installation uses the frozen lockfile. pnpm install-script allowlisting and scoped Docker COPY/exclusions were reviewed. The production dependency graph retains Prisma/TypeScript optional peers, despite their root development declarations; do not claim that `--prod` excludes every development tool. Image layer contents, globally installed build tools, OS vulnerabilities and final runtime footprint need actual image build and scanning. No container CVE coverage is claimed.

Send structured events and operational metrics to a protected sink before deployment. Alert on readiness failures, dependency failures, sustained 401/403/429/503 changes, worker expiry backlog/heartbeat loss, audit gaps, migration failure and backup/restore age or failure. Assign responders, thresholds and retention/access policies; test alert delivery. No fake dashboard or unverified monitoring integration was added.

### Performance sanity measurements

Three sequential local samples per operation (not concurrent load, percentiles or production SLOs):

| Operation | Median / range, milliseconds |
| --- | --- |
| Catalog | 10.3 / 10.1–45.7 |
| Seat availability | 18.0 / 17.9–19.5 |
| Hold | 20.5 / 19.2–25.4 |
| Quote | 20.1 / 18.6–21.1 |
| Simulated order | 29.5 / 28.0–30.8 |

`performance.json` records three desktop and three emulated mobile initial navigations. desktop-unthrottled: median LCP 504 ms (range 480–520 ms), sampled CLS 0, 0, 0; mobile-4xCPU-150ms-1.6Mbps: median LCP 2484 ms (range 2448–2596 ms), sampled CLS 0, 0, 0. Initial JS transfer is 121,695 bytes. These headless local samples use a different path from public TLS, measure an initial CLS window only and do not establish INP, field Core Web Vitals, provider latency or capacity under a ticket-sale burst. Existing bundle/asset budgets passed; no performance rewrite was made.

## Expected topology

Internet → nginx HTTPS (HTTP redirects only) → private API; static frontend served by nginx. API and worker use private PostgreSQL and Redis. A protected one-shot migration job uses its own credentials and never starts inside the API. PostgreSQL, Redis and API have no published production ports. Current native listeners use loopback; real container/cloud isolation and firewall rules are not verified here.

## Release gate matrix

VERIFIED means the explicitly stated local scope passed. PARTIALLY VERIFIED means executed local evidence exists but target deployment proof is missing. NOT VERIFIED means no execution evidence is available. BLOCKED identifies an unavailable requirement that prevents release. None of these labels asserts that the application is secure.

| Component | Status | Evidence / remaining gate |
| --- | --- | --- |
| Frontend | VERIFIED | Local production build, 18 unit tests, 32 Chromium checks and full-stack journey passed. Packaged delivery remains under Docker/TLS gates. |
| API | VERIFIED | Compiled API, restricted-role operations, HTTPS authentication, authorization, race/idempotency and dependency failures passed locally. Hosted rollout remains untested. |
| Database | PARTIALLY VERIFIED | Real local TLS PostgreSQL, separate roles, migrations, constraints and recovery passed. Production PostgreSQL provisioning, version compatibility, credentials, capacity and provider failover unverified. |
| Redis | PARTIALLY VERIFIED | Real authenticated TLS Redis, ACL, two-instance counters and outage recovery passed. Managed Redis/version/ACL/HA/rotation unverified. |
| Worker | PARTIALLY VERIFIED | Restricted-role expiry, outage event and active-transaction SIGTERM passed. Container restart behavior, heartbeat and deployed backlog alerts unverified. |
| Docker | BLOCKED | Docker/Podman CLI and Docker socket unavailable. Images were not built/run; users, hardening, layers, network boundaries, limits and image vulnerabilities cannot be certified. |
| Reverse proxy | PARTIALLY VERIFIED | Native nginx syntax, startup, actual requests, headers, forwarding, redirect and body limit passed. Packaged nginx/version, slow-upstream timeout and external edge unverified. |
| TLS | PARTIALLY VERIFIED | Verified local CA HTTPS, PostgreSQL CA/hostname negatives and Redis CA rejection passed. Public hostname/certificate, renewal and hosted service TLS unverified. |
| CI | PARTIALLY VERIFIED | Available pipeline commands passed locally; immutable pins and read permissions reviewed. No usable repository/remote CI execution context; no remote run attestation. |
| Backups | PARTIALLY VERIFIED | Populated encrypted logical backup and failure cases passed. Offsite retention, key escrow, schedule, alerts and WAL/PITR unprovisioned. |
| Restore | VERIFIED | New local target restored and application/invariant/constraint/ownership/audit checks passed. External disaster recovery remains under backup/operations gates. |
| Observability | PARTIALLY VERIFIED | Fixed structured events, audit records and sentinel log checks executed. No central sink, tested alert delivery, retention policy or responder rotation. |
| Security | PARTIALLY VERIFIED | Existing regressions and new deployment failures passed; dependency audit reported zero known advisories. No production external assessment, container scan or comprehensive secret-history scan. |
| Performance | PARTIALLY VERIFIED | Local startup/API samples and asset budgets recorded. No burst/load test, field metrics or production SLO/capacity qualification. |
| MFA | BLOCKED | Only a fail-closed integration boundary exists; real enrollment, factors, recovery and verified staff operation are absent. |
| Payments | BLOCKED | Real provider, signed webhooks, reconciliation and refunds are absent. Production simulation is rejected; test simulation cannot qualify sales. |
| Admission | BLOCKED | No real admission/check-in workflow, scanner operation or replay controls validated at a venue. |
| Email | BLOCKED | No real provider/delivery/verification/recovery workflow qualified; local capture is not delivery. |
| Production secrets | BLOCKED | File loading verified with generated local secrets only. No managed production values, access controls, rotation or recovery exercise provisioned. |
| Operational ownership | NOT VERIFIED | No named deployment/incident/backup/renewal owner, on-call acceptance or runbook rehearsal supplied. |
| Target network isolation | PARTIALLY VERIFIED | Native listeners use loopback; production example publishes edge 80/443 only. Actual private service firewall/container/cloud boundaries were not executed. |

## Final decisions

**Controlled STAGING deployment: NOT YET APPROVED.** The isolated native profile is qualified for continued local evaluation and the application-level checks passed. Before approving a deployed staging target, execute the pinned images and one-shot migration workflow with actual secret mounts, users, read-only filesystems, limits, health/restart/signal behavior and service isolation. Provision staging PostgreSQL/Redis, a staging HTTPS hostname/edge, tested alert routing and named ownership; rerun the restricted-role journey, outage and recovery checks there. Unimplemented sales/MFA/email/admission integrations may remain disabled in controlled staging; they do not need mocks to qualify infrastructure. Docker and target infrastructure proof are the current staging blockers.

**PUBLIC PRODUCTION ticket sales: NOT APPROVED.** In addition to the staging infrastructure gates, require genuine payment provider/webhooks/reconciliation/refunds, real MFA, email and admission, production PostgreSQL/Redis/public TLS, production secrets, offsite/PITR recovery, monitoring/alerting, capacity qualification and operational ownership. None was provisioned or substituted with a mock. No claim of overall security or production readiness is made.

Private native lab artifacts contain generated keys, credentials, archives and logs under mode-700 `artifacts/preproduction/private-*`. They are ignored and must not be uploaded as a whole artifact tree. Share the sanitized report and selected summary JSON/logs only; retain or remove private evidence under the operator's retention policy.
