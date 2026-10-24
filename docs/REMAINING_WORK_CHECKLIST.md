# Remaining work — portfolio demo and commercial scope

Date: 2026-10-15. **PORTFOLIO DEMO: GO as a locally verified candidate; REAL COMMERCIAL TICKETING: NO-GO.** Public host activation is pending. This checklist supersedes the former undifferentiated 19-blocker list. See [current portfolio readiness](PORTFOLIO_PRODUCTION_READINESS.md) for reasoning, evidence and verdicts, and [operator instructions](PORTFOLIO_DEPLOYMENT.md). Original commercial findings remain in [the historical audit](FINAL_PRODUCTION_READINESS_AUDIT.md).

## Implemented repository work

- [x] P009/P010/P011/P019: truthful simulation, resilient account/history, current ticket state and catalog-driven navigation.
- [x] N001–N005: unavailable sections, complete inventory, opaque IDs, older order history and finite requests.
- [x] N007/N008/N009/N012: lint, privilege startup checks, current documentation and standalone fixture QA.
- [x] Explicit portfolio production adapter, card-free strict checkout, demo outbox, guarded offline reset and future-date seed.
- [x] Final local verification: 24 frontend units, 32 backend/security tests, 32 legacy browser tests, 7 new browser regressions, 19 native groups (including 11 real-stack browser groups), standalone failure QA, typechecks, lint, builds and audits passed. Exact evidence is in the current readiness report.

## Before exposing the demo on an actual host

- [ ] P012: authorize/provision host/domain; qualify HTTPS, private PostgreSQL/TLS Redis, proxy trust, independent secret mounts/rotation, restricted roles and readiness.
- [ ] P014: preserve source in Git, run real remote CI for the revision, review artifacts and rehearse compatible rollout/rollback on the chosen host.
- [ ] P015: assign demo owner/contact, choose storage/log/retention/reset limits and connect health/worker/storage alert delivery.
- [ ] P013 if containers are used: execute/inspect actual UID/capabilities/mounts/health and scan image layers; native checks do not substitute.
- [ ] P017: measure chosen host capacity and shared-NAT rate-limit behavior; retain conservative resource limits.
- [ ] P018: manual assistive-technology/device review and other-engine qualification before claiming broader support. Chromium automation is only the recorded support evidence.

These external items are demo host activation requirements, not demands for commercial providers. No deployment has been performed.

## All 31 classifications

| ID | Class | Disposition |
| --- | --- | --- |
| P001 | C | A merchant/market contract is unnecessary for fictional no-money orders. |
| P002 | C | The explicit portfolio adapter provides complete simulated checkout. Real intents, webhooks and settlement stay excluded. |
| P003 | C | Demo QR codes never grant admission. No venue scanner or admission authority is offered. |
| P004 | C | Financial refunds and commercial event operations are excluded. Current demo cancellation/reschedule/revocation must still invalidate displayed tickets; that correction is implemented. |
| P005 | C | No public privileged admin account or bootstrap is offered in portfolio mode. Existing production admin protection stays closed; real operator MFA is required before enabling commercial administration. |
| P006 | C | Verified-customer recovery is unnecessary for explicitly disposable demo accounts. Unique passwords, session safety, fictional data guidance and reset disclosure remain mandatory and are retained. |
| P007 | C | Actual email delivery is not promised. The explicit portfolio outbox sink completes demo jobs without writing/transmitting contacts; worker correctness remains tested. |
| P008 | C | Authorized real catalog and merchant pricing are commercial requirements. Fictional demo catalog/fees/extras are labeled and new demo seeds use future dates. |
| P009 | A | Truthful simulation/data disclosures are mandatory. Checkout requests no card data; account, privacy, terms, order and delivery wording now describe the actual demo. |
| P010 | A | Empty catalogs and cancelled holds must not prevent account/history access. Catalog acceptance and safe booking restoration are implemented with regression coverage. |
| P011 | A | Stale QR/ticket state is a correctness defect even in a demo. Owner reads/focus refresh replace cached data; failed reads hide cached tickets; invalidation and expiry are explained. |
| P012 | A | Private services, HTTPS, independent secrets and proxy qualification remain mandatory before public exposure. Repository configuration and native TLS checks are available; actual host qualification is external and pending. |
| P013 | B | Container execution/layer/CVE qualification is required if that deployment method is selected. Native deployment is supported; absent Docker evidence is not replaced with a static claim. |
| P014 | A | Reproducible source/build/CI and a controlled release are mandatory engineering practice. Local frozen verification and CI exist; owner Git/remote CI and target rollout remain pending external steps. |
| P015 | A | A public demo still needs basic health/worker/storage monitoring, bounded retention/reset and an owner contact. Existing health/log/alert hooks and new operator guidance cover repository work; hosted delivery/ownership must be assigned. |
| P016 | C | Financial offsite/PITR SLA and business recovery are excluded. Disposable demo reset/reseed plus tested local encrypted recovery provide the demonstration lifecycle; target backups can be chosen by its owner. |
| P017 | B | Existing contention/abuse/load checks are relevant engineering evidence. Target capacity must be measured for its resources; enterprise traffic qualification is unnecessary for a bounded demo. |
| P018 | A | Responsive, keyboard and accessible critical flows are mandatory. Automated Chromium/axe coverage is run; manual assistive-technology and other-engine support remain explicitly unqualified. |
| P019 | A | A removed fictional primary event must not break navigation. Home/CTAs use a current event or the empty catalog/discovery state. |
| N001 | B | Missing section data needs an explicit unavailable state instead of a crash or endless loading. Implemented and browser-tested. |
| N002 | B | Inventory pages must all be consumed even in a demo. Implemented bounded sequential pagination with account-revision guards and 201-seat regressions. |
| N003 | B | IDs are opaque. Holds now return explicit section metadata; restoration no longer splits IDs. |
| N004 | B | History should remain reachable. Owner-scoped stable cursor pagination and accessible older-order loading are implemented. |
| N005 | B | Hung requests need a finite state. Twelve-second deadlines and caller abort support are implemented; mutations never retry automatically. Read retry remains explicit to avoid request storms. |
| N006 | D | The fixed ten-event catalog does not justify a new search/query/cache architecture. Full-catalog materialization remains a documented scaling limit. |
| N007 | B | A real lint gate is warranted. ESLint/TypeScript/React hook rules now run locally and in CI with narrowly explained exceptions. |
| N008 | B | Startup must reject privilege drift. Production startup now checks role memberships, database/schema CREATE, migration-table privileges and audit reads/mutations as well as TLS/UTC. |
| N009 | B | Current environment/setup guidance must be reproducible. README, environment examples, operator/reset guidance and audit index now distinguish demo scope from historical commercial gaps. |
| N010 | D | Basic truthful title/description defaults are corrected. Advanced canonical/social/SEO metadata does not justify SSR or a framework change. |
| N011 | D | Unavailable original-reference approval is a cosmetic owner decision. Existing validated design is preserved; no reference fidelity or visual freeze approval is invented. |
| N012 | B | Standalone failure QA must run with its own declared fixture mode. Corrected and included in CI; it remains a simulation test rather than provider evidence. |

## Explicit exclusions and optional work

Class C items are not portfolio blockers: real settlement/refunds/admission, merchant catalog authority, customer recovery/email/privileged operator MFA and financial recovery SLAs remain excluded. Real commercial ticketing remains NO-GO.

Class D items N006/N010/N011 remain optional: large-catalog query architecture, advanced metadata and original-reference cosmetic acceptance. Basic truthful metadata is corrected; screenshot fidelity is unverified. Do not add complex services to close them.
