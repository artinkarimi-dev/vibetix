> Scope update (2026-10-15): this report retains historical commercial findings. For the current portfolio-demo classification, implemented fixes, fresh verification and verdicts, use [PORTFOLIO_PRODUCTION_READINESS.md](docs/PORTFOLIO_PRODUCTION_READINESS.md). Commercial gaps are not automatically demo blockers.

> Historical frontend assessment. For the implemented full-stack foundation and current release gaps, see [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

# VIBETIX production-readiness audit

Audit date: 2026-10-14 (continuation of the October 12 architecture assessment). Scope: the local React/TypeScript/Vite frontend sprint and the engineering work required to turn it into a real ticket platform. Recommendations below are proposed architecture, not deployed infrastructure or measured service guarantees.

**Launch decision: not ready for real customers or payments.** The frontend is a product simulation. A successful local build or simulated purchase does not establish inventory exclusivity, payment settlement, identity, legal compliance, recovery or operational readiness. Never enter real card credentials into this simulation.

## IMPLEMENTED NOW versus REQUIRED FOR REAL PRODUCTION

| Area | Implemented now / evidence boundary | Required for real production |
| --- | --- | --- |
| Product UI | React routes, typed catalog and booking interfaces, reusable visual components; final sprint verification is recorded below | Authoritative APIs, real catalog publishing and administration |
| Seats | Deterministic browser inventory and local selection/expiry are frontend behavior | Atomic reservation across all users, server time, contention handling and sold-seat constraints |
| Pricing | Shared client money calculation is a useful UI boundary | Server quote, jurisdiction-specific tax/fees, promo eligibility/redemption limits and immutable order price snapshots |
| Checkout | Clearly labeled payment simulation; browser validation | Provider-hosted/tokenized fields, server payment creation, signed webhooks, reconciliation |
| Orders/tickets | Browser-persisted mock records and deterministic identifiers | Authenticated order access, durable issuance, admission validation, revocation and audit trail |
| Delivery | Local preference and frontend ticket actions | Email/mobile delivery workers, retries, signed access links and delivery monitoring |
| Data durability | Browser persistence supports same-browser demos | PostgreSQL, backups, restore drills, migrations and tested recovery objectives |
| Operations | Local development/build tooling | Isolated environments, CI/CD, TLS/CDN, secrets, monitoring, incident response and support |

### Verification ledger

This ledger is updated from actual local commands. Automated browser and performance evidence is recorded in docs/SPRINT_REPORT.md; source inspection and a green build alone do not establish launch readiness.

| Check | Result/evidence |
| --- | --- |
| Final source inspection | Completed: package/router, catalog/inventory, state/hydration, checkout/order boundaries, components/hooks, CSS, public assets and metadata |
| TypeScript / production build | Passed strict TypeScript and Vite production build; two dependency-comment annotation warnings only |
| Unit tests | 13 passed across pricing, inventory, holds, hydration, checkout, calendar and stored-order validation |
| Playwright journey / browsers | Chromium: 27/27 development scenarios and 10/10 production journey/resilience scenarios passed; configured payment-failure check also passed. Firefox/WebKit absent and not tested |
| Responsive and visual QA | 91 screenshots: seven major screens at all thirteen requested widths; layout/composition reviewed. Original reference screenshots were absent, so exact fidelity remains unverified |
| Accessibility | Zero axe WCAG 2 A/AA and 2.1 AA violations in 21 page/viewport scans; keyboard search/section controls exercised. Real assistive-technology and device validation still required |
| Lighthouse / LCP / CLS | Equivalent production Chromium lab: desktop median LCP 588ms, throttled mobile 2,192ms; initial CLS 0 in all six runs. No Lighthouse scores or INP/field claims. Mobile sampled long-task blocking remains 524ms median |
| Bundle / image sizes | Entry JS 367,916 bytes / 118,572 gzip; CSS 64,774 / 14,347 gzip. Twenty referenced WebPs total 1,136,344 bytes; zero raster format/duplicate/unused/budget findings |
| Security / load / recovery | Runtime and full dependency advisory scans: zero known advisories. Penetration, concurrency/load and recovery drills not performed; no deployed backend exists |

## Frontend architecture and remaining production work

The project uses strict TypeScript models, a local catalog service boundary, React Router, Zustand persistence, React Hook Form and Zod. Keep catalog, inventory, booking, orders and presentation separate. Replace the local catalog boundary with typed API clients instead of fetching ad hoc in every component. Add cancellation, bounded retries, request/error normalization, schema checks at API boundaries, loading/empty/error states, pagination and cache invalidation. Checkout and inventory cannot use cached state as authority.

Routing needs a host rewrite for valid SPA deep links, useful 404 pages and protected order routes. Lazy routes should have a loading fallback and a route/app error boundary, including a recoverable outdated-chunk state after deployment. Order authorization must happen on the server; a frontend route guard is only user experience. Keep business state in focused store subscriptions, inventory outside mutable UI state and computed totals derived rather than duplicated. Persist a versioned, bounded projection; validate hydrated data and handle disabled/quota-exceeded storage gracefully. Browser state can be changed by the visitor and cannot prove ownership, availability or a discount.

Attendee details in local mock orders are still personal information. Use synthetic values during QA. A future implementation should move order history to authenticated server storage, retain only necessary non-sensitive preferences locally, implement logout/data-clearing behavior, and decide retention/deletion policies. Card number/CVC must never enter persisted stores, logs, crash reports or analytics.

Accessibility release work includes all journey screens: semantic landmarks/headings, named controls, visible focus, SVG keyboard interaction, selected/unavailable state announcements, screen-reader errors, dialog focus containment/return, contrast, zoom and reduced motion. Test with assistive technology and users; an automated pass catches only a subset of issues. Define a browser support matrix and exercise Chromium, Firefox and WebKit on desktop/tablet/mobile where tooling is available, then real iOS/Android testing before launch.

Performance evidence must include the production build, representative throttling, an explicit Lighthouse version/configuration and repeatable reports. Inspect initial and route JS, image transfers, long tasks, seat-map commits and search updates. Measure store subscription effects instead of blanket memoization. Keep image tooling and browser test dependencies out of runtime bundles; use responsive WebP, explicit dimensions, eager/high-priority LCP imagery and lazy below-fold imagery. CSS blur/filter effects require device testing. Use only necessary font weights; if web fonts are added, self-host/license them, choose `font-display`, preload only critical files and verify shift behavior. RUM must eventually capture real navigation and seat interactions. Web Vitals evaluates LCP, INP and CLS; field evaluation uses the 75th percentile, so one lab score cannot establish real-user performance. [web.dev Web Vitals](https://web.dev/articles/vitals)

SEO is incomplete with one static HTML title/description for a SPA. Add per-event/artist/venue titles, canonical URLs, Open Graph/Twitter metadata, indexable rendering/prerendering where justified, sitemap/robots, accurate Event structured data and actual sold-out/cancelled status. Keep checkout/orders private and out of indexing. Add analytics through a documented event schema with consent where applicable; exclude attendee/payment fields and ticket tokens. Environment validation must distinguish public build configuration from secrets: anything embedded in client JS is public. No monitoring adapter or analytics vendor constitutes deployed monitoring by itself.

## Backend and API architecture

Start with a modular backend rather than distributed microservices: catalog, identity, inventory, checkout, orders, payments, ticketing and administration, sharing a PostgreSQL transaction boundary. Use versioned REST/JSON or an equivalent typed contract, request IDs, validation, consistent errors and documented 409 inventory conflicts. Public catalog reads can be cached; all mutation endpoints authenticate/authorize and rate-limit. Admin changes, refunds and admission actions require separate permissions and audit logs.

Minimum services include event/artist/venue management, event-specific seat inventory, authoritative holds, server pricing/quotes, order state transitions, provider payment integration, ticket issuance, check-in and delivery. Add a durable worker/queue for email, webhook processing, expiration, reconciliation and outbox delivery. Provider calls must not occur while holding database locks. Server endpoints must never trust incoming prices, status, user IDs or totals; resolve them from authenticated context and current server records.

### Real concurrent seat reservation

**A browser timer does not reserve a seat.** Two browsers can select the same mock seat. For real sales, store one canonical `event_seats` row per event/seat and perform all transitions through atomic database operations.

Recommended pessimistic approach:

1. Validate event sales window, account/session, seat-count limit and idempotency key. Start a short transaction and lock every requested seat row in a stable seat-ID order (`SELECT ... FOR UPDATE`). Set bounded lock/statement timeouts. Reject if any seat is missing, sold or held by another unexpired owner.
2. Within that transaction evaluate expiration using database/server time, set one owned hold ID and expiry across the full requested group, save the durable hold and response/idempotency record, then commit. Return all seats or none; never silently substitute exact seats.
3. The client displays expiry from the authoritative timestamp. A worker releases expired ordinary holds, but acquisition also checks expiry transactionally so worker delay cannot make inventory permanently unavailable.
4. At checkout, atomically verify the hold owner/version and convert it to a bounded `payment_pending` lease tied to a pending order and immutable server quote. Commit before contacting the provider. Process success, cancellation and expiration through the same locking rules.
5. Confirm seats, order and tickets in one transaction after verified payment state. A database uniqueness invariant must prevent a second live sale for the same event seat. Send email through an outbox created in that transaction.

PostgreSQL row locks end with the transaction; they must not be held for a customer's ten-minute checkout. Long-lived holds are durable state, not long-lived SQL locks. Consistent lock order reduces deadlocks; retry a bounded transaction on safe deadlock/serialization failures. [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)

Optimistic conditional updates with a version/state predicate are also possible. Update all requested rows transactionally, require the affected count to match, and roll back any partial group. Pessimistic locking is an easier initial invariant for exact seats; choose after realistic contention tests. `SKIP LOCKED` is useful for worker batches, not a promise to fulfill a user's exact requested seats. [PostgreSQL SELECT locking clauses](https://www.postgresql.org/docs/current/sql-select.html)

### Payment/hold race and failure policy

A payment provider and PostgreSQL do not share one atomic transaction. Define a durable state machine and compensating actions. Suggested states: `held → payment_pending → paid/issued`, with `expired`, `cancelled`, `payment_failed`, `refund_pending`, `refunded` and an explicitly monitored `paid_unfulfilled` exception. Keep order/payment states distinct.

Do not release a `payment_pending` lease merely because the original UI hold timer expired. Attempt provider cancellation or resolve current provider status; delayed authentication can outlive a lease. Nevertheless, no finite lease removes all races. If verified payment succeeds after seats were legitimately released/reassigned, do not overwrite the new owner or issue duplicates: record `paid_unfulfilled`, initiate an idempotent refund and alert support. Prefer an authorization/capture strategy where supported if it reduces this business risk, but design cancellation/capture races and failed capture explicitly. Replay/delayed webhook and process-crash tests are P0 prerequisites.

## Database model and integrity

Recommended initial PostgreSQL model:

| Entity | Key relationships/invariants |
| --- | --- |
| `users` | Identity subject unique; account state; guest buyer strategy defined |
| `artists`, `venues`, `events` | Foreign keys; venue/time zone, sales window, publication state |
| `event_sections`, `seats` | Physical venue seats separated from event tier/configuration; unique venue/section/row/number |
| `event_seats` | Unique event/seat; status, hold/order references, lease timestamps, version; inventory authority |
| `seat_holds` / hold items | Owner, event, expiry, status; atomically bound to canonical event-seat rows |
| `orders`, `order_items` | Owner; immutable seat/extra/price snapshots; currency; order state; unique order number |
| `payments` | Unique provider/payment ID; amount/currency; attempts/status; refund references |
| `tickets` | Unique order-item issuance; opaque token hash; valid/used/void state; admission audit |
| `promo_codes` / redemptions | Sales windows, eligibility, cap and transactional redemption accounting |
| `webhook_events`, `idempotency_keys`, `outbox` | Unique provider event/key scope, payload digest, processing status and retry visibility |

Store money in integer minor units with currency, UTC instants plus the venue's IANA display zone, foreign keys, NOT NULL/check constraints and unique indexes. Preserve historical order prices even when catalog prices change. Index event inventory lookup/status, active hold expiry, buyer/order creation time, provider IDs, ticket tokens and pending worker jobs; assess plans before adding broad indexes. Index foreign-key lookup columns deliberately. Use unique live-sale constraints where the model requires them; do not attempt time-dependent expiry using a volatile `now()` partial index. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

Use versioned migrations checked in source, staged production-like data tests, expand/backfill/contract changes, lock-time review and rollback/roll-forward plans. A code rollback cannot undo destructive schema changes or external charges. Encrypt managed storage/backups, restrict service/admin roles, isolate the DB network and rotate credentials. Production schema/load testing is still absent.

## Authentication and authorization

No real authentication is implemented. Prefer a supported identity provider/OIDC with a clearly defined account and guest checkout model. Verify identity server-side; protect order reads, ticket downloads, refunds, admin catalog changes and scanner operations by object ownership/role. Require MFA and least privilege for staff. Use generic recovery/login responses, throttling, verified email, single-use expiring reset tokens and secure account linking; re-authenticate sensitive changes. [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

For cookie sessions, use Secure/HttpOnly/SameSite appropriately, rotate on login/privilege change, revoke on logout/reset, and enforce server idle/absolute expiry. Protect cookie-authenticated mutations from CSRF; CORS is not authorization. Avoid long-lived bearer credentials in localStorage. [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

If passwords are stored internally, use a modern memory-hard password hash such as Argon2id, independent salts and reviewed parameters; never reversible/plaintext storage. Prefer managed identity to reduce operational burden. [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Payment architecture

Choose a provider based on merchant country, supported currencies/payment methods, refunds and risk requirements; Stripe is an example, not a deployed integration or availability guarantee. Replace simulated raw-card inputs with hosted/tokenized provider UI. Assess PCI scope with the provider/acquirer; using a provider does not eliminate every merchant obligation. [Stripe integration security](https://docs.stripe.com/security/guide)

The server calculates the amount, creates/reuses one payment intent for the order, stores the provider ID and returns only the intended client token. The browser redirect or success screen is not settlement evidence. Payment retries must reuse the durable order/attempt key, and reuse with a changed payload must fail. [Stripe PaymentIntents](https://docs.stripe.com/api/payment_intents), [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)

Verify webhook signatures against the raw body, timestamp tolerance and correct environment secret. Durably record each provider event before acknowledging; process via workers with unique event IDs, idempotent state transitions and handling for duplicate/out-of-order delivery. Re-check trusted provider state and expected amount/currency/order link before fulfillment. Never grant tickets based on a client callback. [Stripe webhooks](https://docs.stripe.com/webhooks)

A reconciliation job must compare pending/paid/refunded orders with provider records and investigate mismatches. Handle failed authentication, declined payments, timeouts with unknown outcome, duplicate submission, refunds, partial refunds, disputes/chargebacks and event cancellation. Refunds must revoke relevant admission rights and maintain an audit ledger; notify customers after durable state change. Test provider sandbox retries, process crashes and webhook replays before real money.

## Security audit

Current client validation is usability, not a security boundary. All future API inputs, prices, seat ownership and authorization require server validation. React escaping helps plain text; avoid unchecked HTML injection and restrict generated URLs. Review third-party scripts and sanitize any future CMS HTML. Browser-local orders/QRs are forgeable and must never be accepted at a venue.

Required controls: HTTPS, least-privilege roles, object-level authorization, parameterized SQL, size/type limits, rate limits on identity/holds/promo/payment APIs, waiting-room abuse controls, protected admin interfaces and audited access. CORS should explicitly allow approved origins/methods; cookie mutations require CSRF defenses. Secret keys belong in a secrets manager/backend environment, never `VITE_*`, repo, screenshots or logs. Redact PII and all card/token values from telemetry.

Configure deployment headers, including tested CSP (start report-only), `frame-ancestors`, `object-src`, MIME sniffing protection, referrer/permissions policy and HSTS after HTTPS is reliable. Provider frames/scripts require narrowly approved origins; do not broadly disable CSP for convenience. [OWASP CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html), [OWASP HTTP headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)

Run dependency/secret/SAST scanning in CI, document exploitability and remediation rather than ignoring audit output, lock dependencies and maintain upgrade ownership. Commission a threat model and independent security review before launch; this document is not a penetration test.

## Network and delivery

Host static assets behind a CDN with HTTPS/TLS certificate renewal and monitored DNS. Use hashed filenames with long immutable asset caching; HTML should revalidate so new versions discover new bundles. Deploy atomically and retain old chunks to avoid stale-tab failures. Configure SPA rewrites without turning missing assets into HTML. Use Brotli/gzip and HTTP/2 or HTTP/3 where the host supports them. [MDN HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)

Cache public catalog reads briefly with explicit invalidation; never publicly cache orders, attendee records, checkout secrets or authoritative inventory mutations. A section availability cache is advisory and may be stale. Add API timeouts, cancellation and bounded jittered retries for safe reads; retry writes only with server idempotency. Respect 429/Retry-After. Instrument regional latency and failure rates. Health endpoints should distinguish readiness from liveness and avoid restart storms during DB/provider outages. Consider an image CDN only when catalog volume merits it; allowlist transforms and control cache/resize cost.

## Infrastructure and DevOps

Define isolated development, staging and production with separate databases, buckets, queues, provider accounts/keys, DNS and access roles. Start with CDN static hosting, a managed backend runtime, managed PostgreSQL with pooling, object storage for licensed assets, email provider, durable queue/workers and secrets management. Use infrastructure as code, least-privilege service identities and documented budget/capacity limits. No deployed platform is currently demonstrated.

CI must run lockfile installation, lint (configure if absent), typecheck, unit/integration tests, Chromium E2E, representative cross-browser checks, production build, dependency/secret scans, image/bundle budgets and migration checks. Retain reports/screenshots. CD should deploy the same immutable artifact to staging, run smoke tests, require the production approval appropriate to the company, deploy gradually where supported and retain rollback artifacts. Smoke test deep links, checkout/payment sandbox, headers/cache and webhook reachability. Use backward-compatible migrations; rehearse rollback under schema changes. Define an on-call owner, incident escalation, deployment freeze/rollback criteria and runbooks.

## Observability

Create structured logs with request/trace/order/hold IDs, no credentials and controlled PII access/retention. Instrument frontend error tracking and real-user Web Vitals, backend latency/error rate, database lock waits/pool exhaustion, worker lag and provider requests. Traces should connect HTTP, DB, queue and webhook processing. Logs, metrics and traces provide complementary evidence. [OpenTelemetry observability concepts](https://opentelemetry.io/docs/concepts/observability-primer/)

Define SLOs and alerts before launch: checkout success excluding known declines, hold conflict/error rates, p95/p99 API latency, webhook age, payment/fulfilled mismatch, issued-ticket uniqueness, email failure, expired-lease backlog and inventory reconciliation drift. Page on paid-but-unfulfilled, duplicate issuance/sale invariants, prolonged webhook failure and outage. Add external uptime/synthetic journey checks that do not consume real inventory/payments. Verify alert delivery and runbook ownership by drills; installing an SDK is insufficient.

## Data reliability and disaster recovery

Proposed initial objectives, requiring business approval and proof: **RPO ≤ 5 minutes** for durable order/inventory records and **RTO ≤ 60 minutes** for core checkout after a regional/service failure. These are targets, not achieved guarantees; financially important state may justify tighter objectives. Provider-side successful payments must always be reconciled after restoration, including transactions newer than the recovered DB.

Use encrypted scheduled base backups plus continuous WAL/PITR, independent protected copies and monitored archive failures. PostgreSQL recovery requires a valid base backup and complete necessary WAL chain. [PostgreSQL PITR](https://www.postgresql.org/docs/current/continuous-archiving.html)

At least quarterly, restore to an isolated environment, measure actual data loss/recovery time, verify order/inventory/ticket invariants, replay/reconcile provider events, confirm app compatibility and practice DNS/certificate/secrets recovery. Test accidental deletion, failed migration and primary/region loss. Record the result, responsible operator and corrective actions. Backups alone do not prove restoration. Test logical corruption recovery and schema roll-forward; maintain offsite configurations/runbooks and provider contacts. Pause sales during uncertain recovered inventory rather than double-selling.

## Scalability

Popular-event spikes concentrate contention on a few seat rows; adding frontend/backend replicas does not remove it. Load-test realistic hot sections, simultaneous exact-seat requests, payment delay, webhook burst and expired-hold cleanup. Enforce queue/waiting-room admission, per-account/device/IP limits and bot controls without excluding accessible users. Cache static assets/catalog at the edge; never use CDN or Redis as sole seat-sale truth.

Scale stateless API instances horizontally with bounded DB pools and backpressure. Use worker queues for side effects, constrained parallelism, retries and dead-letter review. Keep seat transactions short, ordered and indexed; monitor pool/lock waits. Redis can support advisory availability, rate limiting and queues, but PostgreSQL remains inventory/order authority. Read replicas may serve catalog/history if acceptable; avoid stale replica reads for final holds/orders. Add event partitioning and multi-region write design only after proven bottlenecks; distributed consistency introduces material complexity. Define load shedding and stop-sales procedures for provider/database outages.

## Legal, privacy and compliance

Select launch jurisdictions and obtain qualified legal/payment/acquirer review. Likely requirements include truthful seller identity, privacy policy, terms, ticket transfer/admission rules, accessible purchase flow, consumer rights, cancellation/refund policy, transparent mandatory fees, applicable taxes, payment compliance, data retention/deletion and processor agreements. Determine whether consent is required for analytics/marketing cookies and provide the required choice/records. Email marketing consent differs from transactional delivery.

Minimize personal data, map processors/subprocessors and international transfers, establish user rights/security incident procedures and document order/financial retention separately from marketing profiles. Confirm rights to imagery, fictional campaign assets, fonts and branding; do not claim affiliation with a real venue/artist. No legal/compliance guarantee is made here. Policies must reflect actual systems and operations rather than generic placeholder copy.

## Prioritized production roadmap

Status meanings: **Frontend only** = implemented browser simulation, **Missing** = no real service/deployment shown, **Pending verification** = evidence is still required. Order numbers indicate rough dependency sequence, not effort estimates.

| Priority / order | Item | Status | Principal risk | Recommended action | Dependencies |
| --- | --- | --- | --- | --- | --- |
| P0 / 1 | Scope, jurisdiction, merchant/provider feasibility | Missing | Selling where provider/legal model cannot operate | Define seller, currency, sales/refund/tax policies and provider eligibility | Business/legal review |
| P0 / 2 | API, PostgreSQL schema and server quotes | Frontend only | Client-forged price/orders | Implement validated API, migrations, constraints and immutable money snapshots | 1; backend runtime |
| P0 / 3 | Atomic seat holds and payment leases | Frontend only | Double sale, expired-seat charge | Transactional canonical inventory and invariant/race tests | 2 |
| P0 / 4 | Auth, guest identity, authorization | Missing | Order theft/admin compromise | Server identity, ownership checks, secure sessions, staff MFA | 2 |
| P0 / 5 | Real payments and signed webhook pipeline | Missing | Duplicate/lost charges, unpaid issuance | Hosted provider fields, idempotency, durable webhook inbox/outbox | 1–4; secret management |
| P0 / 6 | Fulfillment/refund/reconciliation | Frontend only | Paid customer without ticket | Atomic issuance, late-payment compensation, refund/dispute ledger and alerts | 3–5 |
| P0 / 7 | Ticket admission/revocation | Frontend only | Forged/replayed entry | Opaque server tokens, online verification, atomic check-in, revoked status | 4, 6 |
| P0 / 8 | Security/PII boundaries | Pending verification | Credential/attendee exposure | Threat model, server validation, headers, scans, least privilege, redaction | 2–7; deployment |
| P0 / 9 | Financial backup/recovery and operational ownership | Missing | Unrecoverable sales/unknown payment state | PITR, tested restore/reconciliation, stop-sales runbook, on-call | 2, 5–6 |
| P1 / 10 | Staging/production CI/CD and rollback | Missing | Broken/unrecoverable deployment | Isolated environments, immutable artifacts, migration checks and smoke tests | 2–9 |
| P1 / 11 | Domain/TLS/CDN/cache/deep links | Missing | Broken navigation, latency, stale chunks | Host configuration, cert monitoring, cache/compression and header tests | 10 |
| P1 / 12 | Accessibility and supported-browser release gate | Local Chromium/axe passed; manual and other browsers pending | Users unable to book | Automated/manual AT and real-device testing across journey | Final UI; 10 |
| P1 / 13 | Performance, metadata and SEO | Pending verification | Slow acquisition/poor indexing | Production budgets, repeatable lab reports, RUM, per-page metadata/rendering | Assets; 11 |
| P1 / 14 | Delivery/customer support/legal policies | Frontend only | Missing tickets, unclear refunds/privacy | Delivery workers, support tooling, reviewed policies and retention | 1, 4, 6 |
| P1 / 15 | Monitoring, SLOs and incident drills | Missing | Silent failed payments/holds | Dashboards, synthetic checks, paging and tested runbooks | 3, 5, 9–11 |
| P2 / 16 | Hot-event load/waiting room/bot controls | Missing | Contention/oversubscription/outage | Load testing, admission/backpressure, tuned pools/queues | 3, 10, 15 |
| P2 / 17 | Recovery hardening and capacity scaling | Missing | Region loss/unproven recovery | Repeated failover/restore drills, measured RPO/RTO, capacity forecasts | 9, 15–16 |
| P2 / 18 | Analytics and experimentation | Missing | PII leakage/misleading conversion data | Consent-aware event schema, delivery quality and privacy review | 1, 8, 14 |
| P3 / 19 | Catalog CMS, advanced discovery, image CDN | Missing | Manual content bottleneck | Staff authoring workflow, search indexing and asset transforms when needed | 4, 10; actual scale |
| P3 / 20 | Transfer/resale/offline admission enhancements | Missing | Fraud and complex revocation | Product/legal design, threat model and revocation/reconciliation protocol | 7, 14–17 |

A public simulation can be labeled and hosted separately after frontend QA. Real sales require the P0 invariants and P1 launch controls above, verified on the actual deployed system.
