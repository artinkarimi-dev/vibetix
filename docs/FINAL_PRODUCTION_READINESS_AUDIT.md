> Scope update (2026-10-15): this report retains historical commercial findings. For the current portfolio-demo classification, implemented fixes, fresh verification and verdicts, use [PORTFOLIO_PRODUCTION_READINESS.md](PORTFOLIO_PRODUCTION_READINESS.md). Commercial gaps are not automatically demo blockers.

# Final production readiness audit — VIBETIX

Date: 2026-10-15 (Asia/Tehran). **Final recommendation: NO-GO for real ticket sales and admission.**

## Executive summary and counting rules

**31 confirmed remaining work items: 19 production blockers and 12 nonblocking improvements.** This is a finite, evidence-backed backlog for the current repository and the launch profile below, not a claim that all future vulnerabilities or business requirements are knowable. It is **not 31 security vulnerabilities**: the inventory separates reproduced defects, missing implementations, business decisions and unexecuted external qualification gates. A missing test result is not proof that the target system is broken.

The current architecture is a credible full-stack foundation: React/TypeScript/Vite → same-origin Fastify API → Prisma/PostgreSQL, shared Redis abuse protection and a separate expiry/outbox worker. Locally verified ownership, transactional inventory, server quotes, idempotency, production simulation rejection and recovery controls should be preserved. No architecture replacement is required. The last security finding FSR-001 is fixed and its regression passes; it is **not** counted as remaining work.

**Core commercial workflow is incomplete.** Discovery, account access, holds, quotes and simulated orders work for the supported fixture catalog. Production checkout deliberately returns 503; real provider fulfillment, usable admin MFA, notifications and online QR admission are absent. Passing local tests does not change that result.

**Launch profile used for these counts:** one approved market/currency and a small vetted catalog, known supported venue layouts, at most 100 seats per section and delimiter-free URL-safe initial event IDs. Online admission is required; transfers, resale, offline entry, a full admin dashboard/CMS, multi-region writes, image CDN, new analytics and waiting rooms are not automatically required. N002/N003 must become gates if launch data exceeds their documented limitations. P008 requires checking that condition before approving any real offer; no unsupported venue may be quietly published.

Three blockers are entirely repository engineering with no provider/production credentials: **P010 (bootstrap isolation), P011 (ticket-state refresh/status), P019 (real-catalog home/navigation)**. Other blockers have repository work that can be prepared, but cannot be closed automatically without approved business rules, provider/host access or human qualification. All blockers remain open in this audit; no application implementation, data or infrastructure was changed.

## Scope, method and limits

Started with `docs/FINAL_SECURITY_REVIEW.md`, then examined current manifests/lock/workspace, configuration examples, router/pages/components/state/API clients, backend routes/services/auth/security, schema and all three migrations, tests and test configuration, worker/outbox, operation scripts, Docker/Compose/nginx, CI, assets and current/historical reports. Initial file identities are recorded in `artifacts/production-readiness/source-inventory.json` (196 files); an inventory is not a claim that every line was manually reviewed.

Used current code/data-flow traces, a fresh complete `release:verify` execution, an additional fresh recovered-database integrity execution and targeted browser/schema probes. The latter intentionally use synthetic API responses to isolate frontend contracts; **they are not evidence of real external infrastructure, payments, email or admission**. Each finding states its evidence level. Prior public release/native/browser evidence was copied under `artifacts/production-readiness/prior-evidence/` before rerunning; private lab directories were retained and excluded from that copy.

No deployment, DNS/provider setting, production data, user secrets or real payment configuration was changed. Only the two requested documentation files and ignored audit evidence/probes were added; routine checks regenerated build/Prisma/QA outputs. No new product features or application fixes were attempted in this assessment.

Git status failed because this directory has no usable Git repository. Docker/Podman, container scanners, full SAST/history secret scanners and GitHub CLI are absent. No authorized real host/domain/provider/monitoring/offsite target was supplied. Default Playwright Firefox/WebKit executables are absent; Chromium was run using the supplied `/tmp/vibetix-browser/chrome-linux64/chrome`. Missing tools/services are reported as unexecuted, never passed. Actual external capabilities may exist outside this workspace; this report does not assert otherwise.

## Current architecture, security and reliability assessment

| Area | Verified current behavior | Practical boundary |
| --- | --- | --- |
| Identity/authorization | Bcrypt cost 12; UTF-8 password limit; random hashed DB sessions; owner-scoped orders/tickets/holds/favorites; customer/admin separation; account-switch invalidation; generic duplicate registration/login errors | Customer recovery and real staff MFA remain P005/P006. A route guard is not an authorization boundary. |
| HTTP/input | Strict mutation schemas, 32 KiB body cap, exact unsafe-method Origin and CORS, secure host-prefixed production cookie, no-store private responses, fixed public errors, exact proxy trust and redacted structured events | Real edge/domain/TLS/log sinks require P012/P015; no newly reproduced XSS/SQLi/CSRF or IDOR bypass was found in this scope. |
| Inventory/price | Shared event lock across holds/quotes/checkout/expiry/admin event edits, database clock, unchanged hold expiry, server cents/promos, unique sale relationships and money/venue constraints | Keep the protocol. Real asynchronous payment leases and agreed commercial prices are P002/P008; capacity is P017. |
| Database | Distinct runtime/migrator identities, narrow grants, TLS/UTC/pool bounds, append-only runtime audit, forward migration/preflight/integrity tools | Actual managed service, encrypted storage/access policy, release gating, offsite recovery and grant drift remain P012/P014/P016/N008. Runtime SQL credentials span customers; they must stay private. |
| Ticket lifecycle | Fresh reads/replay suppress used/revoked tickets and cancelled/draft events; owner checks remain effective | Cached UI P011, cancellation/refund/reschedule P004 and authoritative admission P003 remain. A printed/downloaded QR cannot be recalled by suppressing later reads. |
| Worker/recovery | Expiry, expired-session cleanup, local outbox retry/backoff/terminal failure/restart, clean shutdown/drain, dependency failure/recovery and authenticated encrypted logical restore passed | Network delivery is not implemented. No claim of managed failover, PITR, external alerts or production-scale recovery. |
| Frontend/UX | Lazy routes, local WebP assets, keyboard/reduced-motion and automated axe checks; seven main screens over desktop/tablet/mobile widths; render isolation and bundle budgets pass | Empty/changed catalog, boot restoration and ticket cache probes expose defects. Other engines/manual AT/real-provider UI require P018. |
| Maintainability | Thin routes, shared schemas, service transactions, explicit provider boundaries and immutable migrations are usable foundations | No lint script; historical documentation drift and small-catalog assumptions are tracked, not reasons to rewrite the app. |

## Workflow-by-workflow sign-off

| Workflow / controls inspected | Current result and evidence | Remaining gate |
| --- | --- | --- |
| Home/discovery/search, event/artist/venue detail, favorites | Normal seeded-catalog routes, links, filters, keyboard search, saved favorites and responsive discovery pass existing QA; unauthenticated favorites show an authentication error | P008 real data; P010 bootstrap and P019 nonseed home. Preview video is intentionally disabled/coming soon, not a broken required launch feature. |
| Register → login → reserve | Actual local API/database sessions, HttpOnly cookie, exact-seat holds and refresh restoration passed | P005/P006; cancelled restored hold fails boot under P010. No guest checkout is promised or required. |
| Seat map → exact selection → extras → review/promo | Real holds/quotes and authoritative price validations pass; one winner in same-seat races; sold/unavailable/foreign/duplicate/over-limit selections rejected | P008 truthful inventory/benefits; N001/N002/N003 supported-data limitations. No sold-out waiting list is required. |
| Checkout → order creation | Success/decline and transactional/idempotent behavior tested using explicit simulation. Client cannot submit authoritative money/status | **Real production checkout is nonfunctional by design: P002.** No card fields were sent to VIBETIX API. |
| Confirmation → digital ticket → print/calendar/directions/share | Ticket cards, actual QR rendering, browser print, calendar download, encoded map link and event-only sharing work for test orders; no private order/token in shared event URL | Test receipts are not paid/admissible tickets. P002/P003/P009 and cached-state P011. Browser native share has an appropriate fallback; real venue device/print acceptance remains qualification. |
| My Tickets → order history / foreign links | Real per-account persistence and refresh pass; foreign owner gets 404, logout/account switch clears account views | P010/P011; N004 older-than-100 history. No account deletion/refund is currently offered by these pages. |
| QR verification → venue entry | **Not implemented.** Signing/rendering is not verification, expiration enforcement or replay consumption | P003. No test claims genuine admission. |
| Cancellation / unpublished / changed event | API rejects new holds/quotes/orders; fresh reads/replay suppress affected tickets. Event row edit is audited and locked | No refund/customer notification/current-status workflow; stale cached credentials and cancelled-hold boot are P004/P011/P010. Immutable receipt metadata must not be silently rewritten. |
| Used / revoked / expired ticket | USED/REVOKED projection suppression passes. Schema has these states; expiration must be derived from approved admission window | No status-changing staff API or online time/replay enforcement: P003/P004. A signature alone is never entry authority. |
| Failure / repeated submit / expired hold / unknown outcome | Expiry/release, two-user races, changed-payload idempotency conflict, duplicate submission and worker/database/Redis interruption tests pass locally | Provider unknown outcomes, late settlement and refunds need P002/P004; standalone legacy failure test needs explicit fixture flag (N012). |
| Mobile/desktop/account/error navigation | Chromium normal routes, empty/not-found/guards, retry UI, desktop/tablet/mobile axe and cross-tab logout pass | Targeted empty catalog/nonseed/missing sections/cache cases and manual/browser matrix described in inventory. No universal device/accessibility certification. |

## Fresh verification and evidence

No prior conversation test result is used as a substitute for this run. Root command:

```sh
PNPM_STORE_DIR=/tmp/vibetix-pnpm-store QA_CHROMIUM_EXECUTABLE=/tmp/vibetix-browser/chrome-linux64/chrome pnpm release:verify
```

**Exit 0**; the release script explicitly labels only local/staging engineering ready and sets `publicProductionApproved=false`. Full commands/exit codes/durations: `artifacts/release/final-verification.json`; progress: `artifacts/production-readiness/verification.log`. No resume flag was used.

| Executed command / group | Fresh result |
| --- | --- |
| `pnpm install --frozen-lockfile --store-dir=/tmp/vibetix-pnpm-store`; `pnpm db:generate` | Passed; manifests/lockfile unchanged. |
| `pnpm format:check`; `pnpm typecheck`; `pnpm backend:typecheck` | Passed. Prettier and TypeScript are not a substitute for an absent linter. |
| `pnpm test` | 18 unit tests across 3 files passed. |
| `pnpm build`; `pnpm backend:build` | Both production builds passed. |
| `pnpm build:audit`; `pnpm images:audit` | Passed; entry JS gzip 121,695 bytes / 150,000 budget, CSS 14,437 / 20,000; 20 WebP raster assets, 1,136,344 bytes and zero asset-audit problems. This does not check unpublished database-provided image filenames. |
| `pnpm security:check` | Passed narrow source/build/config/secret-pattern and negative fixture/public-variable build checks; not exhaustive SAST/history/image scanning. |
| `pnpm audit --json` | 0 known advisory matches at all severities; 143 production + 222 development = 365 total dependencies. No dependency upgrades/waivers were made. Registry advisory coverage does not establish absence of unknown issues or OS/container CVEs. |
| `pnpm test:e2e` with supplied Chromium | 32 tests passed: explicit fixture UI journey, resilience, responsive/accessibility and render checks. Fixture results are not backend/provider proof. |
| `pnpm test:preproduction` within root run | All 17 groups passed, including 30 backend/service/security tests, real native TLS PG/Redis/nginx, ownership, same-seat/idempotency/expiry, shared limits, grants/MFA boundary, graceful shutdown, failed migration recovery, DB/Redis outages, outbox retries/crash and encrypted recovery. Includes all 11 real-API browser groups and 3 desktop + 3 mobile lab startup samples. |
| `pnpm --config.store-dir=/tmp/vibetix-pnpm-store licenses list --prod --json`; `node scripts/create-runtime-sbom.mjs`; `node scripts/build-checksums.mjs` | Passed inventory, SBOM and output identities; neither proves remote provenance or container safety. |
| `node artifacts/release/post-restore-rehearsal.mjs` | Another new disposable TLS database restored from this run's encrypted archive; actual `scripts/ops/integrity.mjs` verified all 3 migration checksums and zero violations in 14 business checks. Log: `artifacts/production-readiness/post-restore-integrity.log`. |
| `pnpm run lint` | **Unavailable / exit 1**: ERR_PNPM_NO_SCRIPT. N007; not relabelled passed. |
| `QA_CHROMIUM_EXECUTABLE=/tmp/vibetix-browser/chrome-linux64/chrome pnpm test:payment-failure` | **Failed / exit 1** after 30-second seat-button timeout with current full-stack defaults. N012, retained in `payment-failure-default.log`. |
| `VITE_USE_FIXTURES=true QA_CHROMIUM_EXECUTABLE=/tmp/vibetix-browser/chrome-linux64/chrome pnpm test:payment-failure` | Passed explicit legacy simulation branch: no order, held selection retained, retry enabled and no card persistence. Does not fix the default script or prove a provider decline. Evidence: `payment-failure-explicit-fixture.log`. |

Native test scope was localhost PostgreSQL 18.4 / Redis 7.0.15 / nginx 1.24.0 with disposable identities, private local CA and databases, not production container versions. Load exercised 24 booking accounts, 120 concurrent reads and 297 measured requests, 32 same-key retries and a shared-budget burst; all 14 business-invariant violation counters were zero. The restored snapshot retained 40 orders and 40 tickets. Local initial-window performance samples are in `artifacts/fullstack/performance.json`; they are not Lighthouse, field INP/RUM or a production SLO. No retuning, architecture refactor or broader security guarantee is inferred.

### Targeted current-production-frontend / schema probes

Executed with `node --import tsx artifacts/production-readiness/<name>.ts`, using fresh preview ports 5190–5193 and the current production build. API responses are controlled synthetic contracts, explicitly separated from the native integration tests:

| Probe file | Observed result |
| --- | --- |
| `frontend-probes.ts` / `.json` | Empty catalog blocks /account; missing fictional primary event breaks home; no venue sections reaches the route error boundary. |
| `cache-probe.ts` / `.json` | Cached ticket navigation made zero detail requests and displayed the stale QR; reload got suppressed tickets but retained confirmed composition without an explanation. |
| `pagination-probe.ts` / `.json` | With available=101 and nextOffset=100, UI made one seat request and rendered 100. Actual shared schema also accepted tour:city and current parsing chose city instead of section 101. |
| `cancelled-hold-probe.ts` / `.json` | Valid authenticated /tickets initialization with an unexpired cancelled-event hold failed globally with Event not found. |

Probe exit 0 means the **reported defect/limitation was reproduced**, not that the desired behavior passed. Reproduction scripts/results/logs are retained. No user or production data was used.

### Not executed, and why

Actual Docker/Compose boot, layer/image CVE scans, remote CI/protected deployment, public domain/certificate/renewal, hosted PG/Redis/network/failover, managed secret rotation, real payments/MFA/mail/admission, offsite/PITR and alert delivery lack tools, authorized targets or integrations. Firefox/WebKit are not installed; real-device and manual screen-reader qualification need equipment/QA. Git-history provenance/secret scanning is unavailable without usable history. These are mapped to issue IDs below rather than turned into fake local passes. No deployment was attempted.

## Complete issue inventory

Each ID is one remaining delivery/acceptance item. Severity reflects launch impact, not a CVSS score. Critical missing commercial functions are not described as exploitable vulnerabilities. Evidence paths without a prefix are under `artifacts/production-readiness/`. All are open; the checklist tracks closures.

### Critical production blockers

### P002 — Implement real asynchronous payment and durable fulfillment

**Severity:** Critical. **Classification:** Missing implementation, currently fail-closed. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** backend/src/services/payments.ts; backend/src/services/booking.ts:createOrder; backend/prisma/schema.prisma; src/pages/CheckoutPage.tsx.

**Problem:** Only SimulationPayments is implemented. Production createOrder and the adapter return PAYMENTS_DISABLED; Order has only CONFIRMED/FAILED. The production provider interface is not an integration.

**Evidence / reproduction:** Current source has no payment webhook route/inbox or real provider implementation. Fresh native test confirms production checkout 503 with no sale even with an accidentally enabled simulation flag.

**Impact:** Real customers cannot pay or obtain a paid production order. Switching to development mode would create unpaid simulated sales and is not a fix.

**Exact recommended fix:** After P001, use hosted/tokenized provider UI, durable pending order/payment attempt and inventory lease, trusted amount/currency binding, signed raw-body webhook verification, unique provider-event inbox, idempotent fulfillment and reconciliation. Keep network calls outside the event transaction lock; additive migrations and narrowly reviewed grants only. Persist retry identity across remounts/unknown outcomes.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P012, P014.

**Verification / acceptance criteria:** In provider sandbox on real staging, test success, decline, authentication, timeout/unknown outcome, duplicate and out-of-order webhooks, changed amount/currency, lease expiry, crash before/after commit and replay. Exactly one paid fulfillment; expired-seat late success is compensated/reconciled. No raw card data reaches VIBETIX APIs/logs.

### P003 — Provide authenticated online ticket admission

**Severity:** Critical. **Classification:** Missing implementation, not a proven admission bypass. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** backend/src/services/booking.ts:ticketToken/activeTicketIds; backend/src/routes/api.ts; backend/prisma/schema.prisma:Ticket; src/components/booking/DigitalTicketCard.tsx.

**Problem:** QR display/signing exists, but no verification/check-in endpoint or scanner workflow. Tokens have no admission window/key identifier, and no atomic USED transition is exposed.

**Evidence / reproduction:** Route inventory contains no admission API. Ticket enum supports VALID/REVOKED/USED, but current runtime ticket grants are read/insert; UI says NOT VALID FOR ENTRY.

**Impact:** The last core workflow step does not exist. A copied signed QR must not be accepted as entry authority.

**Exact recommended fix:** Implement event-scoped staff authentication/authorization and online verification of signature/key policy plus canonical ticket/order/event/admission time. Atomically consume VALID once, audit the action and narrowly grant required status updates. Define key rotation/reissue and failure/stop-entry policy; no offline/resale design is required for launch.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P002, P005, P012.

**Verification / acceptance criteria:** Two concurrent scans of one ticket admit once; wrong event, forged signature, expired window, cancelled/unpublished event, revoked/used ticket and unauthorized staff deny. Prove rotation and lost-network behavior on actual scanner devices.

## Other required production blockers

High-priority implementation/operation gaps and medium-severity functional/qualification gates remain blocking for the supported commercial journey. External-only requirements are explicitly labelled; they are not code vulnerabilities.

### P001 — Approve a bounded commercial launch contract

**Severity:** High. **Classification:** Business/external prerequisite. **Blocks production:** Yes. **Owner:** User or delegated merchant/product/finance/operations owners.

**Affected file/component:** backend/src/services/pricing.ts; backend/prisma/seed.ts; docs/PRODUCTION_READINESS.md.

**Problem:** No approved merchant, sales jurisdiction/currency, provider eligibility, fee/tax/refund policy, actual event supplier or launch traffic/recovery objective is represented. Fixed USD fees/tax and fictional inventory are examples.

**Evidence / reproduction:** priceOrder uses 8% service fee, 350-cent processing fee and 8.875% tax; seed and UI explicitly describe fictional offers. No merchant/provider approval evidence supplied.

**Impact:** Engineering cannot safely choose settlement, tax, cancellation or operational promises for a real seller.

**Exact recommended fix:** Record seller and supported market/currency, provider feasibility, approved price/fee/tax/refund and admission rules, real event/venue authority, privacy/support owner and initial traffic/RPO/RTO budgets. Start with a small vetted catalog; no resale, transfer or offline entry required.

**Can be resolved inside this repository:** No; owner decisions, then repository configuration. **Dependencies:** None.

**Verification / acceptance criteria:** Named business/finance/operations owners approve a versioned launch contract; actual test invoices match signed-off examples and offered benefits have accountable suppliers.

### P004 — Complete cancellation, reschedule, refund and revocation operations

**Severity:** High. **Classification:** Missing lifecycle/business implementation. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** backend/src/services/admin.ts:saveEvent; backend/src/routes/api.ts; backend/prisma/schema.prisma:Order/Payment/Ticket; backend/src/security/audit.ts.

**Problem:** Admin can cancel/unpublish or edit event time, but there is no customer cancellation/refund/dispute/reconciliation workflow or audited ticket-revocation endpoint. Historical order snapshots keep the purchased event details.

**Evidence / reproduction:** Only event/artist/venue admin mutations exist. REFUND_REQUESTED/TICKET_CHANGED audit type names have no corresponding operations. Current projection suppression is tested and is not a refund or notification.

**Impact:** Paid customers would lack a supported response to cancellations/reschedules; changed dates and financial state could diverge without notification/reconciliation.

**Exact recommended fix:** Implement the approved lifecycle with durable provider refund/dispute identifiers, idempotent ledger/status transitions, ticket eligibility/revocation and customer notification. Expose current event status/time alongside immutable receipt facts. Provide an audited operator path and customer support contact; a large admin dashboard is unnecessary.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P002, P003, P005, P007.

**Verification / acceptance criteria:** Race cancellation/reschedule with hold, checkout, webhook, refund and scan; no new invalid sale/admission, duplicate refund or financial drift. Verify partial/failed refund handling according to the approved policy and customer communication.

### P005 — Connect real admin MFA and privileged operator lifecycle

**Severity:** High. **Classification:** Missing integration, existing gate correctly denies. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** backend/src/security/admin.ts; backend/src/services/auth.ts; backend/src/routes/api.ts:admin preHandler; docs/ADMIN_SECURITY.md.

**Problem:** No real verifier, enrollment, step-up endpoint, recovery or staff offboarding path exists. Password login never sets MFA assurance.

**Evidence / reproduction:** completeAdminStepUp is only an integration boundary; production admin routes require fresh server-owned mfaVerifiedAt. Tests inject local fake verifiers, not a real factor provider.

**Impact:** Production catalog/order/inventory administration is intentionally unusable; manual timestamp writes would undermine the gate.

**Exact recommended fix:** Integrate a real factor/identity provider with session-bound replay-resistant challenges, bounded attempts, audited enrollment/step-up/recovery and session revocation/offboarding. Retain absolute/idle session limits; define protected bootstrap and emergency access without an application bypass.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P012, P014.

**Verification / acceptance criteria:** Real-provider staging drill: valid factor works; wrong/replayed/stale/future/session-swapped proofs and removed staff deny. Recovery and emergency procedures are audited and exercised.

### P006 — Provide a secure customer identity and recovery path

**Severity:** High. **Classification:** Missing account-service capability. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** backend/src/routes/api.ts:auth routes; backend/src/services/auth.ts; backend/prisma/schema.prisma:User/Session; src/pages/AccountPage.tsx.

**Problem:** Customers can register/login/logout, but email ownership verification, password change/reset and a supported lost-account recovery path are absent.

**Evidence / reproduction:** Only register/login/logout/me auth routes and corresponding account UI exist. User has no verification/reset state. Account owners can lose access to purchased tickets with no supported recovery route.

**Impact:** Real buyers need recoverable access and a documented identity policy before payments/tickets depend on accounts. Absence is not evidence of a login bypass.

**Exact recommended fix:** Implement a narrowly scoped verified-identity/recovery flow or integrate an approved identity provider. Recovery proofs must be expiring, single-use, hashed, rate-limited and non-enumerating; revoke affected sessions after credential change. Publish the support/escalation alternative and avoid unaudited database password edits.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P005, P007.

**Verification / acceptance criteria:** Exercise valid/expired/replayed/wrong-account recovery, generic responses, throttling, session invalidation and lost-inbox support. Prove legitimate users regain only their own orders.

### P007 — Resolve offered email delivery and network outbox semantics

**Severity:** High. **Classification:** Missing provider integration. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** backend/src/services/email.ts; backend/src/services/jobs.ts; backend/src/worker.ts; src/pages/CheckoutPage.tsx; deploy/compose.production.yml.

**Problem:** Only LOCAL_CAPTURED transport exists; production forbids it and uses EMAIL_TRANSPORT=disabled, so no delivery runner starts. Checkout still offers an explicitly simulated email preference. Current job transaction performs local delivery while holding a database claim.

**Evidence / reproduction:** Worker constructs OutboxRunner only for local transport; deliver returns LOCAL_CAPTURED only. Native crash/backoff tests exercise local capture, not a mail provider.

**Impact:** Offered email tickets, recovery and event notifications cannot be delivered; simply adding network I/O to the current transaction risks timeout/duplicate sends.

**Exact recommended fix:** Choose verified transactional delivery, sender/domain configuration and provider delivery idempotency. Add durable leases/claim state, bounded network timeouts, retry classification, dead-letter operations and reconciliation. Until proven, remove email delivery from the launch offer or clearly restrict launch to mobile account delivery; P006/P004 still need a working notification/recovery channel.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P012.

**Verification / acceptance criteria:** Provider sandbox sends to controlled inboxes; crash before/after provider acceptance yields one effective message, retries/backoff/terminal alert work, and pending jobs are reconciled. Test sender authentication and bounce/support behavior.

### P008 — Onboard truthful real catalog, venue inventory, prices and extras

**Severity:** High. **Classification:** Fictional launch data / incomplete authoring boundary. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** backend/prisma/seed.ts; backend/src/services/admin.ts; src/data/ticketTiers.ts; src/components/venue/ArenaMap.tsx; src/services/catalog.ts; public/images.

**Problem:** Current events/photography/benefits and arena geometry are fictional; tier display prices/features and admin-created seat prices are globally hardcoded. Venue editing does not author sections/seats, and extras are a global illustrative catalog.

**Evidence / reproduction:** saveEvent assigns 8900/15900/29900/49900 by section tier; frontend ticketTiers uses fixed prices. ArenaMap derives one generic geometry from level/index. saveVenue changes metadata only; no seat-chart import/publish validation exists.

**Impact:** Real buyers could be shown the wrong seat chart, price range, unavailable benefit or an event without a supplier. DB uniqueness alone does not establish authority to sell a physical seat.

**Exact recommended fix:** Create a reviewed import/authoring procedure for the initial real events, canonical sections/seats/geometry, existing image allowlist and fulfillable extras. Derive displayed price ranges/benefits from approved server data. Validate references, tier/section conventions, safe initial identifiers, accessible seats, asset existence and actual capacity before ON_SALE; remove unfulfillable offers. Do not add a CMS or new-venue dashboard just to launch one vetted venue.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P005.

**Verification / acceptance criteria:** Venue/operator signs off seat labels/locations/capacity, admission rights and extras; every advertised price/fee matches the server quote; assets resolve; sold-out and accessible-seat flows are checked. Initially use supported layouts and sections <=100 seats until N002 is resolved.

### P009 — Replace inaccurate demo disclosures and approve data handling

**Severity:** High. **Classification:** Verified content defect + owner policy requirement. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** src/pages/InfoPage.tsx; src/components/event/TrustPanel.tsx; src/pages/DiscoveryPage.tsx; src/pages/CheckoutPage.tsx; docs/SECRETS_MANAGEMENT.md.

**Problem:** Privacy/About/Terms still describe a frontend-only localStorage simulation despite real server accounts, orders, contact records and shared holds. Demo/test wording is scattered throughout purchase/ticket pages. No merchant-approved retention/rights/support policy is supplied.

**Evidence / reproduction:** InfoPage claims no real authentication and no cross-browser locking, and says orders/contacts live in browser storage. Production code instead persists accounts/orders in PostgreSQL and disables real order localStorage. TrustPanel/favorites copy also refers to browser-only storage.

**Impact:** Collecting real personal data with inaccurate disclosures and presenting real sales through test copy is unacceptable. Financial retention cannot be implemented by blindly deleting orders/tickets.

**Exact recommended fix:** Publish accurate, owner-reviewed seller/privacy/terms/refund/support disclosures, data/processor inventory and retention schedule. Implement approved deletion/anonymization/access workflows and log/artifact retention with financial/audit exceptions. Keep honest simulation warnings until P002/P003 are actually validated; remove test-only card controls only with the provider UI integration.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P002, P003, P004, P006, P007.

**Verification / acceptance criteria:** Compare every customer claim to observed storage/network/provider behavior; test retention/rights procedure on disposable data without breaking financial/inventory invariants. Named policy owner approves launch text and support contact.

### P010 — Isolate account initialization from empty catalogs and stale holds

**Severity:** High. **Classification:** Reproduced functional defect. **Blocks production:** Yes. **Owner:** Frontend engineering.

**Affected file/component:** src/api/catalogApi.ts:loadCatalog; src/components/common/ApiGate.tsx; src/main.tsx; src/api/session.ts:restoreAccount; backend/src/routes/api.ts:GET /holds.

**Problem:** A successful catalog with events=[] throws and ApiGate blocks the entire router, including sign-in, existing orders/tickets and policy pages. A still-active hold on a cancelled/unpublished event is returned by GET /holds; restoration loads its now-inaccessible section and fails the same global gate even when other public events exist.

**Evidence / reproduction:** frontend-probes.json: with a valid empty response, navigating /account showed the global temporarily-unavailable heading and no sign-in form. All shows cancelled/unpublished or a fresh unseeded production catalog can produce this real API state. cancelled-hold-probe.json reproduces an authenticated /tickets visit blocked by Event not found. Source confirms saveEvent does not release holds and GET /holds filters expiry/owner, not event status.

**Impact:** Customers lose access to tickets/accounts precisely when the last public show is removed or before catalog launch; this is not just an empty discovery page.

**Exact recommended fix:** Accept empty event lists, render an empty discovery/home state and decouple account/history/policy access from public catalog population. Preserve API-outage error handling and owner authorization. Skip/reset unavailable restored booking state without aborting identity/order restoration; preserve confirmed receipts. Do not mutate/release inventory through an unauthenticated GET.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Browser tests using the real API with zero ON_SALE events: account, existing order, tickets and policy routes remain usable; discovery is empty; actual network failures still show retry. No fixture fallback. Also cancel a held event while another show stays public, then refresh: sign-in/order/ticket access works and the invalid booking is cleared or explicitly explained.

### P011 — Revalidate cached ticket state and explain invalidation

**Severity:** Medium. **Classification:** Reproduced customer-state defect; not admission bypass. **Blocks production:** Yes. **Owner:** Frontend + API engineering.

**Affected file/component:** src/api/ordersApi.ts:useRemoteOrder; src/store/orderStore.ts:saveOrder; src/pages/OrderPage.tsx; src/pages/ConfirmationPage.tsx; src/pages/TicketsPage.tsx.

**Problem:** useRemoteOrder skips the API whenever an order is cached, and saveOrder refuses same-ID replacements. Even after fresh server suppression, pages still show confirmed test composition with zero tickets and no cancellation/revocation reason.

**Evidence / reproduction:** cache-probe.json: after changing controlled server eligibility, navigating from My Tickets rendered one stale QR and made zero detail requests. Reload suppressed the ticket but retained CONFIRMED TEST ORDER without an invalidation explanation. Backend FSR-001 fix remains effective for fresh reads.

**Impact:** Customers can see stale credentials/event details and receive no actionable state after cancellation/revocation. No online admission bypass is claimed; P003 must always verify canonical state.

**Exact recommended fix:** Revalidate owner order/ticket eligibility on relevant navigation/focus, replace same-ID server records safely and show current ticket/event status separate from historical receipts. Clear stale QR/print actions after confirmed invalidation; distinguish outage/offline cached data without claiming current validity.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Live two-client/admin tests cover cached cancellation, revoked/used tickets, reschedules, account switch, 401 and failed revalidation. Old in-flight responses cannot overwrite newer account/status state; receipts remain accessible.

### P012 — Supply and qualify real private services, HTTPS and secrets

**Severity:** High. **Classification:** External configuration/qualification gap. **Blocks production:** Yes. **Owner:** User or authorized infrastructure operator.

**Affected file/component:** deploy/compose.production.yml; frontend/https.conf.example; backend/src/config.ts; scripts/ops/database-security.mjs; scripts/ops/preflight.mjs.

**Problem:** Production definitions require externally supplied immutable images, verified DB/Redis URLs, signing/abuse keys and TLS files. No usable authorized staging host/domain/managed-service configuration is supplied here.

**Evidence / reproduction:** Fresh local lab uses its own CA, PostgreSQL 18.4/Redis 7.0.15/nginx 1.24.0; production services, public DNS/certificates, network boundaries and key lifecycle were not contacted or qualified.

**Impact:** A template cannot establish public TLS, isolation, available backing services or recoverable secrets. Missing inputs fail startup rather than creating a working production deployment.

**Exact recommended fix:** Operator provisions isolated staging/production, private PostgreSQL/runtime+migrator+backup identities, authenticated TLS Redis/ACL/noeviction, canonical origin, exact trusted proxy hops, DNS/TLS renewal and protected managed secrets. Separate backup keys and bootstrap credentials; rehearse DB/Redis/ticket-key rotation and revoke old access. Run role/TLS/UTC/migration preflight on the target.

**Can be resolved inside this repository:** No, external provisioning/credentials plus target configuration. **Dependencies:** P001.

**Verification / acceptance criteria:** Authorized staging proves hostname/CA checks, public HTTPS redirect/headers/host-cookie rules, spoofed forwarding rejection, no public DB/Redis/API exposure, safe secret mounts/rotation and successful preflight/integrity. Provide target identity and timestamps, not local substitutes.

### P013 — Qualify actual immutable container images and vulnerability posture

**Severity:** High. **Classification:** Unexecuted required runtime gate. **Blocks production:** Yes. **Owner:** Release/security + infrastructure operator.

**Affected file/component:** frontend/Dockerfile; backend/Dockerfile; .dockerignore; deploy/compose.production.yml.

**Problem:** Image recipes are statically hardened but no Docker/Podman runtime or image/CVE scanner is installed here. Native services do not prove image execution or package-layer safety.

**Evidence / reproduction:** Fresh tool-availability.json and release ledger mark Docker/container scans not executed. Both Dockerfiles use digest-pinned bases/nonroot users; these are configuration evidence only.

**Impact:** Image build, Prisma engine availability, UID/mount permissions, TLS secret readability and OS vulnerabilities could differ from the native lab.

**Exact recommended fix:** Build the exact immutable release images in an approved runner, scan OS/runtime dependencies and layers for secrets, review actionable advisories, and inspect nonroot/read-only/capability/PID/memory/tmpfs/network behavior. Record image digests and match the promoted artifact; refresh reviewed bases as needed rather than blanket upgrading.

**Can be resolved inside this repository:** Partial recipe fixes; Docker/scanner execution required externally. **Dependencies:** P012, P014.

**Verification / acceptance criteria:** Both images boot with the actual mounts and managed certificates, readonly root and expected UID; API/worker/edge pass smoke/outage tests, layers contain no secrets, and scanner results have no unaccepted release-blocking findings.

### P014 — Establish source provenance, remote CI and controlled rollout/rollback

**Severity:** High. **Classification:** External release path + missing target-specific orchestration. **Blocks production:** Yes. **Owner:** User/repository owner + release engineer.

**Affected file/component:** .github/workflows/ci.yml; scripts/release-verify.mjs; scripts/ops/migration-job.mjs; deploy/compose.production.yml; docs/STAGING.md.

**Problem:** This directory has no usable Git HEAD/remote. CI is a non-deploying definition, local staging is loopback HTTP/development simulation, and production Compose is a foundation template without an enforced migration/preflight/promotion workflow. Frontend/worker container health checks are disabled awaiting platform replacements.

**Evidence / reproduction:** git status/rev-parse fail; fresh release ledger cannot execute remote CI. Production template explicitly labels itself non-turnkey and disables those probes. Native migration rollback/drain tests passed but no deployed upgrade/rollback ran.

**Impact:** No reviewable release SHA, remote passing pipeline, protected production promotion or measured target rollout/recovery can be established.

**Exact recommended fix:** Attach the preserved project to an approved Git remote; enforce reviews/checks and protected secrets/environments. Build once and promote digests through real staging. Implement a controlled release job/runbook: backup check, protected migrator job, preflight, compatible schema/app rollout, API readiness/edge TLS/worker heartbeat checks, smoke and stop/rollback criteria. Use forward fixes/expand-contract; do not run development seed or destructive rollback in production.

**Can be resolved inside this repository:** Partial; repository workflow plus remote/runner/operator authority. **Dependencies:** P012.

**Verification / acceptance criteria:** Remote CI succeeds for the exact release SHA/images; upgrade existing staged data, fail a migration safely, roll back compatible application artifacts and restore when required. Probes remove traffic appropriately without dependency-driven restart storms. No production deployment is authorized by this audit.

### P015 — Connect monitored operations and customer support ownership

**Severity:** High. **Classification:** External operational integration gap. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** deploy/alert-policy.json; docs/SECURITY_OBSERVABILITY.md; backend/src/app.ts; backend/src/worker.ts; src/components/common/AppErrorBoundary.tsx.

**Problem:** Logs, request timings, readiness and worker heartbeat exist, but collector, dashboards, real alert delivery, frontend error tracking and named on-call/support route are not configured. Payment/admission signals must be added with those integrations.

**Evidence / reproduction:** alert-policy.json explicitly says recommended hooks only. Native tests observe fixed privacy-safe events, not a collector or delivered notification.

**Impact:** Paid-but-unfulfilled orders, stalled workers, provider failures, expiry backlog or backup gaps could remain unnoticed and customers lack a verified escalation path.

**Exact recommended fix:** Wire privacy-reviewed central logging/error/metrics sinks and protected worker expiry/queue/DB-pool/lock/Redis collection. Define launch SLOs and page on payment/fulfillment/admission integrity, dependency outage, worker/backup age and migration failure. Assign on-call/support owners, access/retention controls, incident/stop-sales and dead-letter runbooks.

**Can be resolved inside this repository:** Partial; code plus approved external inputs. **Dependencies:** P001, P002, P003, P007, P012, P014.

**Verification / acceptance criteria:** Inject staging API/DB/Redis/worker/provider/backup failures; the intended human receives and acknowledges a redacted alert, follows the runbook, and receives recovery notification. Customer support contact reaches a staffed owner.

### P016 — Provision scheduled offsite recovery and prove business recovery

**Severity:** High. **Classification:** External disaster-recovery gap. **Blocks production:** Yes. **Owner:** Infrastructure/data operator + finance/payment owner.

**Affected file/component:** scripts/ops/backup.mjs; scripts/ops/integrity.mjs; docs/BACKUP_AND_RECOVERY.md; deploy/alert-policy.json.

**Problem:** Encrypted logical backup/fresh-target restore works locally; no scheduler, offsite immutable archive, managed WAL/PITR, key escrow or measured production RPO/RTO is provided.

**Evidence / reproduction:** Fresh native drill rejects wrong key/tamper/nonempty target and restores populated invariants; supplemental fresh recovery CLI verifies all three migration checksums. This is disposable local data, not offsite/PITR proof.

**Impact:** Real orders could be lost after host/region failure, and provider-settled payments newer than a recovered database could be missed or replayed.

**Exact recommended fix:** Configure backup-reader identity, scheduled authenticated encryption and independent protected storage/retention plus managed PITR/WAL. Escrow versioned keys separately. Rehearse fresh-site restore, grant reapplication, migration/business checks, provider reconciliation, stop-sales and controlled traffic return; record actual loss/time against P001 objectives.

**Can be resolved inside this repository:** Partial; scripts exist, offsite services/schedules/operator drill required. **Dependencies:** P001, P002, P004, P012, P015.

**Verification / acceptance criteria:** Restore from offsite using escrowed keys without the original host, perform point-in-time recovery and failed-migration recovery, reconcile post-recovery provider state, and meet approved RPO/RTO with delivered backup/PITR-age alerts.

### P017 — Qualify launch load, contention and abuse policy on the target

**Severity:** Medium. **Classification:** Required unverified capacity assumption. **Blocks production:** Yes. **Owner:** Engineering + operator/product owner.

**Affected file/component:** scripts/hot-event-load.mjs; backend/src/services/booking.ts:lockEvent; backend/src/security/abuse.ts; backend/src/database/client.ts.

**Problem:** Local correctness load is limited to 24 booking users and 120 concurrent reads with test payment. Per-event serialization, bounded DB pools and shared Redis limits remain deliberate; no real target/provider capacity contract exists.

**Evidence / reproduction:** Fresh hot-event-load.json records 297 requests and zero integrity violations under that scope. No target SLO, real provider latency or distributed-account abuse capacity is proven.

**Impact:** Unbounded public launch promises could cause queue/pool exhaustion, expired purchases or unavailable checkout even while transactions remain consistent.

**Exact recommended fix:** Choose conservative initial admission/traffic limits from P001; test actual staging with realistic hot events, payment/webhook delays, expiry, retries and distributed identities. Tune bounded pools/limits and enforce load shedding/stop-sales. Add a waiting room or different lock strategy only if measured demand requires it.

**Can be resolved inside this repository:** Partial; load tooling plus real capacity/traffic decision required. **Dependencies:** P001, P002, P003, P007, P012, P013, P015.

**Verification / acceptance criteria:** At approved launch traffic, p95/p99 and errors meet the agreed SLO, inventory/payment/ticket checks stay clean, overload returns bounded failures and recovery works. Record query plans/lock waits and the operational traffic cap.

### P018 — Complete supported-browser, device and assistive-technology sign-off

**Severity:** Medium. **Classification:** Required unverified UX qualification. **Blocks production:** Yes. **Owner:** QA/accessibility operator + product owner.

**Affected file/component:** playwright.config.ts; tests/e2e; scripts/fullstack-qa.ts; src/components/venue; src/pages/CheckoutPage.tsx.

**Problem:** Fresh automated journeys run in the supplied Chromium only. Firefox/WebKit executables are absent, and no manual screen-reader or real iOS/Android admission/purchase session was performed.

**Evidence / reproduction:** 32 fixture Chromium tests and 11 live-API browser groups passed; tool-availability.json records absent other engine executables. Automated axe/reduced-motion/keyboard coverage does not establish manual AT or Safari behavior.

**Impact:** The supported audience cannot yet rely on the complete real-provider purchase/recovery/ticket workflow across the actual launch devices.

**Exact recommended fix:** Declare supported browsers/devices; install engines in CI and exercise live-account/provider flows in Firefox/WebKit and actual mobile devices. Have QA perform keyboard-only/screen-reader, focus/error announcements, zoom/reflow and accessible-seat selection, including hosted payment authentication and scanner entry where relevant.

**Can be resolved inside this repository:** Partial; automated checks plus QA/devices/provider access. **Dependencies:** P002, P003, P004, P006, P008, P009, P010, P011, P019, P012.

**Verification / acceptance criteria:** Complete the entire supported journey on the declared matrix with no blocking accessibility/interaction defect. Record device/engine versions and manual AT observations; explicitly exclude unsupported targets rather than claiming universal compatibility.

### P019 — Remove fictional primary-event dependency from home and CTAs

**Severity:** Medium. **Classification:** Reproduced functional defect. **Blocks production:** Yes. **Owner:** Frontend engineering.

**Affected file/component:** src/data/events.ts:PRIMARY_EVENT_ID; src/pages/EventPage.tsx; src/router.tsx; src/components/layout/Header.tsx; src/pages/SeatsPage.tsx.

**Problem:** Home and fallback ticket links/default seat selection assume echoes-new-york exists in the live catalog.

**Evidence / reproduction:** frontend-probes.json: a successful catalog with other valid events but without echoes-new-york showed the missing-show homepage. Header links from non-event routes still point to that fictional event.

**Impact:** Replacing the seed catalog with real offers breaks the main entry route and sales CTA despite healthy services.

**Exact recommended fix:** Use a configured/validated featured event or route home to current discovery, with graceful empty-state/default event selection. Generate fallback CTAs from current catalog and handle removed featured events without inventing a purchase destination.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Browser tests cover catalog with only nonseed events, featured event removal, direct links and empty catalog; home/navigation/seat defaults remain coherent.

## Medium and low-priority nonblocking improvements

These can wait under the bounded launch profile; any item whose accepted limits are exceeded must be promoted before publishing that expanded offer. Optional improvements are not silently made mandatory.

### N001 — Guard missing/unsupported venue sections gracefully

**Severity:** Medium. **Classification:** Defense-in-depth robustness gap. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Frontend engineering.

**Affected file/component:** src/store/bookingStore.ts:startEvent; src/pages/SeatsPage.tsx.

**Problem:** startEvent falls back to getSections(...)[6] and dereferences section.id without a guard. A venue with no matching tier and fewer than seven sections can fail; a sectionless controlled response reaches the route error boundary.

**Evidence / reproduction:** frontend-probes.json reproduces missing sections. Normal saveEvent rejects an event with no physical seats, so the sectionless case requires bad/imported data or a changed catalog contract; it is not a customer privilege exploit.

**Impact:** Poor diagnostics for unsupported/imported venue data. Not a launch blocker if P008 rejects unsupported layouts before publication.

**Exact recommended fix:** Select a supported existing section with a first-element fallback; render an explicit unavailable/empty map state when none exists, and validate authoring contracts.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Test zero sections and one-to-six valid sections without premium tier; no crash and no fabricated availability.

### N002 — Consume section inventory pagination

**Severity:** Medium. **Classification:** Reproduced supported-range limitation. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Frontend/API engineering.

**Affected file/component:** src/api/catalogApi.ts:loadSection; backend/src/routes/api.ts:GET /events/:id/seats; src/components/venue/SeatPicker.tsx.

**Problem:** API defaults to 100 seats and returns nextOffset, but frontend loads one response and ignores pagination.

**Evidence / reproduction:** pagination-probe.json: availability 101, first response 100 with nextOffset=100, one request and only 100 rendered seats. Seed sections have 96, so existing QA stays green.

**Impact:** Later seats become inaccessible in larger sections. Nonblocking only for an initially approved catalog with at most 100 seats per section; otherwise promote to a launch blocker.

**Exact recommended fix:** Fetch bounded pages or provide accessible explicit pagination/virtualization; merge without duplicates and keep owner availability/selection coherent.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Real-API section with >200 seats: every seat is reachable, row filtering works, requests are bounded, and no duplicate IDs or selection loss.

### N003 — Stop deriving section metadata by splitting opaque inventory IDs

**Severity:** Medium. **Classification:** Verified schema/consumer contract defect. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Shared-contract/API/frontend engineering.

**Affected file/component:** packages/shared/src/index.ts:eventInput/id; backend/src/services/admin.ts:saveEvent; backend/src/routes/api.ts:GET /holds; src/api/session.ts:restoreAccount.

**Problem:** Event IDs allow colons, generated seat IDs concatenate colon-separated event/section/row/number, and restoration assumes split(":")[1] is the section.

**Evidence / reproduction:** pagination-probe.json: actual shared schema accepts tour:city, generated tour:city:101:1:1 restores section city rather than 101. This is schema/parsing proof, not a claimed end-to-end database test.

**Impact:** Refresh restoration breaks for such author-created IDs. Initial catalog can use vetted URL-safe delimiter-free IDs; this limitation must remain documented until fixed.

**Exact recommended fix:** Return explicit section/seat metadata in held-seat contracts and treat IDs as opaque; validate URL-safe identifiers where needed without silently changing existing identities.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Real-API refresh with a delimiter-containing event ID and multiple sections restores exact seats; existing links/orders and safe IDs remain compatible.

### N004 — Expose older customer order/ticket history

**Severity:** Medium. **Classification:** Verified bounded-history limitation. **Blocks production:** No, under the stated bounded launch profile. **Owner:** API/frontend engineering.

**Affected file/component:** backend/src/routes/api.ts:GET /orders,/tickets; src/pages/TicketsPage.tsx; src/api/session.ts.

**Problem:** Order and ticket lists stop at the newest 100 confirmed orders with no cursor/page control; old future-event tickets may disappear from My Tickets.

**Evidence / reproduction:** Both queries use take:100; UI renders only restored list. Direct owner-checked /orders/:id still supports an older saved link.

**Impact:** Long-lived or high-volume buyers need old links/support to reach older records. Not a blocker for new launch accounts; monitor before reaching the limit.

**Exact recommended fix:** Add owner-scoped stable cursor pagination and accessible load-more/history filtering; preserve direct lookup and do not return unbounded private data.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Use >100 confirmed orders including an older upcoming event; all owned history is reachable and another account cannot page into it.

### N005 — Bound and cancel browser API requests

**Severity:** Medium. **Classification:** Verified reliability improvement. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Frontend engineering.

**Affected file/component:** src/api/client.ts:request; src/api/catalogApi.ts; src/api/ordersApi.ts.

**Problem:** fetch has no default AbortController timeout; effect cleanup often ignores results rather than cancelling requests. Existing nginx API read timeout is helpful but not a complete browser/network deadline.

**Evidence / reproduction:** Source trace: request passes options directly to fetch and catches transport errors; there is no timer/cancellation policy. No production timeout incident is claimed.

**Impact:** Hung/slow transport can prolong loading and accumulate redundant work, especially during rapid section navigation.

**Exact recommended fix:** Add bounded read deadlines/caller cancellation and bounded jittered read retries respecting Retry-After. Do not retry mutations automatically without durable idempotency/reconciliation. Preserve account-revision guards.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Delayed/never-completing fetch, unmount, section switching, 429 and unknown checkout outcome reach finite accessible states with no duplicate mutation.

### N006 — Avoid full-catalog scans behind paginated endpoints

**Severity:** Medium. **Classification:** Verified small-catalog scaling limit. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Backend engineering.

**Affected file/component:** backend/src/services/catalog.ts:catalog; backend/src/routes/api.ts:GET /events,/events/:id,/artists,/venues; src/api/catalogApi.ts.

**Problem:** catalog reads all public events, artists, venues, sections and extras. Even filtered/paginated event and individual detail requests first materialize the full catalog.

**Evidence / reproduction:** Current route implementation filters/slices the result in memory; frontend bootstraps the entire catalog. Local 10-event load passes and does not demonstrate a large-catalog failure.

**Impact:** Database/query/payload cost grows with catalog size despite bounded returned event lists. Nonblocking for the small vetted launch catalog; scale only when measured.

**Exact recommended fix:** Move filters/pagination/detail selection into indexed Prisma queries and use appropriately invalidated public caching if needed; preserve no-store on private inventory/account operations.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Large synthetic catalog query plans and payloads remain bounded, search is correct and private data is never publicly cached.

### N007 — Define a genuine lint/static-analysis gate

**Severity:** Low. **Classification:** Verified maintainability/tooling gap. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Engineering.

**Affected file/component:** package.json; .github/workflows/ci.yml; tsconfig*.json; scripts/security-check.mjs.

**Problem:** TypeScript no-unused checks, Prettier and narrow security patterns exist, but no lint script/configuration is present.

**Evidence / reproduction:** Fresh pnpm run lint exits with ERR_PNPM_NO_SCRIPT; no lint pass is claimed. Source scans are not exhaustive SAST.

**Impact:** Additional hook/async/promise and code-quality rules are not automatically enforced; this is not evidence of an exploitable defect.

**Exact recommended fix:** Add a narrowly scoped TypeScript/React hooks/async lint configuration and CI script; document exceptions and avoid mass style refactoring. Maintain dependency/security scans independently.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Lint runs in CI, catches representative invalid hook/floating-promise examples and passes reviewed source without suppressing security checks.

### N008 — Align startup privilege checks with deployment preflight

**Severity:** Low. **Classification:** Defense-in-depth, no proven escalation. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Backend/security engineering.

**Affected file/component:** backend/src/security/database.ts; scripts/ops/preflight.mjs; scripts/ops/database-security.mjs.

**Problem:** Startup tests selected unsafe grants, but preflight additionally rejects memberships, database CREATE and broader migration/audit privileges such as DELETE/TRUNCATE.

**Evidence / reproduction:** Fresh restricted-role permission denials/preflight pass; source comparison confirms unequal checks. Properly provisioned roles do not have these permissions.

**Impact:** Grant drift after deployment might escape startup detection; mandatory P014 preflight prevents the known misconfiguration at release.

**Exact recommended fix:** Centralize or align a reviewed forbidden-capability policy and monitor grant changes; keep migration credentials outside runtime.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** In a disposable DB, add each forbidden grant/membership individually and prove startup/preflight deny; restore grants and verify normal startup.

### N009 — Consolidate operational docs and complete environment examples

**Severity:** Low. **Classification:** Verified documentation drift. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Engineering/documentation.

**Affected file/component:** backend/.env.example; README.md; PRODUCTION_READINESS.md; docs/PRODUCTION_READINESS.md; docs/FINAL_SECURITY_REVIEW.md.

**Problem:** Historical readiness tables still describe some already-implemented controls as missing. backend/.env.example lacks the separate migration URL/Redis/abuse configuration needed by later documented workflows.

**Evidence / reproduction:** Root readiness document labels itself historical; later docs supersede parts, but the paths remain easy to misread. pnpm db:migrate explicitly requires MIGRATION_DATABASE_URL absent from the backend example.

**Impact:** Operators can follow incomplete examples or duplicate completed work. P014 target runbook must be authoritative before deployment; general doc cleanup can follow.

**Exact recommended fix:** Link one current readiness/runbook index from older reports without erasing history. Add safe placeholders for current required dev/migration/Redis settings and distinguish simulated local, native TLS, container staging and real production.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** A fresh operator follows examples without guessing secrets/URLs, migrations use the right role, and no current control is incorrectly marked missing.

### N010 — Make public metadata match the current event

**Severity:** Low. **Classification:** Optional acquisition/content improvement. **Blocks production:** No, under the stated bounded launch profile. **Owner:** Frontend/content owner.

**Affected file/component:** index.html; src/components/layout/AppLayout.tsx.

**Problem:** Description/title defaults name fictional ECHOES; route effect updates document.title only, with no route-specific description/canonical/social metadata.

**Evidence / reproduction:** index.html has one static description; AppLayout changes title. No search-engine ranking or crawler behavior was tested or claimed.

**Impact:** Public previews can be misleading for real events; P009/P008 must at least remove false launch copy. Full event SEO/social metadata can wait.

**Exact recommended fix:** Provide correct default and route-level metadata/canonical/social descriptions for actual offers if acquisition needs them; do not introduce SSR or a framework change without evidence.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** Inspect head metadata on multiple real-event links and a chosen sharing/crawler path; avoid private contact/order metadata.

### N011 — Close or explicitly waive original-reference visual sign-off

**Severity:** Low. **Classification:** Unverified cosmetic acceptance, not a functional defect. **Blocks production:** No, under the stated bounded launch profile. **Owner:** User or delegated design/product owner.

**Affected file/component:** docs/VISUAL_SIGNOFF.md; docs/FRONTEND_FREEZE_REPORT.md.

**Problem:** Original screenshot comparison has no recorded approval; the prior visual sign-off explicitly remains unapproved. No reference images were supplied in this audit request.

**Evidence / reproduction:** Fresh responsive/axe/asset tests pass, but they cannot establish pixel fidelity to an unavailable reference. Existing audit reports are historical, not a new comparison.

**Impact:** Cosmetic fidelity remains an owner acceptance decision. This is not a reason to block a functional safe commercial launch if the owner accepts the current design.

**Exact recommended fix:** Owner supplies the four original views and reviews meaningful differences, or records an explicit waiver accepting the current validated UI. Do not redesign or add features to close this task.

**Can be resolved inside this repository:** Partial; owner references/acceptance required. **Dependencies:** None.

**Verification / acceptance criteria:** Record approval/waiver for event, seat, checkout and confirmation at agreed viewports; if visual code changes, rerun affected responsive/accessibility checks.

### N012 — Make legacy payment-failure QA explicitly self-contained

**Severity:** Low. **Classification:** Reproduced QA configuration defect. **Blocks production:** No, under the stated bounded launch profile. **Owner:** QA/tooling engineering.

**Affected file/component:** scripts/check-payment-failure.mjs; package.json:test:payment-failure.

**Problem:** The legacy browser test assumes local simulated seat controls but starts Vite without VITE_USE_FIXTURES=true, while the normal application correctly requires a real API/account.

**Evidence / reproduction:** Fresh default command timed out after 30 seconds waiting for Section 101 row 1 seat 1. Explicit fixture-mode invocation is recorded separately; neither invocation is payment-provider evidence.

**Impact:** This standalone QA command does not work as advertised with clean full-stack defaults; the passing main release/security suites do not exercise this entry point.

**Exact recommended fix:** Set explicit fixture mode only in this isolated legacy test server (or rewrite it against a disposable real API/account), document its scope and keep deployable fixture-build rejection. Do not enable simulation in production.

**Can be resolved inside this repository:** Yes, complete repository-only fix. **Dependencies:** None.

**Verification / acceptance criteria:** The unchanged documented pnpm command succeeds from a clean shell with no manually supplied fixture flag; test asserts zero order, retained seat, retry enabled and no payment-field persistence. Production build continues to reject fixtures.

## Required code versus external actions

| Resolution boundary | Concrete work / IDs |
| --- | --- |
| Entirely repository-resolvable blockers | P010, P011, P019. Can be implemented/tested using disposable local data without merchant credentials. |
| Provider/business-bound application work | P002 payments; P003 admission; P004 refunds/reschedules; P005 MFA; P006 recovery; P007 delivery; P008 publishable real catalog; P009 truthful product/data handling. Engineering can prepare implementations; closure needs approved inputs and actual integration acceptance. |
| Infrastructure/operator qualification | P012 target PG/Redis/TLS/secrets; P013 real images/scanning; P014 Git/remote CI/migration/rollout/probes; P015 monitoring/support; P016 offsite/PITR; P017 capacity; P018 supported devices/manual AT. These cannot be proven by editing Markdown or supplying dummy environment values. |
| Owner decision prerequisites | P001, plus provider onboarding/permissions, real venue/event authority, approved policies, traffic/RPO/RTO, host/domain/DNS/secrets, repository access, incident/support owners and QA availability. Use delegated authorized operators; never paste credentials into a report/chat. |
| No mandatory new platform | Existing React/Fastify/PostgreSQL/Redis/worker structure remains. No microservices, framework migration, full CMS/admin UI, CAPTCHA, waiting room, offline scanner, resale/transfer, new analytics, mandatory CDN or generic “tax engine” is required without a launch requirement or measured need. A safe catalog import and narrowly scoped operator routes are sufficient. |

External services still not integrated/qualified here: a merchant-eligible real payment gateway; trusted admin factor and customer recovery/notification channel; transactional delivery if offered; private production PG with PITR and TLS Redis/ACL; an authorized runtime/registry/CI/repository; public domain/DNS/certificate renewal; managed secret/key escrow and offsite archive; protected telemetry/alert route and staffed support/on-call; venue-authorized scanner clients. Providers may be combined where appropriate; no particular vendor is selected or assumed available.

## Exact prioritized implementation order

Order follows prerequisites; the numbered checklist mirrors it. Establishing a CI/target path early does not approve deployment. P014/P013 acceptance is rerun for the final immutable release after application changes.

1. **P001** — Approve a bounded commercial launch contract.
2. **P012** — Supply and qualify real private services, HTTPS and secrets.
3. **P014** — Establish source provenance, remote CI and controlled rollout/rollback.
4. **P010** — Isolate account initialization from empty catalogs and stale holds.
5. **P019** — Remove fictional primary-event dependency from home and CTAs.
6. **P005** — Connect real admin MFA and privileged operator lifecycle.
7. **P008** — Onboard truthful real catalog, venue inventory, prices and extras.
8. **P007** — Resolve offered email delivery and network outbox semantics.
9. **P006** — Provide a secure customer identity and recovery path.
10. **P002** — Implement real asynchronous payment and durable fulfillment.
11. **P003** — Provide authenticated online ticket admission.
12. **P004** — Complete cancellation, reschedule, refund and revocation operations.
13. **P011** — Revalidate cached ticket state and explain invalidation.
14. **P009** — Replace inaccurate demo disclosures and approve data handling.
15. **P013** — Qualify actual immutable container images and vulnerability posture.
16. **P015** — Connect monitored operations and customer support ownership.
17. **P016** — Provision scheduled offsite recovery and prove business recovery.
18. **P017** — Qualify launch load, contention and abuse policy on the target.
19. **P018** — Complete supported-browser, device and assistive-technology sign-off.
20. **N012** — Make legacy payment-failure QA explicitly self-contained.
21. **N007** — Define a genuine lint/static-analysis gate.
22. **N005** — Bound and cancel browser API requests.
23. **N008** — Align startup privilege checks with deployment preflight.
24. **N002** — Consume section inventory pagination.
25. **N003** — Stop deriving section metadata by splitting opaque inventory IDs.
26. **N001** — Guard missing/unsupported venue sections gracefully.
27. **N004** — Expose older customer order/ticket history.
28. **N006** — Avoid full-catalog scans behind paginated endpoints.
29. **N009** — Consolidate operational docs and complete environment examples.
30. **N010** — Make public metadata match the current event.
31. **N011** — Close or explicitly waive original-reference visual sign-off.

The shortest safe path is the first 19 items with a single vetted offer/venue profile, online admission, hosted payments and no unsupported delivery/extra promises. Nonblockers follow during maintenance, except where P008 discovers that the intended launch violates their limits. Removing an unimplemented offered delivery/benefit is an explicit product decision, not permission to disguise simulation as fulfillment.

## Final production deployment checklist

This is a gate summary referencing the inventory, not additional counted issues. This audit performs none of these deployment actions.

- [ ] P001: Approved seller/provider/venue/policy/traffic/recovery contract and named owners.
- [ ] P002–P007: Real sandbox payment, reconciliation, cancellation/refund, staff MFA, customer recovery, offered notifications and online atomic admission accepted end to end.
- [ ] P008–P011 and P019: Real catalog/geometry/prices/benefits/assets approved; truthful disclosures; empty/changed catalog, cancelled holds and current-ticket UI regressions passed.
- [ ] P012–P014: Actual staging services/network/secrets/TLS validated, immutable scanned images and release SHA identified, protected remote CI passed, migration/preflight/upgrade/rollback and API/edge/worker probes exercised.
- [ ] P015–P016: Delivered alerts, staffed support/on-call, key escrow, offsite/PITR recovery and provider reconciliation meet approved objectives.
- [ ] P017–P018: Target capacity and overload policy accepted; full real-provider journey passes declared browsers/devices and manual accessibility review.
- [ ] Re-run format/types/unit/integration/E2E/security/dependency/image/bundle/recovery checks for the exact final code and images; record known nonblocking risk owners/limits, then request explicit production release approval through the protected operator process.

## Remaining risk and unverified assumptions

No code audit proves absence of all vulnerabilities. Fresh narrow scans found no registry advisories or newly reproduced backend access/injection bypass, but container/OS advisories, historical secrets and external configurations remain untested. Correlated provider/network failures, load-driven contention, recovery newer-than-backup payments, stolen runtime credentials and post-deployment grant/key drift require operational controls in the blockers. Already downloaded QR copies remain bearer material; admission must always use authoritative online state.

The small catalog, section size and safe-ID profile are explicit temporary limits, not hidden assumptions. No verified provider eligibility, legal/merchant policy, actual venue chart, supported-device list, target SLO/RPO/RTO or external service quality was supplied; P001/P008/P012/P017/P018 exist to obtain that evidence. Manual claims must be signed by responsible owners, not inferred from test mocks. Assets are locally present and documented as fictional generated artwork, which does not establish authority to sell real venue/event benefits.

## What would happen if deployed today?

With missing required images/secrets/services, production setup cannot start. If an operator supplies a healthy HTTPS/PG/Redis environment, normal seeded discovery/accounts/holds/quotes can run, but production POST /orders still returns PAYMENTS_DISABLED (503), admin routes require unavailable MFA, email jobs have no production delivery runner, and no scanner can authorize entry. The catalog/disclosures remain fictional and the reproduced bootstrap/cache edge cases remain. Publishing development-mode simulation instead would create unpaid simulated orders; it is not a safe commercial workaround.

**Every core VIBETIX workflow is not yet functional for real customers. VIBETIX is not ready for real ticket buyers today.** A separately labelled internal demonstration with fictional data is a different scope and cannot close any payment/admission/operations gate.

## Final GO / NO-GO

**NO-GO — REAL SALES AND ADMISSION.** Close all 19 blocking IDs with the specified acceptance evidence, re-evaluate conditional limits/nonblocking risk ownership, and repeat final verification on the exact real staging release before a protected human production decision. The 12 nonblocking improvements do not require perfection or an architecture rewrite. This assessment authorizes no deployment and claims no security guarantee.
