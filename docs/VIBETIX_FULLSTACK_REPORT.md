# VIBETIX full-stack implementation report

Date: 2026-10-14. **A functioning full-stack foundation is implemented and locally verified. It is not approved for production ticket sales.** Payment remains an explicitly enabled simulation, email delivery is abstracted/local-only, and no real admission service exists.

## Architecture and preserved frontend

Inspected the existing React routes/components, Zustand stores, exact-seat flow, pricing, fixtures, assets, lazy loading and prior QA before integration. The existing frontend was retained. This pnpm monorepo keeps its validated root `src/public/tests` paths; `backend/` is the API/worker workspace, `packages/shared/` contains contracts and request validation, and `frontend/` contains frontend deployment configuration. Moving every frontend file would add churn without improving the backend boundary.

- React still owns presentation, route composition, local input/form state and non-sensitive cart preferences. Existing event/arena/cards/forms/tickets, styling and WebP assets remain. The only new customer flow is account registration/login needed for server reservations.
- `src/api/` wraps same-origin credentialed requests and exposes catalog, session, inventory, quotes, orders and account restoration. Initial loading/errors/retry are visible. The default app requires the backend and never falls back to mock catalog/orders after a failed request.
- Fastify/TypeScript exposes `/api/v1`. Controllers validate input and authorization and call services. Inventory/order/pricing logic resides in services. Configuration is validated; error envelopes are centralized, internal errors sanitized and structured logs avoid body/token logging.
- Prisma/PostgreSQL owns inventory, sessions, prices, promo validation, orders, tickets and outbox records. The browser never submits a total or authority to mark seats sold.
- An independently runnable worker expires holds, removes expired sessions and processes supported local notification jobs. PostgreSQL provides the durable queue and worker coordination; Redis/BullMQ was not needed for this local foundation.

Frontend fixture behavior remains only for the legacy simulation tests. Playwright explicitly enables it in both its Node fixture builders and Vite server. The independent full-stack browser script does not import that configuration and runs the normal production build against real PostgreSQL. Private server orders and session tokens are not stored in localStorage. Old simulation order storage is discarded when entering API mode. Cart selection is restored from owned server holds on reload; orders/favorites are restored from the signed-in account. Large order histories use bounded lists, with direct owner-checked order fetching for older links.

## Database design and migrations

Two checked-in SQL migrations were applied successfully to a real temporary PostgreSQL 18.4 runtime. The Prisma schema was generated, validated and compiled. Local Docker/CI recipes target PostgreSQL 17; those recipes have not been executed on this host.

Implemented entities: **User, Session, Artist, Venue, Event, Section, Seat, EventSeat, SeatHold, Order, OrderItem, Ticket, Payment, PromoCode, Extra, Favorite and OutboxJob**. Physical seats belong to venue sections; an `EventSeat` is a unique event/physical-seat inventory row. `SeatHold` has a unique event-seat reference and an indexed expiry. The API currently requires an account; nullable hold ownership leaves a schema boundary for a future explicitly designed guest flow.

Money uses integer USD cents. Orders store immutable pricing/presentation snapshots alongside relational order items and payment records. Ticket codes identify tickets; QR signatures are generated on read using an environment signing key, and their fingerprints are stored rather than raw bearer payloads. Confirmed and failed payments/orders are recorded distinctly. Failed snapshots are marked failed and never returned as confirmed account orders.

Important database guards:

- Unique normalized user email, physical section/row/seat, event/seat pair, active hold/event-seat, order-item/event-seat and ticket/order-item.
- Unique `(userId, idempotencyKey)` for checkout; unique payment transaction IDs and `(orderId, kind)` outbox delivery identity.
- Foreign keys and indexes on event/status, event date/status, ownership/history and expiry/job lookup paths.
- SQL checks for nonnegative prices/fees/tax, balanced order totals, valid percentages/quantities/capacities, positive seat coordinates and doors-before-start.
- SQL triggers reject event inventory linked to a seat from another venue and order items linked to a different event or a non-confirmed order.

Initial seed: **10 fictional events, 4 artists, 4 venues, 184 sections, 17,664 physical seats and 44,160 event-seat rows**, extras and three promo codes. This exceeds the requested hundreds of seats while keeping the existing arena geometry usable. Repeat seed uses upsert/create-many duplicate skipping and does not erase sold inventory, account data or orders. Tests subsequently create extra draft events and records; those are not part of the initial public seed count. A final repeat-seed check preserved all 10 test orders, 8 tickets and 8 sold seats, with 10 public events unchanged (`artifacts/fullstack/seed-repeat.json`). Additional draft test events explain the larger final raw event/inventory counts. No default administrator or reusable account password is shipped. Explicit seed-time administrator bootstrap requires caller-supplied credentials and does not promote an existing account.

## Reservation and checkout correctness

Every hold replacement, checkout and expiry release acquires the same event row with `SELECT ... FOR UPDATE` inside a Prisma transaction. Concurrent writes to that event wait for the current transaction. After obtaining the lock, the service reads database time, checks sale status/expiry, validates seat membership and verifies ownership. A user cannot overwrite another user's active hold or a sold seat. Hold replacement releases removed seats, keeps the original expiry and caps the requested set at six. Empty selection can release holds even after an event closes.

Checkout revalidates owned/unexpired holds and computes prices/promos/extras from database rows, rejecting supplied totals or unsupported fields. A successful local payment atomically creates the order, payment, order items, tickets and notification outbox record, converts HELD to SOLD and removes the holds. A failed local payment records FAILED, creates no tickets/items and releases selected holds to AVAILABLE. The unique order-item/event-seat constraint is an additional double-sale backstop.

Idempotency keys are UUIDs scoped to the account. A canonical request fingerprint detects reuse with changed seat/contact/promo/extra/delivery data. Repeating the same checkout returns the same result; changed data with the same key is rejected. An API test sends two identical checkouts concurrently and verifies one order and one sale. Frontend submission is disabled while processing, uses a stable per-attempt key and never transmits card fields.

The event-wide lock is deliberately simple and safe for this scale, with transaction wait/timeout bounds. It serializes busy events and is not a proven hot-event throughput solution. A future finer-grained locking strategy must preserve the same ownership/expiry/uniqueness invariants. The design follows PostgreSQL's explicit-lock semantics; see the [PostgreSQL locking documentation](https://www.postgresql.org/docs/17/explicit-locking.html) and [Prisma transaction documentation](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).

## REST API

All mutation requests require the configured browser Origin. Protected routes require the session cookie; ADMIN routes additionally check the database-backed role. Responses use JSON; errors provide code/message/request ID without private database details.

| Method   | `/api/v1` path                            | Responsibility                                                         |
| -------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| POST     | `/auth/register`                          | Strict customer registration and password hash                         |
| POST     | `/auth/login`                             | New opaque session cookie                                              |
| POST     | `/auth/logout`                            | Revoke current database session and clear cookie                       |
| GET      | `/auth/me`                                | Current public user or null                                            |
| GET      | `/catalog`                                | Small public catalog bootstrap, sections and extras                    |
| GET      | `/events`                                 | Bounded event list, `q`, `limit`, `offset`                             |
| GET      | `/events/:id`                             | Published event with artist/venue                                      |
| GET      | `/artists`, `/venues`                     | Catalog lists                                                          |
| GET      | `/events/:id/seats`                       | Section-filtered inventory; default 100, max 200, bounded offset       |
| GET      | `/events/:id/availability`                | Section availability summary without other users' identities           |
| POST     | `/events/:id/hold-seats`                  | Authenticated replacement of owned selection; empty list releases      |
| GET      | `/holds`                                  | Current account's unexpired holds                                      |
| POST     | `/quotes`                                 | Server quote and promo validation for owned held seats                 |
| POST     | `/orders`                                 | Idempotent simulated payment/transactional order creation              |
| GET      | `/orders`, `/orders/:id`                  | Account-owned confirmed orders; direct lookup conceals others with 404 |
| GET      | `/tickets`                                | Account-owned confirmed ticket projections                             |
| GET/POST | `/favorites`                              | List/add account favorites                                             |
| DELETE   | `/favorites/:id`                          | Remove an owned favorite                                               |
| POST     | `/admin/events`                           | Create event and inventory from an existing configured venue           |
| PUT      | `/admin/events/:id`                       | Edit event; venue changes are prohibited once inventory exists         |
| PUT      | `/admin/artists/:id`, `/admin/venues/:id` | Validated catalog management                                           |
| GET      | `/admin/orders`                           | Bounded order summaries                                                |
| GET      | `/admin/events/:id/inventory`             | Inventory status counts                                                |

`GET /health` checks database connectivity outside the versioned prefix. No payment webhook, scanner, refund or password-reset endpoint is pretended to exist. New venue section/seat authoring and a large admin dashboard are not implemented; admin APIs are the foundation requested.

## Security decisions

Passwords are bcrypt-hashed at cost 12. Registration requires 12–72 characters and checks the 72-byte bcrypt boundary before hashing. Customer role is server-assigned; role fields in registration are rejected. Login uses a dummy hash comparison for unknown accounts. Auth endpoints have a tighter rate limit than the general API.

Sessions are 256-bit random opaque values; only SHA-256 fingerprints are stored. They have an absolute 12-hour expiration, are checked on protected requests and are removed by logout/expiry cleanup. There is no silently sliding expiration or refresh token; sign in again after expiry. Production cookies use Secure, HttpOnly, SameSite=Strict, path `/`, no Domain and the `__Host-` prefix. Local HTTP uses a separate development cookie name. No JWT/localStorage access-token mechanism was added.

State-changing routes reject absent/unapproved Origin; CORS allows exactly the configured origin with credentials. This complements SameSite cookies and JSON request parsing for CSRF protection. Production startup requires an HTTPS origin and rejects local email capture. Schemas reject unknown fields on sensitive inputs. SQL uses Prisma/tagged parameterization, not string interpolation. React renders escaped text; admin image paths are restricted to local WebPs. Fastify Helmet and the frontend nginx recipe provide security headers. Logs redact cookies/authorization and omit request bodies/private SQL parameters. Local env files and email captures use restrictive permissions and are ignored/excluded from builds.

Two high dependency advisories were found in transitive tooling: [Effect context isolation](https://github.com/advisories/GHSA-38f7-945m-qr2g) and [Deepmerge recursive graphs](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). Workspace overrides require patched Effect 3.20+ and Deepmerge 8+; Prisma generation/validation/migrations and builds were checked after the override. The final full dependency audit reports **zero known advisories**. This is a point-in-time registry check, not a penetration test or proof of security.

Remaining security controls include account verification/recovery, staff MFA/audit trails, distributed abuse defenses, trusted proxy policy, independent review and real-provider authorization/reconciliation. Compose's bootstrap database role is for local development; production needs separate least-privilege application/migration roles.

## Worker, payment and email boundaries

The API and worker run independently. Expired releases use the same database lock protocol as checkout. The production browser test starts the separate worker process, expires a real hold and waits for AVAILABLE. Holds can also be reclaimed safely by a subsequent inventory mutation after their expiry.

The durable outbox is written in the successful order transaction. Workers coordinate using `FOR UPDATE SKIP LOCKED`, retry/backoff and a terminal failure state. Local email capture is idempotent by order artifact and records **LOCAL_CAPTURED**, never SENT. Disabled transport leaves jobs pending. No real message is sent. Report/cleanup/refund/ticket-email jobs can use the runner/transport boundary, but their provider/business workflows remain future work.

`SimulationPayments` is the only implemented payment adapter and is disabled by default. Its outcomes are synchronous local decisions, so the transaction has no gateway network call. A separate asynchronous `ProductionPaymentProvider` interface documents intent/webhook operations. Implementing it requires durable pending/payment leases, signed webhook inboxes, recovery/refunds and reconciliation; replacing the current decision with a network call inside the inventory transaction would be incorrect.

## Executed verification

| Check                                                    | Result/evidence                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Frontend typecheck including existing tests              | Passed                                                                                     |
| Backend typecheck including API tests and live QA script | Passed                                                                                     |
| Frontend unit tests                                      | **13 passed**, two files                                                                   |
| Backend unit/service/API integration tests               | **9 passed**, actual PostgreSQL; `artifacts/fullstack/backend-tests.log`                   |
| Prisma generation/schema validation/migrations/seed      | Passed; two migrations, initial seed counts above                                          |
| Frontend and backend production builds                   | Passed; Zod emits existing nonfatal annotation warnings                                    |
| Formatting                                               | Passed across source/tests/shared/backend/scripts                                          |
| Legacy Chromium and Firefox                              | **64 distinct passing cases**, 32 per engine, across the green journey/matrix/recheck runs |
| Real production frontend + PostgreSQL/Fastify journey    | Passed; `artifacts/fullstack/qa.json`, `final-browser-check.log`                           |
| Bundle budgets                                           | Passed; `artifacts/bundle-audit.json`                                                      |
| Image audit                                              | **20 WebPs, 1,136,344 bytes, zero findings**; `artifacts/asset-audit.json`                 |
| Dependency audit                                         | Zero known advisories; `artifacts/fullstack-dependency-audit.json`                         |
| Docker/remote CI/WebKit                                  | Not executed; no coverage claimed                                                          |

Backend checks cover hashed authentication/session/logout/expiry, CSRF, role-injection rejection, protected/admin authorization, ownership concealment, a two-customer same-seat race, concurrent idempotent checkout, server totals/extras/promos, expired holds, failed payment/replay, favorites, database money/venue guards and bounded numeric seat ordering. The race asserts exactly one successful hold and one conflict, then checks PostgreSQL ownership/status; it is not an in-memory concurrency mock.

The independent live browser journey verifies registration/login, database catalog, exact seats, server hold restoration after refresh, extras/review/checkout navigation, server promo, simulated order/ticket persistence, My Tickets/order details, no card data in transmitted order requests, no private orders/tokens in browser storage, separate worker expiry, logout and API-outage retry without fixture fallback. It checks live account/seat/checkout accessibility and event/order states at 1440/834/390px with zero axe violations and no document overflow. There were no unexpected page/console errors in the successful journey; the intentionally aborted catalog request is recorded separately as an expected network error.

Legacy tests retain all thirteen widths (1920, 1600, 1440, 1366, 1280, 1024, 834, 768, 430, 412, 390, 375, 360), discovery, booking/expiry/search/favorites/history, keyboard/reduced motion, calendar/copy/print styles, render isolation and axe assertions. The initial fixture run exposed missing Node-side fixture configuration and was interrupted/corrected. Final journey/resilience: 22/22; matrix: 40/42, with two host-pressure Chromium axe timeouts; isolated rerun: 2/2. All 64 unique cases now pass. This is not described as a single uninterrupted green run. See `artifacts/fullstack/legacy-verified-ledger.json` and its three source result files. No axe violations were waived.

## Performance findings

Final entry JS: **373,631 bytes raw / 121,340 gzip**; CSS **64,437 / 14,270 gzip**. Relative to the preceding hardening build, JS grew 2,443 gzip bytes (about 2.1%); CSS is unchanged. The existing 150 KB JS / 20 KB CSS gzip budgets pass. Checkout/QR/order validation remain lazy; backend dependencies are not bundled into browser code. Hero priority/mobile variants, WebP assets and deferred below-fold arena geometry remain intact.

The live API browser run measured three loopback requests per endpoint after normal interaction: catalog median **9.31ms**, 30,013 uncompressed bytes; one 96-seat section median **28.72ms**, 16,699 bytes including pagination metadata. These are tiny local samples, not load percentiles or SLO evidence. Query audit: five queries for catalog and five for a section, including bounded relation fetching; no query-per-seat loop. The idle sample recorded 23ms and 16ms summed query durations respectively. EXPLAIN used the event/status index via a bitmap scan. Earlier diagnostics during host swapping were much slower; those measurements are not treated as baseline capacity. Evidence: `artifacts/fullstack/qa.json`, `database-audit.json`.

After browser regressions stopped, six cold-context lab samples used the production frontend and real API: three desktop and three 390×844/DPR3 mobile samples, with mobile 4× CPU, 150ms latency and nominal 1.6Mbps. Desktop median LCP **456ms**, sampled blocking **20ms**; mobile LCP **2484ms**, blocking **322ms**. All initial CLS samples were zero. Compared with the previous frontend-only pass's 2384ms mobile LCP, the observed live median is 100ms higher. Host conditions and the new API boot sequence differ; no causal speedup or field-performance claim is made. The blocking sum is long-task excess over 50ms, not Lighthouse TBT/INP. Evidence: `artifacts/fullstack/performance.json`, `performance-summary.txt`.

Before scaling, benchmark concurrent holds/checkout and database locks under realistic hot-event load. Add public catalog cache/invalidation or CDN caching with event lifecycle rules; keep ownership/hold/order responses private. Larger catalogs need server-paginated discovery/search rather than the current small bootstrap. Shared quote fetching and smarter inventory subscription/polling are potential integration optimizations. Existing per-component quote requests and 15-second visible seat refresh are correct but not a high-volume data-fetching strategy.

The final verification ledger is saved as `artifacts/fullstack/verification-complete.json`. Both typechecks, backend compilation and source/report formatting passed after the final changes.

## Production gaps and recommended next steps

1. Implement real provider intent/webhook/reconciliation/refund state machines with idempotent financial fulfillment and late/failed-payment compensation.
2. Add verified identity/recovery, staff MFA and audit trails; implement authenticated admission/check-in/revocation and key rotation before treating QR payloads as entry authority.
3. Provision managed PostgreSQL with least privilege, TLS/pooling, backups/PITR, tested restore/reconciliation and incident ownership. Never use the temporary test runtime for sales data.
4. Execute Docker images/Compose and CI on the target host; establish staging, controlled migrations, immutable deployments, rollback, DNS/TLS/CDN/header checks and secret management.
5. Add real email delivery and durable network-job recovery/alerts; expand live browser coverage, real-device/screen-reader/WebKit checks, load/chaos testing, telemetry/RUM and support/legal/tax operations.

See `docs/PRODUCTION_READINESS.md` for the complete deployment/security/operations checklist. Original visual-reference screenshots remain unavailable, so no new visual-reference approval is claimed. The system now has genuine database-backed behavior and transaction tests; the remaining gaps are explicitly documented rather than hidden behind simulated success.
