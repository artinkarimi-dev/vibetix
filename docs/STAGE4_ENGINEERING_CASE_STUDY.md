# VIBETIX — engineering case study for hiring teams

## Problem

A show has exactly **10 seats** and **1,000 independent users** attempt to reserve them. The product must reject all additional holds without turning network failures/HTTP 429 into "sold out" or counting duplicate checkouts as multiple purchases. This is a portfolio demo with **simulated payments**, not a payment processor or admission provider.

## Architecture

```text
Browser / React
   │ same-origin /api
   ▼
nginx (HTTPS at edge)
   │
   ▼
Fastify + validation + auth + abuse limits (Redis)
   │
   ├─ PostgreSQL / Prisma  ─ event row locking + unique constraints + orders
   └─ worker              ─ expiry + transactional outbox

Local race studio (localhost only)
   │ SSE progress / verified final report
   ▼
Docker-isolated test runner → 1,000 real HTTP requests → Fastify/PostgreSQL
```

**Booking correctness:** event/seat transaction locks and uniqueness guard against overselling, quote/server pricing protects totals, idempotency handles duplicate checkout. The Stage 2 suite uses 1,000 authenticated HTTP booking requests distributed over 10 specific seats, followed by the 10 winning checkouts and direct DB counts. The standalone studio is a *separate local observer*; its event stream is not the authority for final state.

**Verification:** the report is accepted only if 10 HTTP 200 holds, 990 HTTP 409 seat conflicts, zero unexpected responses, 10 sold seats, 0 outstanding holds, 10 orders/items/tickets/payments, 10 distinct order identities, and a new machine report from that precise invocation. The default in-flight request limit is 24, **not 1,000 simultaneous open requests**. The verification checker records actual peak; performance numbers are reported only after a live test, never as hard-coded claims.

## Threat review and mitigations

| Failure or attack | Engineering control | What still needs verification |
| --- | --- | --- |
| Same seat bought twice | Transactional event locking + Postgres integrity + idempotent order retries | Real DB race under higher measured contention; multi-node instances |
| CSRF / unauthorized orders | Same-origin checks, opaque HttpOnly session cookie, strict schemas and ownership checks | HTTPS browser tests on final DNS and proxy |
| Credential stuffing / abuse | Redis-backed rate limits, keyed identities, constrained errors | Production ACL/TLS/alert tuning, real NAT scenarios |
| Misleading 429/network errors | Load harness counts unexpected outcomes and fails the release gate | Actual run on controlled Docker host |
| Forged/old benchmark claim | Fresh-run artifact and exact response/database invariants; SHA256 hash in release ledger | An artifact hash is **not** a remote attestation or signed certificate |
| Leaked secrets | `.dockerignore`, env exclusions, secret-file deployment and limited high-confidence scanner | Independent history scan, secret-manager audit and rotation |
| Supply-chain drift | Locked dependency versions, digest-pinned base images, immutable runtime image digest requirement | CI on GitHub and image vulnerability/SBOM qualification |
| Plain HTTP or wrong domain | Dedicated HTTPS renderer, domain constraints, 14-day certificate warning, key matching | Real CA trust, nginx syntax, redirects and network reachability |
| Unsafe auto-release | CI returns nonzero on failed checks, live evidence gated, **no automatic public deploy** | Required branch protections and human-reviewed releases |

## Reproducibility / evidence hierarchy

1. **Source-only evidence**: Node test regressions + static policy gate (`npm run stage4:check`). Demonstrates tested logic, **not live PostgreSQL**.
2. **Local live evidence**: `npm run stage4:verify` on an actual Docker machine. Creates per-run reports in `artifacts/stage3/verified-*.json` and `artifacts/stage4/release-gate.json`. Verify git revision, timestamp, hash, concurrency, latency quantiles, responses and six DB counters.
3. **Independent CI evidence**: `.github/workflows/stage4-release.yml` run for the same commit, logs and artifact; requires GitHub configuration and an actual successful run.
4. **Public-host evidence**: authorized staging/prod deployment, external HTTPS/certificate chain and smoke validation, backup restore and alerts. **Not provided by this ZIP.**

## Talking points for a full-stack interview

- Why database state is authoritative and why changing frontend counters can't prove a correct booking transaction.
- Row locks vs optimistic concurrency, isolation levels, database indexes and contention hotspots.
- Why one HTTP request per client isn't proof of a distributed 1000-user test; meaning of 1000 *total* versus 24 *in flight*.
- Distinguishing sold-out conflicts from rate limiting, timeouts and infrastructure errors in both UI and metrics.
- Why order idempotency does not replace seat locking, and why the outbox matters when workers crash.
- Modeling build/release gates so missing Docker does not count as passing production-like tests.

**Suggested résumé claim once actually verified:** "Built a full-stack event-ticketing portfolio using React, Fastify, PostgreSQL and Redis; developed a repeatable 1,000-request/10-seat HTTP concurrency test, a live SSE results dashboard and CI release gates that reconcile booking and payment-simulation records against PostgreSQL." Specify the tested peak concurrency and measured p95 if supported by a linked run. Never claim successful live test before it executes.
