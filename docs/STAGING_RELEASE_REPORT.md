# VIBETIX staging release engineering report

2026-10-15 (Asia/Tehran). Continues the completed audit/hardening and native infrastructure work. Evidence comes from this workspace; no UI redesign, reservation architecture replacement or real provider integration was performed.

## 1. Executive summary

The local release stages passed across full-command attempts and a checked infrastructure resumption. Code/build, security, real-stack booking, concurrent correctness, failure/recovery and populated encrypted restore were executed. The sprint found and fixed a real UTC scheduling defect and added practical staging commands, database preflight/integrity tooling and collectable operational events. This is a local release-engineering classification, not approval of a specific hosted staging deployment or public sales.

Machine ledger: [`artifacts/release/final-verification.json`](../artifacts/release/final-verification.json). The final ledger retains previously executed passing stages with `reusedFrom` and evidence hashes; protected source/test/lock modification times and compiled/static output hashes were checked before reusing them. Format/security/native recovery/checksums were rerun. This is local resumption evidence, not signed provenance. Earlier unsuccessful attempts are recorded below.

## 2. Architecture actually tested

React production bundle → real Fastify API → restricted PostgreSQL runtime role and authenticated TLS Redis; separate expiry worker/outbox. Native nginx terminated local-CA HTTPS for compiled production API probes. A separate explicit test-mode API enabled simulated checkout while the production API rejected simulation. The browser journey used a production frontend on HTTP loopback with the same real database/Redis boundary and no frontend fixtures.

Native versions: Node v24.21.0, PostgreSQL PostgreSQL 18.4, Redis 7.0.15, nginx version: nginx/1.24.0 (Ubuntu); UID 1000. Every native listener was loopback-only. Separate disposable databases/cluster, generated private credentials, reserved ports and owned-process cleanup were used. No production data was restored over.

## 3. Changes implemented

- `staging:init/up/verify/down`: fixed separate Compose project/volume, loopback port 8088, private generated configuration, separate migration job, safe seed and preserved volumes. See [STAGING.md](STAGING.md).
- `db:preflight`: read-only connectivity/effective-role, required grants, production TLS, UTC, migration names/checksums/completion, validated constraints/indexes and registration-trigger checks. Runtime does not gain migration-history access.
- `db:integrity`: read-only business and migration consistency checker, reused after load and restore.
- `release:verify`: executable stage ledger, frozen install, format/typechecks/tests/builds/audits/browser/native load/recovery, SBOM and compiled/static checksums.
- Structured request/status/latency, booking/replay and worker outcome/backlog/heartbeat events; vendor-neutral alert policy hooks.
- Correctness-first hot-event and outbox crash/backoff/restart/parallel-drain verification; query-count comparisons without logging SQL or parameters.
- **UTC defect fix:** mixed `timestamp`/timezone-aware clock comparisons could select future outbox retries early under a non-UTC session. Availability used the same mixed comparison. Raw comparisons and worker age now use an explicit UTC clock; dedicated roles default to UTC and production startup/preflight reject non-UTC sessions. The retry test deliberately selects through an Asia/Tehran transaction and retains its timing/backoff assertions. PostgreSQL documents this conversion behavior in [date/time operators](https://www.postgresql.org/docs/17/functions-datetime.html). Existing historical timestamps are not blindly rewritten.

Existing production payment/MFA fail-closed boundaries, owner authorization, CSRF, private client state, transactional locking, constraints, append-only runtime audit and TLS verification were preserved.

## 4. Docker/container verification

**BLOCKED: Docker/Podman CLI and Docker socket unavailable.** `staging:up` returned an explicit nonzero blocked result. Generated credential mode/independence and exclusive initialization were executed; a second initialization preserved the existing file. Compose/CI YAML parsed, including the staging override tag; source hardening checks passed.

No image was built/run/scanned on this host. Non-root container UID/GID, read-only/tmpfs behavior, capabilities, no-new-privileges, limits, secret readability, layers, image dependency footprint, container health/startup/restart/signal handling and network isolation remain unverified. Native UID 1000 does not certify image users. Pinned container PostgreSQL 17/Redis 7.4/nginx 1.28 differ from native versions. The CI image-build steps are configuration, not executed evidence.

## 5. Database release verification

Three existing migrations ran from an empty database as the dedicated non-superuser migrator. Runtime denied CREATE ROLE/DATABASE, schema/DDL/history authority, migration execution and historical audit mutation. Application and worker operations used runtime credentials. All current migrations/checksums, critical constraints/indexes, expected runtime privileges and UTC passed the new preflight; using runtime as migrator was rejected. No old migration was edited.

An isolated additive failure rolled back DDL; the failed record was explicitly resolved as rolled back and the normal migration workflow recovered. Existing-schema role/grant reapplication and migration deployment were executed. Release sequence: verified backup → protected migration job → grants/preflight/integrity → compatible application rollout → explicit forward-fix/application-rollback/new-target-restore decision. No automatic destructive down migration is promised. Production catalog import is separate from fictional staging seed.

## 6. Redis verification

Real authenticated TLS Redis with restricted prefix ACL; wrong credentials/CA denied. Two API processes shared login/register/hold/checkout quotas; keys were HMAC-namespaced with bounded TTLs. A 20-request simultaneous hold-budget burst accepted exactly 2 and returned 18 rate-limit denials. Larger quotas were explicitly configured only on the load API to measure booking behavior separately from that limiter test. Real termination caused fail-closed sensitive operations without new orders, and restart recovered automatically.

The existing global abuse policy still gates dynamic public reads when Redis fails; it was not silently bypassed with memory counters. Static nginx assets are independent. Managed Redis HA, counter continuity on failover, production ACL/TLS/rotation and capacity remain external.

## 7. Worker verification

Expiry stopped while the worker was down and recovered after restart. SIGTERM drained a lock-blocked expiry transaction and stopped scheduling new stages. A separate outbox process was SIGKILLed while holding an uncommitted claim: the durable job remained PENDING with zero committed attempts. Nine bounded backoffs and a terminal tenth failure were checked; the isolated owner advanced subsequent due timestamps to exercise the ladder without waiting every interval, while original delay values and pre-due denial assertions remained intact; another job retried and captured once after runner restart. No real email was sent.

Four concurrent local runners drained 8 queued local-capture jobs in 74.3 ms (107.6 jobs/s over this tiny drain). This is local filesystem work, not provider delivery throughput. Production delivery still needs bounded provider calls, idempotency/reconciliation and durable lease design/qualification.

## 8. Load/concurrency results

24 booking accounts; peak 120 outstanding measured HTTP requests. Scenarios: 120 concurrent availability reads; 24 users contending for one seat; 24 distinct holds and concurrent replacement; concurrent quotes/checkouts with worker traffic; expiry-vs-checkout; a 32-request same-key retry storm; Redis budget burst; outbox crash/retry/restart and parallel drain.

The 20-request quota burst and account setup are separate from the latency sample. Measured request count 297; HTTP statuses {"200": 206, "201": 62, "409": 29}; unexpected 5xx **0**. Conflict ratio 9.8% includes deliberately contested/expired/replayed-invalid mutations, not just faults. Overall p50/p95/p99 284.5/755.8/794.0 ms. Booking-window throughput 92.7 measured requests/s across 2965.9 ms; whole-lab average 10.5 requests/s includes setup, crash and queue tests, so neither is a maximum-capacity result.

| Operation | Requests | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- |
| `/events/:id/availability` | 120 | 543.3 | 780.8 | 798.5 |
| `/events/:id/hold-seats` | 85 | 165.3 | 335.3 | 361.3 |
| `/quotes` | 24 | 184.2 | 286.0 | 296.1 |
| `/orders` | 68 | 151.6 | 504.3 | 532.2 |

50ms database samples: maximum 10 runtime lock waiters, 10 active and 25 connections. Samples include other runtime clients/instances; they are not exact lock durations, Prisma pool queue depth or proof of saturation. The load API pool was explicitly bounded to 10. Expired-inventory recovery with worker/API traffic in flight was 800.0 ms in this workload; this is not isolated worker scheduling lag.

The first structural bottleneck is the event-wide FOR UPDATE lock serializing holds, quotes and checkouts. Observed waiters/latencies quantify this local workload; they do not establish a global scalability ceiling. Preserve the protocol. A future design should benchmark sorted event-seat locking and apply one consistent protocol to replacement, expiry, idempotency, checkout and every inventory writer, with constraint backstops and equivalent race tests. No reservation rewrite was attempted.

## 9. Correctness invariants checked

All 14 post-load violation counts were zero: sold-seat orphans, unbalanced money, invalid payment/order state, snapshot money mismatch, line-item/extras money mismatch, invalid ticket relationships, empty confirmed orders, invalid order items, invalid/missing holds, event/venue/price inventory mismatch, duplicate sales, duplicate tickets and invalid outbox ownership. Hold replacements released old seats and retained exact account ownership. Same-seat contention had one winner; 32 identical checkout retries returned one order; a changed payload on that key was rejected. Checkout racing expiry could not sell expired ownership. Constraints remained present/valid and restore definitions matched.

## 10. Failure/recovery tests

Redis/PostgreSQL actual process outages, safe private errors/readiness denial, reconnect/restart, API SIGTERM/restart preserving database session/idempotency, worker stop/expiry/restart, worker crash/backoff, malformed/oversized bounded requests, duplicate checkout, two-user race, expired hold and browser API retry UX were exercised. No dependency failure bypassed authorization/abuse checks, created an unpaid successful production order or produced a duplicate sale in these tests. Native signal tests do not certify container forwarding or rolling-release deadlines.

## 11. Backup/restore results

Encrypted AES-GCM logical backup restored into a new empty database; source/restored counts: {"user": 47, "event": 11, "seatHold": 1, "order": 39, "ticket": 39, "auditLog": 2}. Exact order totals/ownership/seat/ticket snapshots, audit/hold data and constraint definitions matched. Both the original checks and the expanded business checker passed; restored application reads succeeded and runtime audit deletion remained denied. Wrong key, tamper and nonempty-target rejection passed. No arbitrary existing archive overwrite or destructive source restore was allowed.

A focused second restore into another fresh TLS database explicitly ran the CLI against recovered history: all 3 migration checksums/completion states and all 14 business checks passed (`post-restore-migration-integrity.json`). Local recovery is verified; production backup-reader identity, offsite immutable retention, escrow/rotation, scheduled jobs/alerts, WAL/PITR, external RPO/RTO and disaster recovery are not provisioned.

## 12. Observability/alerting state

JSON request counts/status classes/durations and fixed auth/rate/authorization/booking outcomes are collectable; no query strings, cookies, passwords, contacts or payment fields become metric labels. Default raw-path request logging is disabled. Replay is distinct from new confirmation. Worker emits processed/retry/terminal failure, expiry counts and approximately 15-second backlog/oldest-pending heartbeat after successful iterations. Lazy API expiry is not counted as a complete expiry metric. Protected pg_stat_activity sampling provides lab pressure evidence; no privileged pool endpoint was exposed.

Generated credential/session/contact/key sentinels were absent from checked native service logs. Existing transactional admin audit remains append-only to runtime; database owners are not tamper-proof. [Alert hooks](../deploy/alert-policy.json) define 9 concrete API/dependency/worker/checkout/abuse/migration/backup/storage policies. Collector integration, retention/access, threshold tuning, alert delivery/recovery notifications and on-call ownership remain external; no delivery was claimed.

## 13. CI/release pipeline state

`pnpm release:verify` plus its checked `--resume` execution produced the final local machine-readable stages and allowlisted outputs. The workflow now includes formatting, post-E2E integrity, SBOM/checksums and pinned runtime image builds alongside existing install/typecheck/unit/backend/security/build/audit/browser gates. Read-only permissions, immutable action pins, disabled checkout persistence and timeouts remain. No deployment/registry push or production credentials were added.

Remote CI was not runnable: this mount has no usable Git repository/remote. Hosted image builds, runner networking and secret/artifact policy require a real run. The hosted workflow does not provision this native lab's tools or attest this local hot-event result; the native command is currently a separate local release gate.

## 14. Supply-chain checks

Frozen lockfile install and script allowlist passed; dependency audit reported zero known advisories across 365 reported entries (143 production / 222 development; optional metadata overlaps). No dependency was added for this sprint. CycloneDX 1.6 inventory includes 143 production components; no dependency-edge or OS/container coverage is implied. SHA-256 identities for compiled/static outputs are in `artifacts/release/build-checksums.json`. No SLSA/signing/provenance claim is made.

Prisma/TypeScript optional peers can remain in the production graph despite root development declarations. Actual image footprint and OS vulnerability scanning remain blocked. Frontend maps are not enabled by the current build; emitted browser assets passed budget/secret checks. Ignored private directories and Git history were not exhaustively scanned. Lockfile presence/frozen verification does not prove remote commit state.

## 15. HTTPS/proxy state

Native nginx local-CA TLS syntax/startup and requests passed: canonical 308 redirect, single edge-owned HSTS/CSP/nosniff/frame/referrer/permissions policies, 32KB body cap, immutable hashed assets and API no-store. Forged X-Forwarded-For was overwritten at nginx; direct untrusted peers could not spoof limiter identity. PostgreSQL wrong-CA/wrong-hostname and Redis wrong-CA checks passed. TLS trust was not weakened to make the lab work.

Public DNS/certificates/renewal, target edge/network isolation, provider CA/rotation, container nginx version and slow-upstream timeout expiry remain unverified. No WebSocket application path exists. The loopback staging profile deliberately uses HTTP; production uses its separate HTTPS template and Secure host cookie.

## 16. Frontend integrity checks

Deployable fixture build and unapproved public build variables were rejected. Real-stack API outage showed retry state without fixture fallback. Database sessions/private order authority were absent from browser storage; logout/cross-tab behavior and malicious return-path defenses passed. Existing auth-transition/account-switch/stale-response regressions passed. Holds/prices/totals/orders/tickets remained server authority; checkout transmitted no card fields. No visual changes were introduced.

## 17. Final E2E results

18 frontend units, 28 backend/security integration tests, 32 Chromium responsive/accessibility/journey checks, 11 real-stack browser groups and 17 native infrastructure/load/recovery groups passed. Zero backend tests skipped and no unexpected real-stack browser errors. Desktop/tablet/mobile live compositions and axe checks passed. The real journey covers registration/login/catalog/exact hold/refresh restoration/extras/promo/quote/simulated checkout/confirmation/tickets/order ownership/logout and retry behavior, supplemented by native race/expiry/restart/outage checks. Firefox/WebKit/real devices and screen readers were not rerun.

## 18. Performance/bundle/API findings

Bundle JS gzip 121,695 bytes / CSS 14,437, within 150,000/20,000 budgets. Twenty local raster assets, 1,136,344 bytes, zero audit problems. Existing real-stack response-size/timing samples are in `artifacts/fullstack/qa.json`; headless startup samples in `artifacts/fullstack/performance.json`. Query counts: {"catalog": 5, "inventory20": 5, "inventory100": 5}; inventory query count did not grow with row limit, so this probe found no per-seat N+1 pattern. Auth middleware/other endpoints are outside that isolated service-query count.

API/load percentiles and worker local-capture figures are recorded above. Local initial navigation samples: desktop-unthrottled: median LCP 516 ms (range 508–692), sampled CLS 0,0,0; mobile-4xCPU-150ms-1.6Mbps: median LCP 2476 ms (range 2460–2492), sampled CLS 0,0,0. These are headless initial-window observations. No provider/CDN latency, burst-capacity SLO, field INP or production Core Web Vitals guarantee is inferred from localhost. No performance rewrite was performed.

## 19. Known limitations

Container execution/scanning and hosted deployment remain unverified. Native package versions and unrestricted host CPU/memory differ from configured images/resource limits. Load is one host, one hot event, 24 booking users and bounded durations, not a distributed sale. Lock wait sampling does not expose Prisma queue depth or exact wait durations. Global Redis protection intentionally sacrifices dynamic-read availability on outage. Queue heartbeat scans and catalog payloads need capacity review at real scale. Historical non-UTC data needs operator review. No unrelated experimental source or unused dependency was introduced; deliberate crash fixtures remain verification tools and private failed-run evidence stays ignored.

## 20. External infrastructure gates

Before approving a particular hosted staging target: execute pinned containers/migration job with actual users/mounts/limits/signals/health/network boundaries; provision target PostgreSQL/Redis/TLS/secrets, central alerts and named ownership; rerun the real journey/outage/recovery checks there. Controlled staging may keep real provider features disabled.

Before public sales additionally require real payment intents/webhooks/reconciliation/refunds; real admin MFA enrollment/recovery; real transactional email/verification/recovery; admission/check-in; managed PostgreSQL/Redis failover/counter continuity; public DNS/TLS renewal; key rotation/escrow; offsite/PITR recovery; tested monitoring/on-call; production load/capacity and organizational privacy/operating policies. No mock closed any of these gates.

## 21. Security residual risks

No claim that VIBETIX is secure. Existing published audit risks remain unless explicitly superseded by executed evidence. Application-role compromise still grants allowed cross-account database access; authorization is application enforced, not tenant RLS. Signing-key rotation lacks a key ring/reissue workflow. Abuse quotas are not bot/identity verification. Real financial/admission/email/MFA state machines are not implemented. Infrastructure/historical secret scans, external assessment and deployed failover remain necessary. No known unresolved P0/P1 application defect remains in the executed local scope after the UTC fix; that is not a production assurance statement.

## 22. Exact commands executed

Executed full command (twice): `PNPM_STORE_DIR=/tmp/vibetix-pnpm-store QA_CHROMIUM_EXECUTABLE=/tmp/vibetix-browser/chrome-linux64/chrome pnpm release:verify`. After native-only listener corrections, executed the same command with `--resume`; it reruns failed infrastructure plus format/security/checksums and explicitly retains successful unchanged-input stages. Both failed full-command ledgers/logs are preserved as `attempt-1-*` and `attempt-2-*`. Generated local env values were never printed. The command executed these recorded stages:

| Command / stage | Result | Evidence / reason |
| --- | --- | --- |
| `pnpm install --frozen-lockfile --store-dir=/tmp/vibetix-pnpm-store` | pass (retained) | `artifacts/release/frozen-install.log` |
| `pnpm db:generate` | pass (retained) | `artifacts/release/generate.log` |
| `pnpm typecheck` | pass (retained) | `artifacts/release/typecheck.log` |
| `pnpm backend:typecheck` | pass (retained) | `artifacts/release/backend-typecheck.log` |
| `pnpm test` | pass (retained) | `artifacts/release/frontend-unit.log` |
| `pnpm build` | pass (retained) | `artifacts/release/frontend-build.log` |
| `pnpm backend:build` | pass (retained) | `artifacts/release/backend-build.log` |
| `pnpm build:audit` | pass (retained) | `artifacts/release/bundle-audit.log` |
| `pnpm images:audit` | pass (retained) | `artifacts/release/image-audit.log` |
| `pnpm audit --json` | pass (retained) | `artifacts/release/dependency-audit.log` |
| `pnpm test:e2e` | pass (retained) | `artifacts/release/chromium.log` |
| `pnpm --config.store-dir=/tmp/vibetix-pnpm-store licenses list --prod --json` | pass (retained) | `artifacts/release/runtime-inventory.log` |
| `/home/artin85/.nvm/versions/node/v24.21.0/bin/node scripts/create-runtime-sbom.mjs` | pass (retained) | `artifacts/release/sbom.log` |
| `resume-safety` | pass | `Protected source/test/lock inputs unchanged since prior completion; compiled/static SHA-256 identities match. Prior passing stages retain provenance.` |
| `pnpm format:check` | pass | `artifacts/release/format.log` |
| `pnpm security:check` | pass | `artifacts/release/security.log` |
| `pnpm test:preproduction` | pass | `artifacts/release/native-stack-load-recovery.log` |
| `/home/artin85/.nvm/versions/node/v24.21.0/bin/node scripts/build-checksums.mjs` | pass | `artifacts/release/checksums.log` |
| `docker-runtime` | not-executed | `Container qualification was not resumed; this host has no Docker. No runtime claim.` |
| `backend-security-tests` | pass | `artifacts/preproduction/results.json; hot-event-load.json; existing-backend-tests.log` |
| `real-stack-browser` | pass | `artifacts/preproduction/results.json; hot-event-load.json; existing-backend-tests.log` |
| `database-preflight` | pass | `artifacts/preproduction/results.json; hot-event-load.json; existing-backend-tests.log` |
| `backup-restore-integrity` | pass | `artifacts/preproduction/results.json; hot-event-load.json; existing-backend-tests.log` |
| `outage-and-sigterm` | pass | `artifacts/preproduction/results.json; hot-event-load.json; existing-backend-tests.log` |
| `hot-event-correctness` | pass | `artifacts/preproduction/results.json; hot-event-load.json; existing-backend-tests.log` |
| `outbox-crash-backoff` | pass | `artifacts/preproduction/results.json; hot-event-load.json; existing-backend-tests.log` |
| `remote-ci` | not-executed | `No usable repository/remote execution context` |
| `container-cve-scan` | not-executed | `No Docker/scanner available on this validation host` |
| `public-tls` | not-executed | `No public hostname/certificate target` |
| `offsite-pitr` | not-executed | `No external recovery infrastructure configured` |
| `external-alert-delivery` | not-executed | `No monitoring account/notification route configured` |
| `node artifacts/release/post-restore-rehearsal.mjs` | pass | `artifacts/release/post-restore-migration-integrity.json` |
| `staging-init-safety` | pass | `artifacts/release/staging-workflow.log` |

Supplemental executed commands: `pnpm staging:init`; `node scripts/staging.mjs up` (blocked); exclusive-init/secret-mode assertions (`staging-workflow.log`); expanded `pnpm test:preproduction` intermediate runs; `pnpm backend:typecheck`, `pnpm backend:build`, final `pnpm format:check`; Node syntax checks and PyYAML parsing of Compose/CI with the override tag. Native execution internally ran role provisioning, migrate/seed/grants, preflight negatives, existing backend suite, failed migration/resolution, encrypted backup/restore, integrity CLI and the existing fullstack browser script. Their exact child commands are in the reviewed harness and individual sanitized local logs. No remote/Docker/public execution is represented as passed.

## 23. Failed/intermediate tests later corrected

1. The new crash-log poll initially read before its child log existed. Polling now tolerates only ENOENT while waiting; other errors remain failures.
2. The crash fixture initially had an unsettled promise without a live event-loop handle. An explicit timer keeps it alive; the test now requires SIGKILL while its transaction is active, then proves rollback/durability.
3. The retry assertion returned a processed job before the intended backoff. This exposed the real mixed-timezone comparison defect. Explicit UTC comparisons, role UTC defaults and startup/preflight enforcement corrected it; the original backoff assertions remain and are executed in a non-UTC transaction.
4. Nested staging subprocess probes were blocked by the shell sandbox and produced empty captured output. The permitted rerun passed; missing Docker still correctly returned a blocked failure.
5. A late load-test listener collided on port 53202, within the host ephemeral range (32768–60999). The listeners moved to reserved loopback ports 23201/23202 outside that range, and explicit startup/readiness assertions were added. This was a harness bind failure; no application correctness assertion was waived. The first release ledger and failing log are preserved as `attempt-1-*`.
6. The following full attempt correctly refused occupied port 53102 at preflight after browser traffic. All native-only listeners were moved outside the host ephemeral range; no existing service was stopped. Passing browser/unit/build evidence was retained only after protected-source modification-time and compiled-output hash checks.
7. New preflight identifier quoting was corrected during implementation before final native verification. No permission, schema, quota or correctness assertion was disabled to obtain a pass.

Private generated keys/archive/contact logs are under ignored mode-700 native lab directories; do not upload the artifacts tree. Share the final JSON, checksum/SBOM, sanitized load results and this report only. No user volume was deleted or production service contacted.

## 24. Final recommendation

The local/staging engineering gates in the machine ledger passed. Proceed to qualification of a controlled staging target with the documented external/container requirements; this report does not authorize a public launch. The earlier infrastructure report's withheld hosted-staging approval remains a target-specific boundary, distinct from this sprint's requested engineering classification. Public ticket sales are not approved.

LOCAL/STAGING RELEASE ENGINEERING: READY — EXTERNAL PRODUCTION GATES REMAIN
