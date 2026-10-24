# Portfolio demo operator guide

Current scope: a public engineering demonstration, with fictional data and no financial settlement or admission. See [readiness](PORTFOLIO_PRODUCTION_READINESS.md). This guide prepares a deployment; no remote deployment has been executed or authorized.

## Required services and configuration

Use Node 24/pnpm 11.25.0, PostgreSQL with verified TLS, authenticated TLS Redis for shared rate limits, an API process, a worker process and an HTTPS static/reverse-proxy service. These can run on modest infrastructure; managed enterprise services are not required. Keep PostgreSQL, Redis and API ports private. Publish only the HTTPS edge. Set memory/CPU/storage limits and monitor actual capacity before exposing an unrestricted demo.

| Configuration | Required behavior |
| --- | --- |
| `NODE_ENV=production` | Secure host cookies, HTTPS/TLS/role checks |
| `APP_MODE=portfolio` | Explicit no-network demo payment and email sink |
| `DATABASE_URL` or `_FILE` | Restricted `vibetix_app` role on a dedicated `vibetix_demo` database; `sslmode=require&sslaccept=strict&sslcert=/protected/ca` |
| `MIGRATION_DATABASE_URL` | Separate migrator, supplied only to offline migration/seed jobs |
| `REDIS_URL` or `_FILE` | `rediss://` with explicit ACL username/password and a trusted CA |
| `TICKET_SIGNING_KEY` or `_FILE` | Independent random secret, at least 32 characters; QR remains demo-only |
| `ABUSE_KEY_SECRET` or `_FILE` | Different random secret for keyed abuse identities |
| `APP_ORIGIN` | Exact canonical HTTPS origin, without trailing slash/path |
| `TRUSTED_PROXY_CIDRS` | Exact trusted proxy addresses; never wildcard trust/hop counts |
| `ALLOW_SIMULATED_PAYMENTS=false` | Legacy simulation remains prohibited in production; portfolio adapter is separately selected |
| `EMAIL_TRANSPORT=disabled` | No local contact artifacts in production; portfolio sink records job completion without delivery |
| `NODE_EXTRA_CA_CERTS`, `PGSSLROOTCERT` | Operator-supplied trust chains when private CAs are used |

Defaults: ten-minute holds (5–900 seconds configurable), global 600 requests/minute, 10 auth IP attempts/15 minutes, 20 keyed identity attempts/15 minutes, 30 hold attempts/minute, 10 checkout attempts/minute, 30 promo attempts/minute. Review shared-NAT behavior and target load before changing limits. Restrict the Redis application ACL to `~vibetix:abuse:v1:*` and `ping`, `info`, `eval`, `incr`, `pexpire`, `pttl`, `client|setname`; disable the default user and use an independent generated password. The isolated native runner demonstrates the application ACL in `scripts/preproduction-validation.mjs`; its separate validator/admin identity is test tooling and must not be given to the application. Choose noeviction, TLS and private networking. Rate limits do not bound cumulative database growth, so an owner must monitor storage and choose a reset schedule.

`*_FILE` values and inline equivalents are mutually exclusive. Never place secrets in `VITE_*`, image layers, committed env files or screenshots. The runtime must not receive migration/reset/backup credentials. Demo seed refuses administrator bootstrap. Existing production admin MFA/session checks remain closed; no demo bypass is provided.

## Build and initialize

1. Preserve the source in an owner-approved Git repository. Run checked-in CI for the actual revision. Pin/review runtime artifacts; a local pass does not prove remote provenance.
2. Run `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm build`, and `pnpm backend:build`. Keep fixture mode false; deployable builds reject fixture authentication/checkout.
3. Provision independent database owner/migrator/runtime roles using [database security](DATABASE_SECURITY.md). Create a dedicated `*_demo` database; never reuse commercial/customer data. Supply `MIGRATION_DATABASE_URL` and run `pnpm db:migrate`.
4. With `APP_MODE=portfolio`, no `ADMIN_EMAIL`/`ADMIN_PASSWORD`, and `DATABASE_URL` temporarily set to the migrator/owner URL, run `pnpm db:seed`. New demo event dates start thirty days ahead; rerunning seed preserves existing records instead of silently changing receipts. Reapply/verify runtime grants after initialization.
5. Run `pnpm db:preflight` with protected operator configuration, then launch API and worker with runtime-only configuration. Readiness `/api/health/ready` must return 200; liveness `/api/health/live` alone does not establish database/Redis readiness. Check the worker's structured heartbeat and queue counts (15-second heartbeat).
6. Configure the one-origin proxy using `frontend/https.conf.example`. Verify HTTP redirect, certificate renewal, security headers, Secure cookies, forwarding spoof rejection and private network boundaries on the actual host.
7. Register a fictional demo account and exercise catalog → hold → extras → checkout → confirmation → ticket history → refresh. Verify the simulation banner, zero card fields, no email delivery, no admin access and no real admission claim. Exercise expiry, replay, foreign ticket lookup and readiness failure on an isolated staging copy.

For container hosts, combine `deploy/compose.production.yml` and `deploy/compose.portfolio.yml` using `docker compose -f ... -f ... config` before launching. Supply reviewed immutable frontend/backend image digests, protected secret exports, certificate files and external private database/Redis services. The portfolio overlay changes only the explicit adapter mode and leaves production safeguards enabled. The template is not a turnkey managed platform; certificate-aware edge readiness and worker monitoring remain operator tasks. Docker images/layers were not executed or scanned on this host.

## Offline reset and retention

The public site has no reset endpoint. Accounts/orders are disposable; disclose resets and ask visitors to use fictional details. An operator must choose and publish a retention/reset interval before public exposure. Reset/reseed before the earliest fictional show starts (new seeds start thirty days ahead), so the small demo catalog remains future-dated. Rate limiting is not a substitute for database capacity monitoring.

1. Remove public traffic, stop **all** API/worker instances, and confirm no users rely on the disposable dataset. If retaining a backup for engineering diagnosis, protect it and delete it according to the chosen retention policy.
2. In a protected operator shell, supply `APP_MODE=portfolio`, `DEMO_DATABASE_ADMIN_URL` (dedicated demo owner), `DATABASE_EXPECTED_NAME` (exact name), `DEMO_RESET_CONFIRM=DELETE_PORTFOLIO_DATA`, and `DEMO_RESET_OFFLINE=true`. In production, use verified database TLS and `PGSSLROOTCERT`.
3. Run `pnpm demo:reset --dry-run`. Then, only for the intentionally disposable dataset, run `pnpm demo:reset`.
4. The transaction removes accounts, sessions, holds, orders, tickets, outbox, audit rows and catalog data. It preserves migration history and role grants; it does not DROP databases or CASCADE tables. It refuses non-demo payment providers, a mismatched/non-demo database and active `vibetix_app` connections. The offline flag is an operator assertion; pause traffic and stop every instance rather than relying solely on its connection check.
5. Reseed with the portfolio configuration and temporary migrator/owner `DATABASE_URL`; clear elevated variables, restart using runtime credentials and perform the smoke journey. Existing saved links/accounts stop working after reset, as disclosed in the interface.

This is a demo lifecycle strategy, not financial disaster recovery or an erasure API. The isolated native test creates and drops its own randomly named database to verify reset refusal, dry-run preservation, successful reset, preserved migrations and reseed. No working developer or public dataset was reset during this task.

## Native QA prerequisites

`pnpm test:preproduction` needs Linux, OpenSSL, installed embedded PostgreSQL (currently 18.4), matching-major `pg_dump`/`pg_restore`, TLS-capable Redis, nginx with mime.types and Playwright Chromium. It owns a temporary database cluster and loopback ports; it refuses occupied ports. Never supply real infrastructure credentials.

Install browser tooling with `pnpm exec playwright install chromium` (or `--with-deps` on a supported disposable CI host). `QA_CHROMIUM_EXECUTABLE` selects an existing Chromium executable. On this validation host a supported Ubuntu fallback browser was downloaded with `PLAYWRIGHT_BROWSERS_PATH=/tmp/vibetix-playwright`; that variable must also be supplied to normal Playwright discovery unless the executable override is set.

Native tool overrides:

- `QA_OPS_TOOLS`: extracted root containing `usr/bin/redis-server` and `usr/lib/postgresql/18/bin/{pg_dump,pg_restore}`.
- `PG_DUMP_BIN`, `PG_RESTORE_BIN`: explicit backup client paths.
- `QA_NGINX_EXECUTABLE`, `QA_NGINX_MIME_TYPES`: nginx binary and mime file paths.
- `QA_NATIVE_LIBRARY_PATH`: PostgreSQL native shared-library directory (normally the installed embedded runtime library directory).

The runner's legacy fallback tool paths point to `/tmp/vibetix-ops-tools/root` and `/tmp/vibetix-preproduction-tools/root`. These directories are ephemeral and **not provided by pnpm install**. Provision tools on each fresh host and set the overrides. On Ubuntu-compatible machines, download distribution Redis/nginx and library packages with `apt-get download`, then use `dpkg-deb -x` into a private QA root; this does not require installing/running host services. Obtain matching PostgreSQL clients from the official [PGDG repository](https://apt.postgresql.org/). Inspect native dependencies with `ldd`, and verify binary versions before starting the suite. Do not reuse these tooling packages as a production image security qualification.

Run `PNPM_STORE_DIR=<current-store> QA_CHROMIUM_EXECUTABLE=<browser> pnpm release:verify`. The result ledger distinguishes executed checks from unavailable Docker/remote/host checks. Also run standalone `pnpm test:payment-failure`. Preserve sanitized summaries only. `artifacts/preproduction/private-*` contains generated local credentials, keys, logs and encrypted backup evidence; do not publish it.

## Public-host acceptance still required

An authorized owner must select the host/domain, protect secrets, qualify proxy/TLS/private-service access, run remote CI, configure bounded resources/log retention/reset and contact ownership, verify target smoke checks, and approve opening traffic. No real provider, email delivery, admission service, paid monitoring platform, merchant contract or financial recovery SLA is required for this demo. A native local pass cannot establish those external host properties.
