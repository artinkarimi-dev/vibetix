> Scope update (2026-10-15): this report retains historical commercial findings. For the current portfolio-demo classification, implemented fixes, fresh verification and verdicts, use [PORTFOLIO_PRODUCTION_READINESS.md](PORTFOLIO_PRODUCTION_READINESS.md). Commercial gaps are not automatically demo blockers.

# Final defensive security review

Review date: 2026-10-15 (Asia/Tehran). Authorized scope: this VIBETIX repository and disposable local services only. This is a source review with targeted adversarial regression tests, not a guarantee that every vulnerability has been found.

## 1. Executive summary

One new application-level finding was reproduced: an authenticated ticket owner could obtain freshly projected/signed tickets after the event was cancelled or unpublished. The ticket projection checked the ticket's status but omitted the event's current status. The fix applies the same current-state eligibility rule to order history, order detail, ticket listing and idempotent checkout replay. Historical receipts remain available. No UI, architecture, dependency or migration changes were required.

The new integration test failed against the original implementation (28 other backend tests passed). Final verification is recorded below. Production admission, payment, infrastructure and operational qualification remain separate gates.

## 2. Scope and evidence

Reviewed the current React application, shared request schemas, Fastify routes and services, session/password/MFA boundaries, Prisma schema and all three migrations, pricing and inventory transactions, worker/outbox/email transport, PostgreSQL role and preflight tooling, Redis limiter, nginx configurations, Dockerfiles/Compose, CI, secret handling and encrypted backup/restore scripts. Previous security and staging reports were treated as historical context, not current execution evidence.

Package manager: pnpm 11.25.0; Node 24.21.0; workspace includes the frontend, backend and shared package. Frozen lockfile installation is part of verification. Git status was attempted: this directory has no usable Git repository, so commit/history provenance and historical secret scanning could not be established. This report lists the application files edited in this review explicitly.

Initial baselines passed format, frontend/backend typechecks, 18 frontend unit tests and both production builds. Logs: `artifacts/final-security/baseline-*.log`. Previous release and preproduction public evidence was copied under `artifacts/final-security/prior-evidence/` before reruns. Existing private lab directories were retained; their contents are not suitable for public upload.

Unavailable: Docker/Podman, Trivy/Grype, Semgrep/Gitleaks and GitHub CLI; no supplied public staging target, production account, external monitoring, provider credentials or offsite recovery environment. Container runtime/layer scanning, remote CI, public TLS and production/offsite operations were not executed. Narrow repository checks are not substitutes for those tools.

## 3. Architecture and trust boundaries

| Actor / component | Reachable surface and security boundary |
| --- | --- |
| Unauthenticated browser | Public catalog/inventory and register/login; bounded input/body and shared IP/identity budgets before sensitive operations. Public inventory excludes draft/cancelled events. |
| Authenticated customer | Cookie-backed account, holds, quotes, orders, tickets and favorites. Owner IDs come from authenticated sessions, not request bodies. Server recomputes prices and checks inventory. |
| Administrator | Explicit role check plus recent production MFA assurance. Event/artist/venue writes and audit record commit together; event edits share the inventory lock. |
| API | Exact Origin policy for unsafe methods; private responses use no-store; strict mutation schemas and fixed public errors. Browser route guards grant no authority. |
| Worker / outbox | Restricted database identity; event-locked expiry and transactional job claims. Local email capture is explicitly non-production; no real mail/payment provider is installed. |
| PostgreSQL | Owner/bootstrap, migrator and runtime identities are separate. Transactions, unique/FK/check constraints and consistency triggers protect final writes. Production startup verifies TLS/UTC and selected forbidden privileges; deployment preflight checks more grants and migration identities. |
| Redis | Authenticated TLS and restricted application ACL in the native lab; atomic TTL counters shared across processes; HMAC limiter identifiers; timeout/outage fails closed. |
| Reverse proxy | Explicit trusted proxy CIDR; nginx overwrites forwarding headers. Local-CA HTTPS and headers can be tested here; public routing/certificates/firewall cannot. |
| CI / build | Frozen dependencies, pinned action SHAs, read-only token permissions, no persisted checkout credentials, explicit artifact allowlist. Remote enforcement and image execution require external evidence. |
| Secrets / backups | File-backed runtime secrets, build-variable allowlist, isolated secret exclusions. Authenticated encryption and guarded fresh-target restore; operator access, rotation, retention and offsite storage remain operational responsibilities. |
| Third-party boundaries | Payment authorization/webhooks/refunds, real MFA enrollment/verifier, email delivery, online admission and external monitoring require actual integrations. No simulated success is accepted in production. |

## 4. Confirmed findings

### FSR-001 — Event lifecycle omitted from ticket eligibility

- **Severity:** Medium. Limited to current ticket projection/signing; no demonstrated admission bypass, unauthorized purchase, cross-account disclosure or financial loss.
- **CWE:** CWE-841, Improper Enforcement of Behavioral Workflow.
- **Affected files:** `backend/src/services/booking.ts`, `backend/src/routes/api.ts`.
- **Affected operations:** `activeTicketIds`, `createOrder` idempotent replay; GET `/api/v1/orders`, `/api/v1/orders/:id`, `/api/v1/tickets`.
- **Prerequisite:** An authenticated owner has an existing confirmed order with a VALID ticket; an authorized event-status change subsequently makes that event CANCELLED or DRAFT. Successful creation of new simulated orders remains disabled in production. Historical-order GET paths are not dependent on enabling simulation.
- **Source → sink:** A previously purchased order and its JSON snapshot → VALID-ticket-only eligibility → `orderResponse` → a freshly projected ticket containing an HMAC-signed `qrValue`. Current event status was absent from this decision; checkout replay separately queried VALID ticket IDs and repeated the omission.
- **Reproduction:** Create a disposable ON_SALE event and one inventory seat, register/login, hold and purchase through normal test API calls, change only the event status to CANCELLED using the isolated fixture owner, then fetch the owner's order. The original code returned one signed ticket where the regression expected none. DRAFT and replay paths share the same missing guard; the regression covers all four response paths after the fix.
- **Observed evidence:** `artifacts/final-security/before-fix-backend-tests.log`: 29 tests, 28 pass, one fail; assertion `order detail projection`, actual 1, expected 0. `before-fix-native.log` records the enclosing lab failing at that test stage, not completing the later load/restore stages.
- **Impact:** A cancelled/unpublished event could still appear to have an active credential and issue freshly signed QR values from historical state. Consumers must not equate these signatures with admission authority. Previously downloaded copies are unaffected by suppressing subsequent API projections.
- **Root cause:** Eligibility considered ticket status without the current event lifecycle. Replay had a separate partial eligibility query.
- **Fix:** Load current event status alongside ticket status; return eligible IDs only for CONFIRMED orders whose event is ON_SALE and whose ticket is VALID. Replay uses the same helper while retaining the event transaction lock and idempotency fingerprint checks. Receipts and ownership queries remain intact.
- **Regression:** `backend/tests/security.test.ts`, `cancelled and unpublished events cannot reissue ticket QR values on reads or checkout replay`. Verifies ON_SALE issuance, CANCELLED/DRAFT suppression in detail/list/tickets/replay, restoration when ON_SALE, stable replay order ID and exactly one order/ticket. Also asserts that new holds, quotes and checkout fail with NOT_ON_SALE for both suppressed statuses. Uses a separate event to avoid modifying shared inventory in parallel tests and leaves that synthetic event unpublished after the assertions. Existing revoked/used-ticket and stranger-404 tests remain in place.
- **Status:** Fixed; final verification results below.

## 5. Defense in depth (separate from confirmed vulnerabilities)

No unrelated hardening changes were introduced.

- Runtime startup's privilege test is narrower than deployment preflight: for example it checks audit UPDATE, whereas preflight also rejects DELETE/TRUNCATE and extra role memberships. Properly provisioned grants and tested preflight deny these permissions. Treat preflight as mandatory, monitor grant drift, and consider aligning the startup checks in future work. This is a configuration-drift risk, not a demonstrated customer privilege escalation.
- CSP permits inline styles for the current UI. Scripts remain restricted to self, with object/base/frame/form restrictions. A future nonce/style strategy would strengthen CSP but was not needed to fix a reachable injection path here.
- Current secret checks detect selected patterns in selected files and built assets; they do not establish secret entropy, historical cleanliness or rotation. Operators must generate independent keys and control secret access. No user secret values were printed or collected.
- API/session limits mitigate repeated abuse but do not establish bot/Sybil resistance. Large distributed traffic still needs edge capacity controls and operational monitoring.

## 6. Investigated candidates and false positives

| Candidate | Trace and conclusion |
| --- | --- |
| HTML/code execution sinks | Searched actual application trees for dangerous HTML setters, DOMParser/document.write, eval/Function and javascript URLs. No reachable untrusted HTML/code sink found. React text rendering escapes event/account strings. This is not an exhaustive SAST result. |
| SQL injection | Request values reach Prisma query arguments or tagged parameterized SQL. `queryRawUnsafe` occurrences in local load/integrity tools consume fixed repository SQL, not browser input. No viable request-to-unsafe-SQL flow found. Redis `eval` runs a fixed counter script with separate arguments. |
| Mass assignment / forged money | Strict shared mutation schemas reject role/user/total/payment-state additions; service writes explicitly select fields. Prices, extras, discounts, fees and taxes come from database/server calculations in integer cents. Global promo codes have no event-specific quota model; absence of that product feature is not a bypass of an existing restriction. |
| Foreign order/ticket/hold/favorite IDs | Private queries include authenticated user ID; idempotency lookup is user/key scoped. Foreign order detail returns 404. Shared event inventory intentionally exposes availability, not another user's contact data. |
| Cancelled/unpublished purchases | Hold/quote/new-order paths enforce event status and date with server/database time under the shared event lock. The separate historical ticket projection gap was FSR-001 and was fixed. |
| Duplicate sale / hold extension / client clock | Event-lock protocol is shared by holds, checkout, expiry and event edits; unique event-seat order items and guarded transitions are the final boundary. Replacing a hold does not extend its original expiry. Client timers are UX only. |
| Payment success from browser | Test paymentOutcome is accepted only by explicit simulation environments. Production config, booking service and payment adapter independently reject simulation. No provider exists; no real payment security is implied. |
| Login enumeration / fixation | Registration returns the same response for duplicate/new email. Login uses generic errors and a valid dummy bcrypt path for unknown users. Bcrypt cost 12; UTF-8 passwords over 72 bytes rejected. Random session tokens are stored as hashes; login invalidates the prior browser session; expiry and admin absolute/idle limits are enforced. |
| MFA via header or password | Production admin assurance reads server-owned session state. Future/stale/forged assurance is rejected; the provider interface is not an HTTP bypass. Real enrollment, recovery and provider integration are still missing. |
| CSRF / forged forwarding headers | Exact configured Origin is required for unsafe methods, including login; production host cookie is Secure/HttpOnly/SameSite=Strict/Path=/ with no Domain. Spoofed forwarding headers from untrusted peers do not change abuse identity. A nonbrowser forging Origin still needs credentials; that alone is not a browser CSRF bypass. |
| Redirect / ICS / directions injection | Return paths reject external, backslash, protocol-relative and control-character forms. Calendar values escape delimiters/newlines; directions use a fixed HTTPS host and encoded destination. External blank-target links include rel protection. |
| Private browser persistence / late account data | Real-mode order persistence is disabled; attendee/payment drafts stay in memory. Account revisions reject late account/checkout results across logout/switch, with cross-tab invalidation. Already displayed/downloaded ticket copies cannot be recalled by clearing a response. |
| Errors / log leakage | Public errors are fixed, request IDs retained; structured telemetry uses route templates/statuses rather than raw queries/body/contact/cookies. Worker uses bounded error labels. Native sentinel scans supplement source review; they do not certify external log vendors. |
| Email path traversal / symlinks | Local transport accepts UUID order filenames only, checks private directory and target file handling and uses no-follow writes; regression tests cover traversal/symlinks/modes. No browser-controlled arbitrary filesystem path or upload endpoint exists. |
| Backup command execution / overwrite | CLI subprocesses receive argument arrays, not user-controlled shell commands; temporary database password handling avoids credentials in command arguments. Archives use AES-GCM, fresh nonces and exclusive publication; restore authenticates before pg_restore and requires an explicit empty target. Operator-controlled paths still require trusted filesystem access. |
| Database permissions | Runtime denies DDL, migration-history modification, user-role escalation and audit modification under provisioned grants. The runtime intentionally reads account/order data and is not a per-customer RLS boundary; stolen runtime credentials remain serious. Constraints protect many, not every conceivable financial state if a privileged operator writes directly. |
| CI / container recipe matches | Action/image pins, explicit COPY, nonroot users, restricted capabilities and secret exclusions are configuration evidence only. They do not prove published image contents, host isolation, CVE status or remote environment protection. |

## 7. Executed verification

Initial commands: `pnpm format:check`, `pnpm typecheck`, `pnpm backend:typecheck`, `pnpm test`, `pnpm backend:build`, `pnpm build` — passed; baseline logs above.

Regression development: backend typechecking caught an incorrect test fixture field (`tier` belongs to section, not EventSeat); corrected the fixture and provided its explicit ID before executing the reproduction. The original application then failed the new lifecycle assertion as documented in FSR-001. These failures were retained, not replaced with a claim of an uninterrupted passing run.

Reproduction command:

```sh
QA_CHROMIUM_EXECUTABLE=/tmp/vibetix-browser/chrome-linux64/chrome pnpm test:preproduction
```

Expected pre-fix failure: 28 existing backend tests passed and the new lifecycle regression failed. Later stages of this reproduction run were not executed after the failure.

After the fix, `pnpm backend:typecheck` passed. Format and backend typechecking were repeated after the final test-only additions (`artifacts/final-security/final-format.log`, `final-backend-typecheck.log`); application source did not change during release verification. Full fresh verification command (no resume/reuse):

```sh
PNPM_STORE_DIR=/tmp/vibetix-pnpm-store QA_CHROMIUM_EXECUTABLE=/tmp/vibetix-browser/chrome-linux64/chrome pnpm release:verify
```

This orchestrates frozen install, Prisma generation, format, frontend/backend typechecks, frontend unit tests, frontend/backend builds, bundle/image audits, secret/static checks, dependency audit, Chromium critical journeys, native TLS stack/security/load/recovery tests, runtime dependency inventory, SBOM and build checksums. Exact child commands, exit codes and durations for that attempt are recorded in `artifacts/release/final-verification.json`; text progress in `artifacts/final-security/verification.log`. That attempt failed its final native live-browser stage: the new synthetic event remained ON_SALE and increased the catalog count from the expected 10 to 11. The 30 backend tests, load, encrypted restore and outage tests had passed before that QA assertion. The fixture now leaves its own event DRAFT in `finally`, after verifying ON_SALE restoration; the existing catalog assertion was not weakened and application source did not change. Evidence is preserved in `artifacts/final-security/first-post-fix-run/`.

After that fixture-only correction, format and backend typechecking were repeated and the complete affected native suite was rerun, including backend/security tests, load, recovery and the real-API browser journey:

```sh
QA_CHROMIUM_EXECUTABLE=/tmp/vibetix-browser/chrome-linux64/chrome pnpm test:preproduction
```

Final affected-suite rerun: **passed**, exit 0; all 17 native groups, all 30 backend/service/security tests and all 11 real-API browser groups passed. Source and test identities, successful stages, intermediate failures and unexecuted gates are bound in `artifacts/final-security/final-verification.json`. Selected evidence is also copied under `artifacts/final-security/evidence/`.

| Exact command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --store-dir=/tmp/vibetix-pnpm-store` | Passed, no lockfile changes. |
| `pnpm db:generate` | Passed. |
| `pnpm format:check` | Passed, repeated after final fixture change. |
| `pnpm typecheck` | Passed. |
| `pnpm backend:typecheck` | Passed, repeated after final fixture change. |
| `pnpm test` | 18 unit tests passed. |
| `pnpm build` / `pnpm backend:build` | Both passed; application source unchanged afterward. |
| `pnpm build:audit` / `pnpm images:audit` | Passed; initial JS gzip 121,695 bytes, CSS 14,437 bytes; 20 raster assets, no audit problems. |
| `pnpm security:check` | Passed; 142 project files covered by limited secret patterns, selected application/build sink checks and deliberate fixture/unapproved-public-variable build rejection. |
| `pnpm audit --json` | Passed; details below. |
| `pnpm test:e2e` (Chromium executable supplied above) | 32 tests passed; fixture/UI journey, resilience, responsive and accessibility coverage. |
| `pnpm test:preproduction` (same executable) | Final rerun passed: 30 backend tests, 17 native groups and 11 real-API browser groups; includes authorization, expiry/concurrency/idempotency, Redis outages/budgets, privilege checks, worker retries, migration rollback and encrypted recovery. |
| `pnpm --config.store-dir=/tmp/vibetix-pnpm-store licenses list --prod --json` | Passed, runtime inventory. |
| `node scripts/create-runtime-sbom.mjs` / `node scripts/build-checksums.mjs` | Passed. |
| `node artifacts/release/post-restore-rehearsal.mjs` | Passed in another fresh TLS database from this run's encrypted backup: actual `scripts/ops/integrity.mjs` CLI verified 3 migration checksums and zero violations across 14 business checks. |

The native load exercised 24 booking accounts, 120 simultaneous availability requests, a one-seat race, concurrent hold replacement/checkouts/expiry, 32 same-key retries, worker crash/backoff/terminal failure/restart and a two-instance Redis burst. All 14 integrity violation counts were zero. The populated recovery retained 40 orders/tickets and checked constraints, ownership, totals, holds and audit rows; restored application reads succeeded. Native versions: PostgreSQL 18.4, Redis 7.0.15 and nginx 1.24.0 on localhost. No performance, container or Internet-scale certification is implied.

The original release ledger deliberately retains its failed attempt; it is not relabelled as a passing full release run. The final security ledger records the passing unchanged-source stages together with the affected-suite rerun and both intermediate failures.

Native tests use fresh local PostgreSQL/Redis identities, TLS certificates and disposable databases, never the working/production database. The native versions differ from pinned production container images, so these tests do not qualify those images. Browser execution covers Chromium only here; Firefox/WebKit and public-browser infrastructure were not executed.

## 8. Dependency audit

Fresh `pnpm audit --json` passed: advisory counts were info 0, low 0, moderate 0, high 0, critical 0; metadata reported 143 production and 222 development dependencies (365 total; optional dependencies overlap these categories). Evidence: `artifacts/release/dependency-audit.log`. This is a registry advisory snapshot from this run, not a statement that the application has no vulnerabilities.

No dependency versions or lockfile were changed to suppress audit output. Registry advisory matching does not establish the absence of unpublished vulnerabilities or qualify OS/container packages. Runtime dependency inventory/SBOM and checksums provide traceability, not a vulnerability guarantee.

## 9. Files changed by this review

- `backend/src/services/booking.ts`: current event/order/ticket eligibility and shared replay projection.
- `backend/src/routes/api.ts`: select current event status in owner-scoped order/ticket reads.
- `backend/tests/security.test.ts`: isolated event lifecycle regression plus direct request probes for cross-event/duplicate/over-limit seats, negative extras, forged negative money and injected ownership/status; all assert rejection without creating holds/orders.
- `docs/FINAL_SECURITY_REVIEW.md`: this report.
- Generated ignored evidence under `artifacts/final-security/`, `artifacts/release/`, `artifacts/preproduction/` and existing QA output paths; normal frontend/backend build and Prisma-generated outputs were refreshed. Private artifacts contain disposable credentials, contacts or encryption keys and must not be published wholesale.

No schema/migration, UI or product feature changes.

## 10. Remaining risks by category

| Category | Remaining risk / practical limit |
| --- | --- |
| Application | Signed QR copies are deterministic bearer material. Previously issued/downloaded or already displayed copies remain outside the projection fix. Concurrent status changes can race with a read; a returned credential is never an admission decision. No immutable “cancel forever” or key-rotation/revocation workflow was added. Owner-scoped authorization is essential because database runtime grants span customers. |
| Deployment | No actual container runtime/layer/CVE validation, public certificate chain, DNS, host firewall/network isolation, managed PG/Redis configuration, image provenance or orchestrator secret/mount/UID verification. Required preflight is stronger than startup privilege checks; ongoing grant drift needs detection. |
| Operational | Monitoring/alert routing and on-call response, log access/retention, key rotation, recovery timing and capacity planning are unqualified. Local artifact retention and backup/key separation require operator policy. Local load is a correctness exercise, not Internet-scale capacity proof. |
| External infrastructure | No remote CI result, deployment environment approvals, managed secret store, offsite encrypted backup/PITR/immutability, disaster-site restore or public TLS target was supplied. Local native tests do not replace these. |
| Missing business feature | No real payment provider/webhook reconciliation/refund/chargeback handling, real MFA enrollment/recovery, transactional mail provider, verified account recovery or online atomic ticket admission. Production checkout and unverified privileged access fail closed. Promo per-event scope/redemption quotas and stronger anti-bot mechanisms are not implemented promises. |

## 11. Production release blockers

1. Qualify immutable backend/frontend images with actual container execution, nonroot/read-only/mount/capability inspection and OS/image vulnerability scanning.
2. Deploy to an authorized real staging environment; run strict-TLS PG/Redis and role/migration preflight, public HTTPS/proxy/cookie/header and operational readiness checks there.
3. Integrate and validate real payment authorization, authenticated webhooks, amount/currency binding, idempotent fulfillment and reconciliation before enabling any real sale; retain simulation prohibition.
4. Supply real admin MFA enrollment/verifier/recovery and validate privileged operator workflows; never bypass the existing production gate.
5. Implement authenticated online atomic admission that checks live ticket, order, event, time and replay state before treating any QR as entry authority.
6. Establish remotely enforced CI/deployment protections, secret lifecycle, monitoring/alert delivery and offsite backup/PITR restore with measured recovery objectives and an operator runbook.

## 12. Final classification

SECURITY REVIEW PASSED FOR CURRENT LOCAL SCOPE — DEPLOYMENT GATES REMAIN
