# VIBETIX

VIBETIX is a full-stack ticketing portfolio application built around the part of event commerce that is easy to get wrong: protecting scarce seats while multiple buyers act at once. It includes event discovery, authenticated accounts, exact seat holds, server-priced checkout, simulated orders, digital tickets, background jobs, and an operational Docker setup.

All artists, venues, orders, QR codes, and payments are fictional. This is not a payment product, admission system, or hosted commercial service.

## Why this project

The project demonstrates practical full-stack trade-offs rather than only a polished UI:

- Exact-seat reservations use event-level transaction locking plus database uniqueness constraints to prevent overselling.
- Checkout is idempotent per user and request key, so retries do not create duplicate orders or tickets.
- Expired holds and post-order work are handled by a worker and transactional outbox.
- The API owns pricing, inventory, authorization, and order state; the browser never decides them.
- Portfolio mode is deliberately fail-closed: it uses a simulated payment adapter, sends no email, and requires a dedicated demo database.

## Stack

| Area | Technology |
| --- | --- |
| Web client | React 19, TypeScript, Vite, React Router, Zustand |
| API | Fastify, Zod, Prisma |
| Data | PostgreSQL, Redis |
| Background work | Node worker, transactional outbox |
| Delivery | Docker Compose, Nginx, GitHub Actions |
| Verification | Vitest, Playwright, ESLint, Prettier, TypeScript |

## Architecture

```text
React client → Nginx → Fastify API → PostgreSQL
                         │             │
                         ├── Redis     └── Outbox jobs → Worker
                         └── Zod / authorization / pricing
```

| Path | Responsibility |
| --- | --- |
| `src/` | Responsive React client, routes, booking state, API transport |
| `backend/src/` | Fastify application, domain services, security controls, worker |
| `backend/prisma/` | Schema, migrations, seed data, relational invariants |
| `packages/shared/` | Shared request and response contracts |
| `tests/`, `backend/tests/` | Unit, regression, API, security, and browser checks |
| `scripts/` | Local environment, release, database, and load-verification tooling |
| `deploy/`, `frontend/` | Deployment policies and Nginx configuration |
| `docs/` | Architecture, security, deployment, and operational evidence |

## Reservation model

For each hold, quote, or order, the service locks the event row, releases expired holds while the lock is held, then validates every requested seat. PostgreSQL constraints provide a second line of defense:

- one `EventSeat` per event/seat pair;
- one active hold or one order item per event seat;
- one order per user/idempotency key;
- one payment and one ticket per order item.

This intentionally favors correctness and explainability for a portfolio-sized catalog. It is not presented as a multi-region, high-throughput ticketing design.

## Run locally

Requirements: Node 24, pnpm 11.25.0, and Docker Engine with Compose v2 for the complete stack.

```sh
pnpm install --frozen-lockfile
pnpm local:up
```

Open `http://127.0.0.1:8080`. The local setup creates an ignored, permission-restricted `.env.local` when needed and starts PostgreSQL, Redis, migrations, seed data, the API, worker, and frontend. It is for local demonstration only.

For native development, provision PostgreSQL and Redis, copy `backend/.env.example` to an ignored `.env.local`, use independent credentials for the migrator and application roles, then run:

```sh
pnpm db:generate
pnpm db:migrate
DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm db:seed
pnpm backend:dev
pnpm worker
pnpm dev
```

Do not put secrets in `VITE_*` variables. The Vite development proxy expects the API on loopback port 3001.

## Verification

```sh
pnpm lint
pnpm format:check
pnpm db:generate
pnpm typecheck
pnpm backend:typecheck
pnpm build
pnpm backend:build
pnpm test
pnpm demo:test
pnpm stage4:check
pnpm security:check
pnpm audit --prod
```

Browser tests require an installed Playwright browser:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:portfolio
```

Database-backed API and concurrency checks deliberately require an isolated `*_demo_test` database, `ALLOW_DATABASE_TESTS=true`, and a test Redis URL. The Docker-backed Stage 2/3 harness records 1,000 actual HTTP attempts against 10 seats only when Docker and PostgreSQL provenance are available. Mock or static checks are not presented as proof of a production database benchmark.

## Security boundaries

- Session tokens are opaque, hashed server-side, and delivered through HttpOnly cookies.
- CORS and mutation origin checks are explicit; request validation is schema-based.
- Redis-backed abuse controls fail closed when required in the protected profile.
- Containers run with dropped capabilities, read-only filesystems where possible, non-root runtime users, and pinned base images.
- `.env*`, generated artifacts, local databases, build output, and dependencies are excluded from version control.

The project contains no live payment integration, password reset flow, email delivery service, venue scanner, or public administrator interface. These are intentional scope limits, not hidden production features.

## Documentation

- [Portfolio deployment and operator guide](docs/PORTFOLIO_DEPLOYMENT.md)
- [Database security model](docs/DATABASE_SECURITY.md)
- [Docker security notes](docs/DOCKER_SECURITY.md)
- [Final production-readiness audit](docs/FINAL_PRODUCTION_READINESS_AUDIT.md)
- [Stage 4 engineering case study](docs/STAGE4_ENGINEERING_CASE_STUDY.md)
- [Asset inventory and attribution](docs/ASSETS.md)

## License and use

This repository is presented as a portfolio project. Do not treat its fictional data or simulation flows as a ticketing service.
