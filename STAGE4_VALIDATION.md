# VIBETIX Stage 4 — Verification ledger (Oct 22, 2026)

## What was actually performed here

- Extracted the delivered Stage 3 ZIP as the source of truth, preserved stages 1–3 and added Stage 4 on top.
- Added a release gate that distinguishes `static-checks-passed`, `live-benchmark-verified` and `blocked` instead of treating a mock as a production pass.
- Ran Node built-in regression tests for Stage 1–4 and showcase API; **22 tests passed** after Stage 4 TLS tests were added (test count must be reconfirmed in final log).
- Verified that the nginx renderer rejects an invalid placeholder domain, and that deployment preflight fails closed when real images/secrets/domain/TLS inputs are absent.
- Created an optional SHA256 package manifest verification command `npm run stage4:package-check`; this verifies unchanged packaged files after extraction, not runtime functionality.
- Inspected production Compose and removed direct mounting of the dummy `frontend/https.conf.example` as the production active vhost. The operator must supply a domain-specific approved file.
- Added dedicated, non-privileged GitHub Actions static and live gates, artifact capture and an explicit separation between PR checks and main/manual real-load checks. Actions have **not** been executed in the owner's actual repository.
- Added a portfolio architecture case study and operator deployment/rollback runbook.

## Limitations / outstanding gates

- Docker/Compose and project dependencies are **not available** in the authoring environment. Therefore no actual PostgreSQL instance, Prisma migrations, container build, nginx container runtime or 1,000-to-10 real database load test were executed here.
- Actual GitHub Actions on the target repository, `pnpm` install, full prettier/lint/typecheck/build, real Docker image scan, live staging HTTPS, backup/restore rehearsal, operational alerts and any public deployment are **NOT VERIFIED**. They must be run by the owner on a supported machine (including `pnpm stage4:format` before the first commit) before making external readiness claims.
- Default isolated load is 1,000 total HTTP requests with a concurrency cap of 24 (configurable); never claim 1,000 concurrent open sockets at default settings.
- No real payment processing or commercial admissions capability exists; the system is an engineering portfolio demo.

## Commands to complete proof on a Docker-enabled machine

```bash
npm run stage4:check
npm run stage4:verify
npm run stage4:package-check
```

`stage4:verify` is the required real test. See `STAGE4_FA.md` and `docs/STAGE4_ENGINEERING_CASE_STUDY.md` for acceptance criteria and how to cite the SHA256 evidence.
