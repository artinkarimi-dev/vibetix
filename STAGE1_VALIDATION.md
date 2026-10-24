# Stage 1 delivery and validation evidence

## Delivered changes

- Added `scripts/stage1-up.mjs` for guarded Docker Compose start, stop, status and diagnostics.
- Added `scripts/stage1-smoke.mjs` for an opt-in purchase check that operates through the real HTTP API, with a direct PostgreSQL order/item/ticket count.
- Added `scripts/tests/stage1-smoke.test.mjs` to exercise the smoke-check flow against an intentionally mocked HTTP/DB contract.
- Added package scripts `stage1:up`, `stage1:verify`, `stage1:status`, `stage1:logs`, `stage1:down`, `stage1:test`.
- Standardized the local Docker origin as `http://127.0.0.1:8080` to match the loopback-only published frontend port.
- Added the Persian operator guide `STAGE1_FA.md`; original Ticket Drop Lab and original source remain present.
- Excluded local `.env.*.local` configuration and its credentials from the deliverable ZIP.

## Checks executed in the delivery environment

| Check | Result | Meaning |
| --- | --- | --- |
| `npm run stage1:test` | PASS (1 test) | HTTP flow and reporting logic tested with mock server and mock DB shell response. **Not actual PostgreSQL.** |
| `npm run demo:test` | PASS (6 tests) | Original independent lab still works. **Not actual PostgreSQL.** |
| `node --check` on new scripts | PASS | JavaScript parses on local Node runtime. |
| Compose YAML structure and key startup dependencies | PASS static checks | YAML parses and service dependencies/volume/bind address are configured. **Not an executed Compose deployment.** |
| `npm run stage1:up` without Docker | Expected failure | Action fails with an actionable Docker-missing message, without wiping volumes. |

## Pending live verification

Docker Engine/Compose, pnpm packages, and PostgreSQL are not accessible in the delivery container (external registry is also unavailable). Consequently, the backend Docker image was **not built here**, migrations and seed were **not executed against a real PostgreSQL**, and the live purchase/DB assertions were **not observed**. These claims must not be marked passed based on the mock test.

On a Docker-capable machine, run:

```bash
npm run stage1:up
npm run stage1:verify
```

For an acceptable live Stage 1 sign-off, the latter must report 10 successful checks and create `artifacts/stage1/smoke.json` with `"passed": true`. It intentionally creates two fictional users and consumes one fictional seat in the persistent local DB. It does not delete or reset production data. The successful live check will establish database-backed checkout on the local Compose topology, **not** payment-provider readiness or 1,000-user load handling.
