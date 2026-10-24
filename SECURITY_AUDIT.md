> Scope update (2026-10-15): retain these findings as historical security/commercial context. Current portfolio-demo fixes, classifications, fresh checks and remaining risks are recorded in [PORTFOLIO_PRODUCTION_READINESS.md](docs/PORTFOLIO_PRODUCTION_READINESS.md). Real commercial ticketing remains disabled.

# VIBETIX security audit

> Subsequent deployment-foundation work is recorded in [the production security hardening report](docs/PRODUCTION_SECURITY_HARDENING_REPORT.md). The findings and verification below describe the earlier application audit. Database role separation, shared limits, admin audit/session foundations and deployment/recovery templates have since been added; actual production infrastructure and remaining release gates still require verification.

Date: 2026-10-14. Scope: the current local React/Vite frontend, Fastify API, Prisma/PostgreSQL schema and services, worker, dependency lockfile, Docker/nginx/Compose recipes and CI definition.

**Public production release is not approved. This report does not certify the application as secure.** Safe application fixes were implemented and exercised locally. Important operational and business controls remain absent. No public deployment, third-party account, real payment system or production database was attacked. No features or UI redesign were added.

The interrupted work was resumed in place. Existing implementation and completed hardening were retained. Findings below distinguish reproducible application defects, conditional deployment exposures and missing production controls. Severity considers the stated preconditions; a local development convenience is not evidence of a remotely exploited production service.

## Findings addressed

### S01 — High, conditional: client-selected simulated payment success could be enabled in production

- **Scenario:** an operator sets `ALLOW_SIMULATED_PAYMENTS=true` with `NODE_ENV=production`; a customer submits `paymentOutcome: success` and receives sold seats and signed tickets without payment. This is intentional test behavior in development, but was not independently prohibited in production.
- **Impact:** unpaid fulfillment if the simulation is deployed as a real merchant backend.
- **Fix:** configuration now rejects this combination. Both `createOrder` and `SimulationPayments.authorize` also reject production independently of configuration parsing. Default payment behavior remains disabled.
- **Recommendation/status:** production simulation is blocked and regression tested. A real provider, durable intents, authenticated webhooks, amount/currency verification, reconciliation and refunds remain release gates; this patch does not implement them.
- **Evidence:** `backend/src/config.ts`, `backend/src/services/booking.ts`, `backend/src/services/payments.ts`; production bypass regression in `backend/tests/security.test.ts`.

### S02 — High, conditional: private workspace directories could enter frontend Docker build layers

- **Scenario:** credentials exist under `.aws`, `.ssh`, `.npmrc`, nested env files or similar workspace paths. Broad `COPY . .` puts accessible context files into the builder, exposing them to builder caches, intermediate images or parties with builder access.
- **Impact:** potential disclosure of infrastructure credentials or private workspace material. This is not a finding that credentials were published in the final nginx image; actual private-directory contents were not inspected.
- **Fix:** frontend Docker copies explicit application/configuration paths. Both Dockerfiles avoid broad root copies. Docker exclusions now cover private tooling/credential directories, nested env files and common private-key formats.
- **Recommendation/status:** source recipe hardened; use BuildKit secret mounts for future private-registry credentials, review context contents, restrict/expire caches and rotate credentials if earlier builds actually exposed them. Docker is unavailable here, so no image-layer inspection or runtime image build is claimed.

### S03 — Medium: delayed account responses could restore private state after logout/account switching

- **Scenario:** a slow order/session/account restore or checkout response completes after logout, a tab changes accounts, or checkout unmounts. Earlier callbacks could write old orders/favorites/selection back into shared in-memory state or navigate to an old confirmation.
- **Impact:** private order/contact details could reappear on a shared browser and old account actions could affect the next account's local view. Backend ownership checks still apply.
- **Fix:** account transitions invalidate a monotonic request scope. Session/account restoration, single-order loads, favorites, seat queues, inventory loads and checkout completion check that scope before applying results. Checkout also checks component lifetime after the purchase response. Successful account changes notify other tabs, which reload against the current server session. Notifications contain no account data or tokens.
- **Recommendation/status:** covered by delayed-response unit tests and a real two-tab logout/browser reload check. Same-document broadcast messages are ignored; browser QA caught and corrected an initial self-reload regression. This is not remote device logout, guaranteed erasure of browser memory/screenshots, or protection against an already-running same-origin XSS payload. A purchase already accepted by the server is not undone by navigating away.

### S04 — Medium: previous browser session survived successful account switching

- **Scenario:** a user signs into a different account with an existing session cookie. The previous cookie remained valid in the database until its normal expiration; someone who already possessed that cookie could continue using it.
- **Impact:** unnecessary continued access through a superseded browser session.
- **Fix:** successful login creates a new random session and deletes the presented previous cookie's hashed session in one transaction.
- **Recommendation/status:** regression proves the old cookie returns 401 after switching. Other devices' sessions remain active by design. Global session revocation, device management, MFA and account recovery are still absent.

### S05 — Medium: inactive ticket snapshots were returned with fresh signatures

- **Scenario:** a ticket is marked `REVOKED` or `USED` in canonical PostgreSQL state. Order reads and idempotent replay previously used the original JSON snapshot and generated QR signatures for those tickets anyway.
- **Impact:** stale tickets continued to be distributed as valid-looking artifacts. Any admission system that relied only on a signature could incorrectly accept them.
- **Fix:** order lists, single-order reads, ticket lists and idempotent checkout replay filter against canonical `VALID` ticket IDs before signing. Historical order totals and seats remain unchanged.
- **Recommendation/status:** regression tests revoke/use both tickets and verify reads and replay return none. Copies already issued remain cryptographically valid; a real scanner must authenticate, check current event/order/ticket state and atomically mark a ticket used. No such admission service exists. Cancellation/refund propagation and signing-key rotation remain unresolved (R05).

### S06 — Medium: unsafe login return-path normalization

- **Scenario:** `next=/\outside.invalid` passed a leading-slash check, while the browser URL parser interprets backslashes as URL separators and resolves it to another origin. Navigation fallback behavior can turn this into a phishing redirect.
- **Impact:** potential outbound post-login navigation; not a demonstrated session-token disclosure. The original full exploit chain was not exercised against an external domain.
- **Fix:** canonical same-origin return paths only; protocol-relative URLs, backslashes, control characters, whitespace and absolute URLs fall back to `/seats`.
- **Recommendation/status:** malformed-path unit tests and a production-build browser login confirm the malicious return path stays on the app's origin. Maintain this validation at every future redirect boundary.

### S07 — Low: public availability route disclosed unpublished event inventory

- **Scenario:** an unauthenticated caller guesses a draft/cancelled event ID and calls its availability summary. Unlike detail/seat routes, the summary did not check publication status.
- **Impact:** prelaunch section/count metadata or existence disclosure; no purchaser identity or seat ownership disclosure was observed.
- **Fix/status:** summary now requires `ON_SALE`, otherwise returns 404. A self-contained draft-event regression verifies both inventory endpoints deny access. Treat artist/venue catalogs as public; they are not a confidential planning store.

### S08 — Medium, conditional: local development services published to all host interfaces

- **Scenario:** another machine on a developer's reachable network connects to the Vite/preview listener or Compose port, exposing development/test-payment behavior and any local test accounts.
- **Impact:** unintended network access to a local-only application.
- **Fix/status:** root dev/preview commands and the Compose published frontend port bind loopback. Container-internal API listening on all interfaces is needed for service communication; PostgreSQL/API are not separately published by Compose. Native operator-supplied `HOST` values can override defaults and must be reviewed. This is not a firewall or TLS implementation.

### S09 — Low, local threat: email capture file handling lacked explicit path/symlink defenses

- **Scenario:** a local actor pre-creates a capture-path symlink, or a future caller supplies a non-UUID order identifier. The previous transport would write through the constructed path.
- **Impact:** overwrite/disclosure of files accessible to the worker. Current remote API-generated order UUIDs already prevent direct HTTP path traversal; no public arbitrary-file-write exploit was found.
- **Fix/status:** validate UUIDs, reject a symlink capture directory, open files with `O_NOFOLLOW`, restrict new directories to 0700 and capture files to 0600. Traversal, file-symlink and file-permission regressions pass on Linux.
- **Recommendation:** keep the directory and ancestors private. Existing directory permissions, hostile parent replacement, hard links by the same OS user, Windows behavior, retention and encryption are not solved by this patch.

### S10 — Medium, deployment integrity: fixture authentication/checkout could enter a deployable frontend

- **Scenario:** a build environment sets `VITE_USE_FIXTURES=true`, test mode or the Node fixture flag and publishes a simulated frontend that bypasses real account/booking flows.
- **Impact:** misleading local ticket creation and potentially persisted mock contact data. This does not bypass backend authorization or create canonical paid orders.
- **Fix/status:** Vite deployable builds fail closed for those fixture settings. Explicit fixture development/QA remains available. `security:check` launches a build with the fixture flag and verifies rejection.

### S11 — Low: CI token permissions were implicit

- **Scenario:** a compromised build dependency/action abuses a repository token with permissions inherited from organization defaults.
- **Impact:** repository changes if a broader token policy had been configured.
- **Fix/status:** workflow explicitly requests `contents: read`. Dependency audit and security regression checks are now CI steps. Mutable action/image tags and dependency-install script trust remain supply-chain risks (R08); remote CI was not executed here.

## Open findings and release risks

| ID / severity | Realistic attack scenario and impact | Fix recommendation / current status |
| --- | --- | --- |
| R01 **High** — database privileges | Local Compose uses the PostgreSQL bootstrap role for both API and migrations. The isolated test connection was confirmed superuser, create-role/create-db and bypass-RLS capable. An application compromise or leaked DB credential could therefore control the entire database instance. This does not establish the permissions of an unknown deployed database. | Separate a restricted DML application/worker role from the migration owner, revoke unnecessary schema/public privileges, scope network access and configure verified TLS for remote DB connections. No live credentials or operator roles were changed. Local probe had `ssl=false`, appropriate only to this isolated loopback test environment. |
| R02 **High** — credential stuffing and inventory abuse | Login is limited to ten attempts/minute per peer address in process memory. A probe confirmed changing the peer IP permits another attempt for the same account, while spoofing X-Forwarded-For alone does not. Distributed attackers/replicas evade the limit. Unverified throwaway accounts can hold up to six seats per event repeatedly, denying availability and adding bcrypt/DB load. | Add distributed account/IP/device-aware controls, monitoring/backpressure and a reviewed identity/hold-abuse policy; staff MFA and email verification before public sales. No CAPTCHA/account-lockout feature was added. Existing holds retain their first expiry while active, but releasing/reacquiring or creating accounts defeats a simple per-hold timer. |
| R03 **Medium** — reverse-proxy limit identity | Fastify intentionally uses `trustProxy:false`; behind nginx, customers share the proxy peer address. One attacker can consume the common login allowance and deny login to others. | Set a narrowly trusted proxy topology/CIDR and upstream isolation, then test client-IP propagation and shared limits. Blindly trusting arbitrary forwarded headers would enable bypass; deployment trust boundaries were not guessed in code. |
| R04 **High** — public TLS and backups absent | Reusing HTTP development configuration on an exposed host allows interception of non-Secure development cookies. Database loss/ransomware or a faulty migration has no provisioned, demonstrated restore path. | Provision/test TLS, certificate renewal, HTTPS redirects/HSTS, managed secrets and encrypted database storage/connections; implement offsite backups/PITR, restore drills and measured RPO/RTO. Production config requires an HTTPS origin and Secure cookies, but cannot prove actual transport. Compose is local HTTP development only. No backup or restore was executed. |
| R05 **High** — real fulfillment/admission lifecycle absent | An offline scanner accepting only signed QR data cannot reject copied, used, revoked or cancelled tickets. Administrator event cancellation does not implement financial refunds or automatic ticket revocation. | Keep real sales/admission disabled. Implement authenticated atomic check-in, live status validation, event cancellation/refund reconciliation, signing key IDs/rotation and audit trails as separately scoped work. S01 and S05 reduce exposure but do not supply these systems. |
| R06 **Medium**, requires direct DB write — incomplete state invariants | A rolled-back probe could set an available seat to `SOLD` without an order item. Event/section venue changes made directly in SQL can also bypass checks triggered only on inventory/item writes. A compromised privileged writer could corrupt inventory/history despite API validation. No anonymous route for these writes was found. | Restrict writers (R01), enforce the existing event-lock protocol in every writer, reconcile data before introducing deferred state/relationship constraints. No destructive schema rewrite or historical migration edit was performed. Probe intentionally rolled back and created no sale. |
| R07 **Medium** — resource exhaustion / privacy operations | Whole-catalog bootstrap and `/events` load the catalog before slicing; event locks serialize holds/quotes/orders. Session/account creation and some metadata lists are not globally bounded. Local captures and order snapshots contain contact PII with no retention/deletion/central audit policy. | Benchmark realistic hot-event load, bound queries and pools, add shared admission/backpressure and account/session quotas, define PII retention/encryption/access policies and monitored worker/dead-letter handling. No stress attack against shared resources was performed. |
| R08 **Medium**, conditional supply chain/container compromise | Docker/CI use mutable tags, Docker builder has dependency/install-script access, frontend nginx default entrypoint begins as root, and no container image vulnerability scan or hardened runtime sandbox is provided. An upstream compromise or container exploit has broader effects. | Pin reviewed digests/action SHAs, verify provenance, scan final images, validate a non-root/read-only nginx runtime, drop capabilities, restrict egress and resources. Backend runtime already uses `USER node`. Recipes could not be executed without Docker; no arbitrary digest/tag upgrade was invented. |
| R09 **Low** — registration enumeration and account lifecycle | Duplicate registration returns conflict while a fresh email succeeds; attackers can infer registration. Sessions last up to 12 hours, with no staff MFA, recovery, idle timeout or remote device-revocation UI. | Choose a registration privacy policy and verified-email flow; add staff MFA/recovery and session lifecycle controls before public operation. Login errors are generic and unknown-account attempts take the bcrypt comparison path. Existing behavior was not changed into a new feature. |
| R10 **Low** — partial CSP and observability assurance | nginx allows inline styles needed by the current UI. Production header behavior, caching at an external CDN, security log retention/alerting and browser history/cache behavior on real devices were not verified. | Validate headers/cache policy on actual HTTPS responses, preserve script restrictions and avoid adding unsafe HTML sinks; review style nonces/hashes if feasible. Centralize privacy-filtered audit/security logs and test retention/access. No claim of exhaustive secret/history/log scanning is made. |

## Coverage and controls observed

| Requested area | Reviewed behavior / evidence / limit |
| --- | --- |
| Frontend XSS and unsafe rendering | React renders text; selected source scan found none of the checked raw HTML assignment, dangerous React HTML, eval/function-constructor or document-write sinks. API errors render as text. Admin image inputs are restricted to local WebP paths; external map destination is encoded. Not an exhaustive browser fuzzing or third-party code analysis. |
| Sensitive data / browser storage | Live orders remain in memory; stale mock orders are removed during catalog load; auth tokens are HttpOnly cookies. Booking persistence excludes attendee/card fields. Browser journey confirms orders are not stored under `vibetix-orders`, and actual order POST contains no card fields. Cart/seat/order identifiers and preferences are local metadata, not authentication authority. Never enter real card details in the simulation. |
| CSRF / CORS / headers | Exact configured Origin required on unsafe methods, including login/logout. Missing, `null` and attacker origins rejected in probes. Strict SameSite plus production Secure/HttpOnly host-only cookie; fixed CORS origin does not reflect attacker input. Private API responses use `no-store`. Same-origin XSS or compromised allowed origin still defeats these assumptions. nginx header directives inspected statically; live TLS/proxy not tested. |
| Authentication / authorization / sessions | Random 256-bit tokens stored as SHA-256 hashes, absolute 12-hour expiry, per-request DB role lookup, logout deletes session. Public-user projection excludes password hashes. Owner-scoped orders/holds/favorites and explicit admin checks inspected. Tests cover fake cookies, expired/revoked sessions, customer/admin separation and foreign-order 404. No public role setter found. |
| Passwords / brute force | bcrypt cost 12; minimum 12 characters, maximum 72 UTF-8 bytes enforced by service; generic login failure/dummy hash. Unicode oversize rejected. Distributed/per-account defenses remain R02, recovery/MFA R09. |
| Validation / mass assignment / SQLi | Strict shared Zod request schemas, explicit service field mapping, 32 KiB body cap, bounded pagination/seat arrays, duplicate seats disallowed. SQL uses Prisma queries and parameterized tagged templates, including event locks; no unsafe raw SQL call found in reviewed runtime source. Payload mass assignment, SQL-like event IDs, oversized/malformed JSON and sanitized errors exercised. These probes do not prove absence of all injection paths. |
| Holds / pricing / orders / payments | Per-event PostgreSQL row lock, transactionally checked owner/live hold, server database prices/promos/integer cents, maximum six seats, unique order item per inventory row and per-user idempotency key with request fingerprint. Existing tests verify two-account race, concurrent idempotent checkout, stale/failed payment release, forged prices, extras/promo boundaries and ownership. Full-stack browser verifies persistent exact holds, checkout and worker expiry. All payment tests are explicitly local simulation. |
| File handling / SSRF | No upload endpoint or user-selected server HTTP fetch found in reviewed services. UUID-only local email capture hardened/tested (S09). Frontend map link does not cause server fetch. OS/private-directory compromise is outside this boundary. |
| Logging / errors | Request serializer omits query strings; configured redaction covers cookie/auth/set-cookie; bodies are not logged by application serializers. Server errors log request ID/error type rather than raw Prisma errors or payloads; worker stores generic transport failure. Malformed/oversize probes reveal no tested stack/SQL/password-field strings. Full deployed log pipeline and arbitrary dynamic URLs still require privacy review. |
| Prisma / constraints / migrations | Unique event-seat, order-item, ticket identifiers, session hashes, favorites and user-idempotency relationships; FK checks; nonnegative/balanced money and coordinates/capacity checks; venue/item triggers; outbox uniqueness and normalized emails inspected. Existing tests exercise negative-price and cross-venue rejection. No SQL concatenation found. Existing migration history retained; no new migration needed. Migration/app role separation, backup/rollback rehearsal and stronger state invariants remain open. Local startup migration+seed must not be reused as production deployment policy. |
| Secrets / deployment / dependencies | Environment-based credentials, ignored restricted local env files, placeholder signing keys rejected, explicit admin bootstrap only, build context hardened. Limited source/dist private-key/AWS pattern check passed; private directories, Git history and remote secret stores were not scanned. This directory has no usable Git repository metadata. Dependency registry audit reports zero known advisories at audit time; not assurance against unpublished vulnerabilities. |

## Verification and evidence

Executed against current local code; ignored artifacts contain test evidence, not deployment certification:

| Check | Result / evidence |
| --- | --- |
| Frontend and backend typecheck | Passed; `artifacts/security/verification.log` |
| Frontend unit tests | **18 passed**, including malformed return paths, late account/session responses and broadcast sender isolation; same log |
| Backend integration/security tests | **15 passed**, zero skipped; real isolated PostgreSQL; `artifacts/security/backend-tests.log` |
| Frontend and backend builds | Passed; `artifacts/security/build.log` |
| Production-build real browser/API/DB journey | Passed, 11 recorded checks, including cross-tab logout, malicious return path, responsive/axe states and worker expiry; `artifacts/security/fullstack-browser.log`, `artifacts/fullstack/qa.json` |
| Existing frontend Chromium QA | **32 passed**, zero failed/skipped, including journey, resilience, responsive and accessibility checks; `artifacts/security/legacy-qa.log`, `artifacts/security/legacy-qa.json` |
| Formatting | Passed; `artifacts/security/verification.log` |
| Dependency audit | `pnpm audit --json`: **0 known advisories** across reported 362 dependencies; `artifacts/security/dependency-audit.json`. No dependency changes were required in this audit. |
| Focused security checks | Passed checked unsafe sinks, Docker exclusions/copy scope, backend user, loopback publication, CI permissions, static nginx directives, limited credential patterns and rejected fixture build; `artifacts/security/static-checks.json` |
| Bundle and image audits | Passed: entry JS **121,695 gzip bytes**, CSS **14,437 gzip bytes**; budgets 150,000/20,000. Twenty rasters, **1,136,344 bytes**, zero image-audit problems. These are size budgets, not a new load benchmark. |
| DB privilege/state probes | `artifacts/security/database-review.json`: isolated role is superuser; remote/TLS deployment unknown; SOLD-without-order probe succeeded and was deliberately rolled back. |

The first new browser run caught a same-document broadcast reload; it was fixed and the complete real journey rerun successfully. An initial focused-check invocation was blocked by the process sandbox; the allowed rerun passed. Neither failure is represented as a successful run.

Docker/nginx runtime, image CVEs, public HTTPS, remote CI, production DB roles/secrets, backups/restores, Safari/WebKit, live-provider payments and admission were **not verified**. Previous Firefox/visual/performance results are historical and are not presented as fresh security evidence. No destructive test, production scan or load test was performed.

## Release decision

**Security/production sign-off: NOT APPROVED.** The safe fixes reduce demonstrated risks without changing the application's architecture or UI. Resolve R01–R05 and operational release gates, validate deployment-specific controls and obtain a fresh scoped assessment before handling real customer payments, admitting real tickets or publishing this development stack.

Supporting guidance: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Docker build secrets](https://docs.docker.com/build/building/secrets/). These explain control boundaries; local findings above come from repository review and recorded probes.


## Staging sprint follow-up: UTC scheduling boundary (2026-10-15)

**Severity: High (deployment-dependent).** The new real outbox backoff test found that comparing UTC `timestamp` fields to a timezone-aware database clock could make future retries eligible early in a non-UTC PostgreSQL session; availability used the same mixed comparison. A client repeatedly triggering failing jobs could amplify retries. Non-UTC defaults can also skew historical session/audit timestamps. Safe fixes: explicit UTC clock comparisons/worker age calculation, UTC settings for the dedicated runtime/migrator roles, and a fail-closed production startup/preflight UTC gate. The regression workload deliberately runs retry selection in an Asia/Tehran transaction and preserves the backoff assertions. Existing data requires operator review, not a blanket timestamp rewrite. Final execution and remaining gates are recorded in [STAGING_RELEASE_REPORT.md](docs/STAGING_RELEASE_REPORT.md); this follow-up does not grant production security approval.
