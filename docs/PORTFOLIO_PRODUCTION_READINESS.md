# VIBETIX portfolio production readiness

Date: 2026-10-15. Scope: a publicly deployable engineering portfolio demo. No deployment or external infrastructure changes were performed. Commercial payments, customer recovery/email services and admission are intentionally excluded.

**PORTFOLIO DEMO: GO as a locally verified deployment candidate. REAL COMMERCIAL TICKETING: NO-GO.** Public host activation remains an explicit operator step; no deployment was performed. Historical commercial NO-GO reports are not portfolio verdicts.

## Reclassification of all 31 audit items

A = mandatory public-demo correctness/security/operational prerequisites; B = useful engineering improvements; C = commercial-only requirements; D = optional complexity. Counts: A=8, B=11, C=9, D=3. A classification does not mean an external host has been provisioned or that a commercial integration must be built.

| ID | Class | Original item | Portfolio reasoning and disposition |
| --- | --- | --- | --- |
| P001 | C | Approve a bounded commercial launch contract | A merchant/market contract is unnecessary for fictional no-money orders. |
| P002 | C | Implement real asynchronous payment and durable fulfillment | The explicit portfolio adapter provides complete simulated checkout. Real intents, webhooks and settlement stay excluded. |
| P003 | C | Provide authenticated online ticket admission | Demo QR codes never grant admission. No venue scanner or admission authority is offered. |
| P004 | C | Complete cancellation, reschedule, refund and revocation operations | Financial refunds and commercial event operations are excluded. Current demo cancellation/reschedule/revocation must still invalidate displayed tickets; that correction is implemented. |
| P005 | C | Connect real admin MFA and privileged operator lifecycle | No public privileged admin account or bootstrap is offered in portfolio mode. Existing production admin protection stays closed; real operator MFA is required before enabling commercial administration. |
| P006 | C | Provide a secure customer identity and recovery path | Verified-customer recovery is unnecessary for explicitly disposable demo accounts. Unique passwords, session safety, fictional data guidance and reset disclosure remain mandatory and are retained. |
| P007 | C | Resolve offered email delivery and network outbox semantics | Actual email delivery is not promised. The explicit portfolio outbox sink completes demo jobs without writing/transmitting contacts; worker correctness remains tested. |
| P008 | C | Onboard truthful real catalog, venue inventory, prices and extras | Authorized real catalog and merchant pricing are commercial requirements. Fictional demo catalog/fees/extras are labeled and new demo seeds use future dates. |
| P009 | A | Replace inaccurate demo disclosures and approve data handling | Truthful simulation/data disclosures are mandatory. Checkout requests no card data; account, privacy, terms, order and delivery wording now describe the actual demo. |
| P010 | A | Isolate account initialization from empty catalogs and stale holds | Empty catalogs and cancelled holds must not prevent account/history access. Catalog acceptance and safe booking restoration are implemented with regression coverage. |
| P011 | A | Revalidate cached ticket state and explain invalidation | Stale QR/ticket state is a correctness defect even in a demo. Owner reads/focus refresh replace cached data; failed reads hide cached tickets; invalidation and expiry are explained. |
| P012 | A | Supply and qualify real private services, HTTPS and secrets | Private services, HTTPS, independent secrets and proxy qualification remain mandatory before public exposure. Repository configuration and native TLS checks are available; actual host qualification is external and pending. |
| P013 | B | Qualify actual immutable container images and vulnerability posture | Container execution/layer/CVE qualification is required if that deployment method is selected. Native deployment is supported; absent Docker evidence is not replaced with a static claim. |
| P014 | A | Establish source provenance, remote CI and controlled rollout/rollback | Reproducible source/build/CI and a controlled release are mandatory engineering practice. Local frozen verification and CI exist; owner Git/remote CI and target rollout remain pending external steps. |
| P015 | A | Connect monitored operations and customer support ownership | A public demo still needs basic health/worker/storage monitoring, bounded retention/reset and an owner contact. Existing health/log/alert hooks and new operator guidance cover repository work; hosted delivery/ownership must be assigned. |
| P016 | C | Provision scheduled offsite recovery and prove business recovery | Financial offsite/PITR SLA and business recovery are excluded. Disposable demo reset/reseed plus tested local encrypted recovery provide the demonstration lifecycle; target backups can be chosen by its owner. |
| P017 | B | Qualify launch load, contention and abuse policy on the target | Existing contention/abuse/load checks are relevant engineering evidence. Target capacity must be measured for its resources; enterprise traffic qualification is unnecessary for a bounded demo. |
| P018 | A | Complete supported-browser, device and assistive-technology sign-off | Responsive, keyboard and accessible critical flows are mandatory. Automated Chromium/axe coverage is run; manual assistive-technology and other-engine support remain explicitly unqualified. |
| P019 | A | Remove fictional primary-event dependency from home and CTAs | A removed fictional primary event must not break navigation. Home/CTAs use a current event or the empty catalog/discovery state. |
| N001 | B | Guard missing/unsupported venue sections gracefully | Missing section data needs an explicit unavailable state instead of a crash or endless loading. Implemented and browser-tested. |
| N002 | B | Consume section inventory pagination | Inventory pages must all be consumed even in a demo. Implemented bounded sequential pagination with account-revision guards and 201-seat regressions. |
| N003 | B | Stop deriving section metadata by splitting opaque inventory IDs | IDs are opaque. Holds now return explicit section metadata; restoration no longer splits IDs. |
| N004 | B | Expose older customer order/ticket history | History should remain reachable. Owner-scoped stable cursor pagination and accessible older-order loading are implemented. |
| N005 | B | Bound and cancel browser API requests | Hung requests need a finite state. Twelve-second deadlines and caller abort support are implemented; mutations never retry automatically. Read retry remains explicit to avoid request storms. |
| N006 | D | Avoid full-catalog scans behind paginated endpoints | The fixed ten-event catalog does not justify a new search/query/cache architecture. Full-catalog materialization remains a documented scaling limit. |
| N007 | B | Define a genuine lint/static-analysis gate | A real lint gate is warranted. ESLint/TypeScript/React hook rules now run locally and in CI with narrowly explained exceptions. |
| N008 | B | Align startup privilege checks with deployment preflight | Startup must reject privilege drift. Production startup now checks role memberships, database/schema CREATE, migration-table privileges and audit reads/mutations as well as TLS/UTC. |
| N009 | B | Consolidate operational docs and complete environment examples | Current environment/setup guidance must be reproducible. README, environment examples, operator/reset guidance and audit index now distinguish demo scope from historical commercial gaps. |
| N010 | D | Make public metadata match the current event | Basic truthful title/description defaults are corrected. Advanced canonical/social/SEO metadata does not justify SSR or a framework change. |
| N011 | D | Close or explicitly waive original-reference visual sign-off | Unavailable original-reference approval is a cosmetic owner decision. Existing validated design is preserved; no reference fidelity or visual freeze approval is invented. |
| N012 | B | Make legacy payment-failure QA explicitly self-contained | Standalone failure QA must run with its own declared fixture mode. Corrected and included in CI; it remains a simulation test rather than provider evidence. |

The original 19 commercial blockers are superseded for portfolio scope. The original evidence remains in [the commercial audit](FINAL_PRODUCTION_READINESS_AUDIT.md) and `artifacts/production-readiness/issues.json`; neither is erased or presented as newly resolved commercial functionality.

## Implemented changes

- Fixed empty-catalog bootstrap, account/history restoration after unavailable holds, dynamic homepage/navigation defaults and missing-section states (P010/P019/N001).
- Revalidated private order details on mount, account change and window focus. Replaced same-ID snapshots; failed refreshes evict/hide cached QR data with retry. Server projections suppress cancelled/unpublished/expired/used/revoked tickets and describe current lifecycle state. Rescheduled calendars use current event time while receipts retain historical purchase snapshots (P011).
- Added complete section inventory pagination and explicit held-seat section metadata. Added owner-scoped keyset order/ticket history pagination and UI loading of older orders (N002/N003/N004).
- Added bounded request deadlines/cancellation without automatic mutation replay. Existing durable checkout idempotency and account-revision guards remain in place (N005).
- Added explicit `APP_MODE=portfolio`, limited to a dedicated `*_demo` database. Production demo checkout uses `portfolio-demo` records, always returns simulated receipts, makes no payment network call, and never accepts card fields. Legacy production simulation remains rejected, and default commercial mode still rejects checkout. No real payment/admission integration was introduced.
- Removed card number, expiry, CVC and cardholder inputs/state/validation. The strict form/API schemas reject unknown payment data. Updated account/checkout/terms/privacy/order disclosures and disabled print for unavailable tickets. Preserved layout and responsive styles without a redesign.
- Added the no-delivery demo outbox sink, plus explicit operator-only transactional reset/dry-run guards, dedicated-database checks, active-runtime/non-demo-payment refusal, and fictional future-date seed. Existing migration history/grants are preserved during reset. No working dataset was reset.
- Aligned production startup forbidden privileges with the broader deployment policy, retained restricted roles/TLS/UTC/session/CSRF/rate limits, and added focused regression tests. No schema/migration changes were needed.
- Added genuine ESLint/React hook checks, repaired standalone fixture failure QA, and updated CI for a dedicated demo test database. Added seven production-build API-contract browser regressions, six frontend units, backend adapter/reset/lifecycle/ownership assertions, production HTTPS demo checkout/replay proof and isolated reset integration checks.
- Enforced `ALLOW_DATABASE_TESTS=true` and dedicated `*_demo_test` targets before standalone full-stack QA can connect/write. Added early native-tool diagnostics and invalidated stale passing native summaries before a rerun. Unsafe target and missing-authorization rejection were verified without database access.
- Updated README, environment examples, production portfolio overlay and [operator guide](PORTFOLIO_DEPLOYMENT.md). Existing commercial reports are linked as historical context.

## Verified defects and impact

Priorities below retain the original audit triage. They describe demo correctness/availability; stale demo QR codes are not evidence of real admission or financial compromise.

| Finding | Priority | Reproduction/impact | Implemented correction |
| --- | --- | --- | --- |
| P010 | High | Empty public catalog or an unavailable restored hold interrupts account initialization and saved-order access. | Accept empty catalog; isolate invalid booking restoration; retain owner history. |
| P011 | High | Reopen a cached order after cancellation, expiry or revocation; previously displayed QR data could remain visible. | Fresh owner read on navigation/focus, replace snapshots, remove invalid QR data, hide cache on failure, show lifecycle notice. |
| P019 | Medium | Remove ECHOES from the public catalog; homepage/default CTAs point to unavailable fictional data. | Select a current event or empty discovery state. |
| N001–N005 | Medium | Unsupported sections, more than one inventory page, delimiter-containing IDs, bounded history or a hung request break expected navigation/data access. | Explicit unavailable state, complete bounded page traversal, explicit metadata, owner-scoped history cursor and request deadline/cancellation. |
| N008 | Low / defense in depth | Misgranted runtime membership, CREATE or protected-table authority could escape narrower startup checks. No privilege escalation against the correctly provisioned role was found. | Expand startup refusal policy; retain separate deploy preflight and runtime role. |
| N007/N009/N012 | Low | Missing lint, incomplete environment instructions and undeclared fixture mode make verification/setup unreliable. | Add lint and CI gates, current operator/environment docs and self-contained failure QA. |

Recommended ongoing action: preserve these regressions, run the complete local gate after changes, qualify the real host configuration, and review newly introduced dependencies/privileges. No newly identified unresolved critical/high exploit affecting the explicit portfolio configuration is being waived.

## Security review and boundaries

Reviewed frontend rendering/storage/API errors, authentication/session/authorization/CSRF, strict inputs and SQL access, runtime permissions/migrations, dependency/secret handling, holds/inventory/orders/idempotency, ticket lifecycle, demo adapters, worker/outbox, proxy/security headers and deployment tooling. Findings and changes above concern verified demo behavior, not speculative rewrites.

React text rendering is preserved; selected unsafe HTML/code/raw-SQL sinks are checked. Private endpoints enforce ownership; cross-account cursor/order attempts are covered. Server transactions/pricing and constraints remain authoritative; users cannot sell the same seat twice or select a production provider through the browser. API errors and operational logs avoid raw credentials/contact payloads. Production still requires independent secrets, authenticated TLS Redis, verified database TLS, restricted runtime authority, origin checks and secure cookies. No public reset/admin-elevation endpoint was added.

Focused tests/scans are not a complete penetration-test certification. QR codes remain demonstrative and must never be used for venue entry. A stale already downloaded/printed demo receipt cannot be recalled; current API/UI state is refreshed when opened or focused, not continuously pushed. The public demo's documented no-admission scope is essential.

## Verification

Final full release gate completed **2026-10-15T15:59:22.631Z** with exit 0. All 20 executed primary stages passed; seven derived native evidence checks also passed. Six external qualifications are explicitly `not-executed`; they are not counted as passes. The native lab ran 19 groups in 318 seconds. These groups include backend/browser suites and must not be added together as unique test-case counts.

| Check | Fresh result | Evidence |
| --- | --- | --- |
| Frozen install and Prisma generation | Pass | `artifacts/release/frozen-install.log`, `generate.log` |
| Formatting, lint, frontend/test and backend typechecks | Pass | `artifacts/release/{format,lint,typecheck,backend-typecheck}.log` |
| Frontend unit tests | **24 passed**, four files | `artifacts/release/frontend-unit.log` |
| Backend/security/database tests | **32 passed**, zero skipped | `artifacts/preproduction/existing-backend-tests.log` |
| Production frontend and backend builds | Pass | `artifacts/release/{frontend-build,backend-build}.log` |
| Legacy fixture Chromium E2E | **32 passed** | `artifacts/release/chromium.log` |
| Production-build API-contract regressions | **7 passed** | `artifacts/release/portfolio-ui.log`, `artifacts/portfolio/ui-results.json` |
| Standalone payment failure | Pass: no order, seat retained, retry enabled, no payment persistence | `artifacts/release/payment-failure.log` |
| Native TLS/PostgreSQL/Redis/nginx/security/load/recovery | **19 groups passed** | `artifacts/preproduction/results.json`, `artifacts/release/native-stack-load-recovery.log` |
| Real API/database/browser journey | **11 groups passed**, zero unexpected errors | `artifacts/fullstack/qa.json`, `artifacts/preproduction/fullstack-browser.log` |
| Bundle audit | Pass: entry JS **122,209 gzip bytes / 150,000 budget**, CSS **14,437 / 20,000** | `artifacts/bundle-audit.json` |
| Image audit | **20 raster assets, 1,136,344 bytes, zero findings** | `artifacts/asset-audit.json` |
| Dependency audit | **0 reported advisories** across all severity categories at execution time | `artifacts/release/dependency-audit.log` |
| Secret/source/configuration checks | Pass, with narrow pattern-scan limits | `artifacts/release/security.log`, `artifacts/security/static-checks.json` |
| Runtime inventory/SBOM and output identities | **145 runtime components; 70 compiled/static file checksums** | `artifacts/preproduction/sbom.cdx.json`, `artifacts/release/build-checksums.json` |
| QA target refusal and post-guard formatting/lint/backend types | Pass; both unsafe-target/authorization cases rejected before connection | `artifacts/portfolio/post-guard-checks.json`, `qa-target-guards.log` |

The complete machine ledger is `artifacts/release/final-verification.json`. The final small QA-target guard was added while browser checks were running; formatting, lint and backend typechecking were repeated afterward, and the native suite executed the guarded script successfully. Runtime application sources/build inputs were unchanged during that addition.

Browser coverage includes the seven major screens at 13 widths from **360 to 1920px**, axe checks at **390/834/1440px**, keyboard/reduced-motion checks, and the render-isolation regression (144 measured elements; one changes on seat selection, none on timer ticks). The real-stack suite additionally checks desktop/tablet/mobile and axe. Mobile checkout was visually inspected with the new card-free composition. Performance samples are in `artifacts/fullstack/performance.json`; local samples do not establish target-host latency or capacity.

Business/security evidence includes cross-account rejection, strict/negative input rejection, concurrent holds, idempotent checkout/replay, expired holds, cancelled/unpublished/expired ticket suppression, shared Redis limits, bad credentials/CAs/hostname rejection, runtime permission denials, API/worker graceful drain, Redis/PostgreSQL outage readiness, failed-migration recovery, outbox crash/backoff/restart, wrong-key/tampered-backup refusal, populated restore integrity and guarded reset/reseed.

Earlier failed attempts were retained rather than called successful: missing temporary browser/Redis tooling; a signed-out ticket-history load error (fixed and rerun); missing pnpm inventory metadata/executable links after cache restoration (repaired without broadening script permissions); and a sandbox-only Prisma cache `utime` refusal (the authorized final run passed). See `artifacts/portfolio/failed-release/` and the corresponding `artifacts/portfolio/` setup/repair logs. These are not unresolved application failures. Historical artifacts elsewhere can have older counts/browser results; only the fresh paths above substantiate this recommendation.

This run did **not** execute Docker runtime/layer scans, remote CI, public TLS/DNS qualification, hosted alert delivery or offsite/PITR qualification. The dependency audit covers the registry's reported npm advisories, not OS/container vulnerabilities or undisclosed defects. Raw lab artifacts remain private; publish only reviewed sanitized evidence.


## Remaining verified limits and host requirements

- No known unresolved critical/high application vulnerability was identified in this bounded demo review. This is not a claim that the application is secure. Host misconfiguration or later changes can invalidate the evidence.
- No real public host, DNS/certificate renewal, secret manager, private-service network, remote CI or rollout was accessed. An authorized owner must perform the target acceptance checklist in the operator guide before opening public traffic (P012/P014/P015). No deployment authorization is implied.
- No usable Git repository/remote was available in this workspace. Source provenance, an actual remote CI run, reviewed immutable artifacts and target rollout/rollback remain owner actions.
- Docker runtime/layer/CVE tests could not execute on this host. If selecting containers, qualify the actual images. The native HTTPS lab is evidence for native components only.
- Chromium responsive/keyboard/axe checks do not replace manual screen-reader testing, real mobile-device testing or Firefox/WebKit qualification. No approval for unavailable original reference screenshots is claimed.
- The catalog is deliberately ten fictional events; reset/reseed before the earliest show starts (new seeds begin thirty days ahead). Full catalog materialization and event-level locking are scaling tradeoffs. Target capacity and shared-NAT rate limits require measurement. No high-volume launch claim is made.
- Password recovery/verified email are absent by design; use fictional details and unique passwords. No public admin account is seeded. Demo outbox completion means recorded simulation, never delivered email.
- There is no cumulative per-user order/storage quota. Existing request limits bound request rate, not retained data volume. Before public exposure, choose resources, storage/queue alerts, owner contact and a reset/retention interval. The offline reset requires stopping every instance and intentionally destroys disposable demo data.
- Keyset order pagination and opaque hold metadata have contract/backend coverage; a 100+ order long-lived-user browser stress scenario has not been executed. Read retries are explicit, not automatic jittered retries. Those are coverage/policy limits, not hidden completed acceptance claims.
- Local encrypted recovery and reset are not financial PITR/offsite/key-escrow certification. Real commerce still lacks payment/webhook/reconciliation/refund, admission, recovery/email/MFA operators, merchant governance and business operations.

## Recommendation

**PORTFOLIO DEMO: GO — locally verified repository/release candidate.** The actionable repository demo blockers are fixed, core workflows and the required local gate pass, and the demo has a documented deployment/reset path. An authorized operator must still complete P012/P014/P015 host activation checks before opening public traffic; no host or deployment approval is inferred from local evidence. These external requirements do not require commercial services.

**REAL COMMERCIAL TICKETING: NO-GO.** Real settlement/refunds, venue admission, verified customer recovery/email, privileged commercial operations, merchant governance and financial recovery are intentionally absent. Production commercial checkout remains rejected. Do not enable real sales or represent demo QR codes as admission.

