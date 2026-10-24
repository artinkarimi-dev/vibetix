# Stage 3 validation — scope and limitations

## Evidence available in this packaging environment

- **17 Node test cases passed**, including Stage 1 contract smoke, Stage 2 HTTP harness against a mock server (1,000 HTTP POST requests), Stage 2 rate-limit rejection, Stage 3 event integrity, Stage 3 server SSE/local security, Stage 3 verified-report lifecycle against simulated runner output, and the independent original showcase tests.
- HTML/CSS/JS browser layout was rendered at **1440px desktop** and **390px mobile**, with **exactly 1,000 result cells** and **no horizontal overflow** at either viewport. 390px focus/recording mode was inspected.
- Checked syntax of new server, runner and dashboard JS with Node.
- Real transport monitor explicitly distinguishes 409 seat conflicts from 429 rate limits, network errors, timeouts and unexpected 200 response bodies; these cases cannot produce a passing report.
- Confirmation is gated on completed race telemetry, 10 confirmed sold seats, 0 remaining holds, and the six expected PostgreSQL counters, plus a successful runner exit.

## Not verified in this packaging environment

- The environment does **not** have a working Docker Engine/Compose or installed project dependencies. Docker image build, Prisma/PostgreSQL migration, live Stage 1 full-stack purchase, and the **real Docker-backed Stage 2/3 1,000 HTTP run** could not be executed here. Therefore **do not claim production-readiness or a live database pass based on the included unit tests**.
- Standalone live benchmark requires the user's Docker-enabled machine and the actual output of `npm run stage3:all` / dashboard pass.
- Performance figures (RPS, p50/p95/p99) must be recorded by the real benchmark. No performance results are pre-filled.

## Signoff commands

```bash
npm run stage3:test
npm run stage3:all
npm run stage3:studio
```

`stage3:all` must exit with code 0 and write `artifacts/stage3/verified-<uuid>.json` before claiming real integration success. A previous pass should not be substituted for the current environment's run.
