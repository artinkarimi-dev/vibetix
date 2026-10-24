# Production security hardening

The later [staging release engineering report](STAGING_RELEASE_REPORT.md) records the expanded load/outbox/UTC/integrity sprint and its local engineering classification. Approval of actual containers/hosted staging and public production remains subject to the external gates documented there.

See the later [pre-production execution report](PREPRODUCTION_VALIDATION_REPORT.md) for native TLS, restricted-role, outage, shutdown and populated recovery evidence, and the still-open Docker/hosted infrastructure release gates.

Completed 2026-10-14 against the current local repository state, continuing the previous application audit without replacing its fixes. **Security posture improved with remaining operational risks documented. Public production release is not approved.** No UI redesign, real payment integration or admission feature was added.

## Gap analysis before implementation

| Area | Already solved | Implement now | Requires real infrastructure |
| --- | --- | --- | --- |
| Application | Strict validation, owner/admin checks, database holds and idempotent orders, CSRF origin checks, cookie sessions, safe redirects and private in-memory account state | Preserve and rerun existing regressions | Independent production assessment, real payment/admission integration |
| Database | Relational constraints, parameterized Prisma access, migrations | Dedicated migrator/runtime roles, explicit grants, runtime privilege checks and role tests | Managed PostgreSQL, credentials rotation, verified remote TLS, pool sizing |
| Abuse | Per-process IP limits | Shared Redis counters, identity/account limits and fail-closed outage behavior | Redis TLS/ACL/availability, operational threshold tuning and bot controls |
| Administration | Server-side roles | Transactional audit records, shorter admin sessions and a fail-closed MFA integration boundary | Real MFA enrollment/verifier, staff identity and off-host audit retention |
| Deployment | Explicit Docker copy scope, non-root backend, static CSP, read-only CI token | Non-root nginx, runtime sandbox recipes, separate migration job, CI pinning and focused secret checks | Docker execution, image scanning, protected environment/deployment setup |
| Recovery | No provisioned recovery | Safe backup/restore tools, destructive-operation gates and a disposable local restore drill if tooling permits | Encrypted offsite backups, PITR, measured production RPO/RTO and incident ownership |

The existing [security audit](../SECURITY_AUDIT.md) remains the record of the earlier application assessment. This report records the subsequent deployment foundation; it does not imply that a public environment has been deployed or penetration-tested.

## Implemented improvements and security controls

| Area | Implementation | Evidence boundary |
| --- | --- | --- |
| Database roles | Explicit `vibetix_migrator` schema ownership and `vibetix_app` table/column grants; no runtime superuser/role/database creation or schema modification. PUBLIC privileges and legacy direct runtime grants revoked. Future migrator functions default to no PUBLIC execute. Runtime cannot create privileged users or alter audit history. Separate migration command/job. | Real isolated role credentials tested, including allowed CRUD, denied DDL/role elevation/history edits and a rolled-back migrator table/function probe. Existing managed-provider grants still need verification. |
| Runtime DB policy | Server/worker inspect effective privileges, database ownership and actual TLS; datasource is explicitly constructed from validated configuration, including mounted secret files. | Role checks and actual file-backed Prisma connection exercised locally. Positive production TLS/certificate behavior remains unverified. |
| Distributed abuse controls | Atomic Redis counters for global/IP/email-identity login/registration/password budgets and account hold/checkout/quote-promo attempts. Bounded network timeouts; fail-closed 503; generic 429 with Retry-After; HMAC counter identifiers. Per-process memory remains development only. | Two real API instances share counters under concurrent traffic; identity budgets persist across IPs. Disconnected Redis clients deny requests. Real TLS/ACL/failover and high-load behavior remain infrastructure work. |
| Registration privacy | New and duplicate registrations return the same 201/ok envelope; login failure text remains generic with bcrypt comparison work. | Regressions compare responses. Immediate signup/login still permits inference in some workflows; verified-email enrollment is not implemented. |
| Admin protection | Bounded one-hour absolute / fifteen-minute idle sessions, configurable within caps. Every production admin route requires recent server-recorded MFA. Explicit trusted-verifier integration boundary; no header/env bypass. | Missing, rejected, fresh, stale and configured-idle MFA/session behavior tested. Real MFA enrollment/verifier/recovery are absent; production administration therefore remains blocked until integrated. |
| Privileged audit | Additive AuditLog migration; fixed fields/versioned metadata, pseudonymized IP/user-agent; event/artist/venue mutations append in the same transaction. Runtime has INSERT only. Reserved action types cover future ticket/refund/role writers. | Append and rollback-on-audit-failure tested. Those future application operations do not exist. Operator SQL/provisioning/bootstrap requires external DB audit; DB owners can still alter history. |
| Secrets/configuration | Independent required production abuse key, authenticated TLS Redis, HTTPS origin and strict DB TLS options; secret-file loading with ambiguity/size/error handling; allowlisted frontend public variables. Invalid errors expose field names, not values. | Valid production configuration and thirteen independent missing/unsafe-setting cases tested. Actual managed secret-store permissions/rotation not exercised. |
| Containers | Immutable official image pins; non-root backend and nginx; compiled/production-only backend runtime; explicit copy scope; direct signal-aware commands, init, read-only roots, bounded tmpfs, dropped capabilities, no-new-privileges and resource/PID limits. Separate development migration job and production Compose/TLS templates. | Digests resolved from official registry and YAML/source checks passed. Docker is unavailable: no image build, layer scan, nginx runtime, mounts/UIDs or sandbox execution is claimed. |
| CI/supply chain | Verified action commit pins, read-only token, checkout credential persistence disabled, timeout, frozen lockfile/script allowlist, dependency/security checks, PostgreSQL/Redis integrations and restricted artifact paths. Update proposal configuration added. Redis client and operations client are exact versions; superseded limiter plugin removed. | Local equivalents passed; remote workflow was not executed. Pins require reviewed ongoing updates; OS packages are not individually snapshot-pinned. |
| Recovery | Streaming AES-256-GCM logical backups; restricted key/archive files; authenticated decryption before restore; exact-target authorization, empty-target guard and transactional pg_restore. No automatic destructive clean/drop. | Actual encrypted backup/restore passed into a newly created local database, then only that disposable database was removed. Offsite/PITR, scheduling, key escrow and production RPO/RTO are not provisioned. |
| HTTPS/proxy | Unprivileged TLS nginx template with HSTS, script CSP, frame/nosniff/referrer/permissions protections, bounded body/proxy settings; explicit proxy CIDR policy and overwritten forwarding headers; existing Secure production cookies retained. | Fastify trusted/untrusted peer tests passed and templates parsed/reviewed. DNS, real certificate/hostname validation, renewals, edge redirects, network isolation and public headers are unverified. |
| Observability | Fixed login/rate/authorization/origin/booking/store-outage events without credential/body data; transactional admin audit; documented external alert/retention/worker-health requirements. | Event field privacy tested. No central collector, alert route, staff on-call, worker heartbeat or immutable external sink was deployed. |

## Tests performed and verified results

| Check | Result | Local evidence |
| --- | --- | --- |
| Frontend/backend typecheck | Passed | `artifacts/hardening/verification.log`, `artifacts/hardening/final-checks.log` |
| Frontend/backend builds | Passed; two existing dependency comment-annotation warnings are nonfatal | Same logs |
| Frontend unit tests | **18 passed** | `artifacts/hardening/verification.log` |
| Backend units/integrations/security | **26 passed**, zero failures/skips | `artifacts/hardening/backend-tests.log`; `pnpm backend:test` / `pnpm test:production` |
| Existing Chromium QA | **32 passed**, zero unexpected failures/skips | `artifacts/hardening/legacy-qa.log`, `artifacts/hardening/legacy-qa.json` |
| Production-build browser + real API/PostgreSQL/Redis | **11 recorded checks passed**, including registration/login, holds/refresh, checkout, tickets, owner/private-storage behavior, cross-tab logout, malicious return paths, worker expiry, responsive/axe states and retry | `artifacts/hardening/fullstack-browser.log`, `artifacts/hardening/fullstack-qa.json` |
| Backup/restore drill | Passed six checks: private archive, explicit target gate, tamper rejection before writes, matching restored seats/orders/tickets, preserved money constraint, nonempty-target denial | `artifacts/hardening/backup-drill.log`, `artifacts/hardening/restore-drill.json` |
| Dependency audit | **0 known advisories**, 365 reported dependencies | `artifacts/hardening/dependency-audit.json` |
| Focused secret/security checks | Passed selected source/configuration patterns, copy exclusions, image/action pins, non-root directives, header directives and rejected fixture/unreviewed-public-variable builds | `artifacts/hardening/security-checks.log`, `artifacts/hardening/static-checks.json` |
| Bundle/image budgets | Passed: JS 121,695 gzip bytes, CSS 14,437; twenty WebP rasters totaling 1,136,344 bytes, no image-audit problems | `artifacts/hardening/verification.log`; no new performance/load claim |
| Formatting / deployment YAML | Passed formatter and local YAML parsing of both Compose files | `artifacts/hardening/final-checks.log`, `artifacts/hardening/config-review.json` |

Backend coverage preserves authentication-bypass/fake/expired-session, CSRF/origin, admin/owner authorization, race/idempotency, invalid order/price/extra/promo, malicious JSON/SQL-like input, body caps, revocation and file-path tests. New coverage checks database privileges and future-function defaults, transactional audit failure, file-secret datasource wiring, generic registration responses, log privacy, admin MFA/session limits, distributed identity counters, proxy spoofing, account operation budgets and production config rejection. Client/worker behavior remains covered by the real-stack journey and existing frontend QA.

Verification found and corrected two issues during implementation: Prisma's returning insert conflicted with insert-only audit grants (replaced with a non-returning insert), and an environment-loader test temporarily affected a lazily initialized test-only owner client (the fixture now supplies its URL explicitly). The complete backend suite was rerun successfully; failed intermediate runs were not counted as successful evidence. No production data or live sales were used.

## Not verified

- Docker builds/runtimes, final image OS vulnerability scans, actual nginx syntax/runtime, non-root secret access, read-only mounts and container signals on a Docker host.
- Public HTTPS, redirects, DNS/certificate renewal/HSTS at a real edge, private network rules and hostname/CA verification for managed PostgreSQL/Redis.
- Remote CI execution, registry signing/provenance/SBOM publication or real deployment rollback.
- Real MFA, verified-email/account recovery, external audit/log/alert retention, production Redis ACL/failover/capacity, load/chaos/bot resistance.
- Offsite backup access/retention/immutability, WAL/PITR, key escrow and measured production recovery objectives. The small local restore is not a production RTO benchmark.
- Real payment settlement/webhooks/refunds/disputes, authenticated atomic admission, ticket key rotation/revocation reconciliation, or real email delivery.
- Safari/WebKit, real assistive technology and fresh field performance measurements. Existing browser/size checks are not substitutes for those validations.

## Remaining production requirements and decision

1. Run and inspect the images/templates in staging, scan/sign them and resolve runtime UID/secret/TLS/readiness differences. Do not expose the local development Compose stack.
2. Provision provider-specific restricted PostgreSQL and Redis identities/TLS/private networks, confirm effective grants, tune limits/pools and exercise Redis loss/failover and hot-event load.
3. Integrate a real MFA verifier/enrollment/recovery policy and staff audit/approval operations. Keep the production admin gate closed until then; reserved audit action types are not completed refund/role/ticket features.
4. Provision monitored encrypted offsite/PITR backups, protect/version recovery keys, run staging recovery and reconcile financial/inventory state. Proposed five-minute RPO / sixty-minute RTO are goals, not achieved guarantees.
5. Connect a real payment/admission/email lifecycle under separate design and verification. Client-selected simulation remains prohibited in production, and previously issued signed ticket copies still need live status/replay enforcement.
6. Add central privacy-filtered security logging, protected audit exports, alerting/worker monitoring, security ownership, secret rotation and a maintained history-aware secret/container scanning pipeline.

The runtime role is intentionally still authorized to access application rows needed by the service; this is not tenant RLS or protection against complete runtime compromise. Shared rate limits reduce abuse but do not verify persons, eliminate Sybil accounts or guarantee availability. Current event-level locking and partial DB state invariants still require load testing and disciplined writers. Mutable upstream content, malicious dependencies, unseen vulnerabilities and operator errors remain risks despite pins/audits.

**Decision: production-oriented deployment foundation implemented; public production security sign-off withheld.** All executed checks above are local. Actual infrastructure and real ticket-sale lifecycle controls remain necessary.

## Operating documentation

- [Database security](DATABASE_SECURITY.md)
- [Rate limiting](RATE_LIMITING.md)
- [Admin security](ADMIN_SECURITY.md)
- [Secrets management](SECRETS_MANAGEMENT.md)
- [Docker security](DOCKER_SECURITY.md)
- [CI security](CI_SECURITY.md)
- [Backup and recovery](BACKUP_AND_RECOVERY.md)
- [HTTPS deployment](HTTPS_DEPLOYMENT.md)
- [Security observability](SECURITY_OBSERVABILITY.md)
