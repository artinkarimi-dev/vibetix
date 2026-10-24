# Stage 2 — verification status

## Previous Stage 1 reviewed

- Stage 1's Docker services, local secrets generation, reverse-proxy path and 10-check real checkout contract were inspected.
- Stage 1 contract test re-run as part of Stage 2 automated verification. It uses a mock HTTP server and a fake `docker` command; it does **not** prove live persistence.
- Stage 1 live signoff now has a combined runner (`npm run stage2:all`) which runs Stage 1 Docker startup + real `stage1:verify` before starting Stage 2.
- Live Stage 1 Docker/PostgreSQL is **not verified in the delivery environment**.

## Stage 2 delivered

- Native Node.js bounded-concurrency HTTP load driver (true HTTP POST calls rather than an in-process booking simulation).
- Separate, automatically generated Docker Compose project with its own PostgreSQL/Redis storage, and isolated 10-seat event plus 1000 independent temporary test sessions.
- Complete persisted checkout verification; HTTP response classification, P50/P95/P99 latency, throughput and unexpected-error reporting.
- Isolated cleanup using the unique Compose project ID and `down --volumes`; existing Stage 1 volumes are never passed to a volume-deleting command.
- Code/tests intentionally reject any rate-limited or transport-failed request from being counted as a seat conflict.
- Combined Stage 1 + Stage 2 operational command and Persian runbook.

## Delivery environment evidence

| Check | Status | Meaning |
| --- | --- | --- |
| `node --test scripts/tests/stage1-smoke.test.mjs scripts/tests/stage2-core.test.mjs showcase/*.test.mjs` | PASS: 10 tests | Contract tests, mock HTTP request driver, independent front-end demo engine tests |
| `node --check` Stage 2 JavaScript | PASS | Scripts parse on Node 22 |
| Docker Compose YAML parse | PASS | Base and stage2 overlay parse; Docker Compose runtime config itself unverified |
| `node scripts/check-secrets.mjs` | PASS | File-pattern check; ignored private/env and Git history not scanned |
| `node scripts/security-check.mjs` | NOT RUN TO COMPLETION | It requires a built frontend `dist/`, unavailable because build dependencies are not installed in this environment |
| Docker Compose + real PostgreSQL Stage 1 smoke | **NOT EXECUTED** | Docker unavailable here |
| Stage 2 isolated 1000 HTTP calls against real Fastify/PostgreSQL | **NOT EXECUTED** | Docker unavailable here |

**Do not cite the mock 10/990 result as a successful live PostgreSQL benchmark.** Obtain machine-generated reports by running `npm run stage2:all` on a Docker-equipped machine.
