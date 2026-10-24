# Database security

The API and worker use `vibetix_app`. Schema ownership and migrations use `vibetix_migrator`. Neither is a superuser, database creator, role creator, replication user or RLS bypass user. The runtime has no membership in other roles. Administrative/bootstrap credentials are never supplied to the API/worker.

Fresh-deployment execution identified that the initial migration's `CREATE SCHEMA IF NOT EXISTS` also requires CREATE on the dedicated database. Provisioning grants this schema-creation privilege only to the migrator; it does not grant the cluster-level CREATEDB attribute or any runtime schema authority.

`scripts/ops/database-security.mjs` is an explicitly authorized operation for a **dedicated application database**. It revokes PUBLIC database/schema privileges, transfers existing public application tables/enums and known trigger functions to the migrator, restricts search paths and applies explicit grants. It does not transfer database ownership. Do not run it against a shared database or without a reviewed backup/change window. Existing unsafe roles cause failure instead of silently preserving elevated permissions.

## Development

Fresh `node scripts/setup-local.mjs` generates independent bootstrap/migration/runtime passwords and an independent abuse key in an ignored mode-600 file. Compose runs a separate one-shot migration service: provision roles, migrate as migrator, seed **development only**, apply grants, then start the API as runtime. It never runs migrations/seed from API startup.

Existing `.env.local` files are preserved. When upgrading, add random `MIGRATION_DATABASE_PASSWORD`, `APP_DATABASE_PASSWORD` and `ABUSE_KEY_SECRET` values to the private file; configure native `DATABASE_URL` for the runtime and `MIGRATION_DATABASE_URL` for the migrator. Do not reuse the old powerful runtime connection. Compose does not publish PostgreSQL or Redis; native PostgreSQL must be provisioned separately. Back up existing volumes before changing roles. Do not delete a data volume to resolve a permissions error.

## Production / native dedicated database

Use a secret manager to supply these environment names; never put actual URLs/passwords in shell history:

- `DATABASE_ADMIN_URL`: temporary bootstrap connection with authority to create roles and reassign application objects.
- `MIGRATION_DATABASE_URL`: `vibetix_migrator`, independent password, same dedicated database.
- `DATABASE_URL`: `vibetix_app`, independent password, same database. Only this URL goes into runtime secrets.
- `DATABASE_EXPECTED_NAME`: exact database name; `ALLOW_DATABASE_ADMIN_OPERATION=true` is required for provisioning.

Run, in order, with the configured environment:

```sh
node scripts/ops/database-security.mjs roles
pnpm db:migrate
# Import approved catalog data separately; do not run development seed in production.
pnpm db:permissions
```

Provisioning is transactional. Existing passwords are preserved unless `ROTATE_DATABASE_ROLE_PASSWORDS=true` is explicitly supplied. Password rotation affects the database role across the cluster; coordinate every deployment using it. Provisioning must connect directly to PostgreSQL, not a transaction-mode pooler. A provider that prohibits these role/schema operations needs an equivalent reviewed provider-specific setup; the script is not a universal cloud database administrator.

## Required permissions

| Runtime object | Grants |
| --- | --- |
| User | SELECT, INSERT; no UPDATE; trigger forbids runtime INSERT of an ADMIN |
| Session, SeatHold, Favorite | SELECT/INSERT/UPDATE/DELETE |
| Artist, Venue, Event, OutboxJob | SELECT/INSERT/UPDATE |
| Section, Seat, Extra, PromoCode | SELECT only |
| EventSeat | SELECT/INSERT, UPDATE of status only |
| Order, OrderItem, Payment, Ticket | SELECT/INSERT; no edits/deletes |
| AuditLog | INSERT only; Prisma uses a non-returning insert |
| Prisma migration history, schema/DDL, sequences | No runtime grants |

These grants match current functionality, including role-protected catalog writes. They are not tenant row-level isolation: a compromised runtime can access permitted application rows. Future refunds, role changes or ticket lifecycle writers require reviewed permissions and transactional audit integration, not blanket CRUD grants. New migrations do **not** automatically grant all tables to runtime; update and review the allowlist and rerun grants.

Production server and worker startup inspect effective role privileges, schema/migration/audit-write authority, database ownership and actual connection TLS. They refuse unsafe connections. Runtime has statement/idle-in-transaction timeouts; still set provider connection limits/pools against measured load. Keep migrations on their separate job identity.

Prisma production URLs require `sslmode=require&sslaccept=strict`. Supply the provider's CA using Prisma's supported certificate options where required, validate hostname/certificate behavior in staging, and never use permissive certificate acceptance. Node operations tools use verified TLS and optional `PGSSLROOTCERT`; native backup tools use `verify-full`. Local loopback testing deliberately uses unencrypted PostgreSQL. Actual production certificates, credentials and grants have not been verified here.

Local tests cover permitted runtime operations, denied DDL/role elevation/audit changes and a successful rolled-back DDL probe as migrator. See the final hardening report for results. [PostgreSQL schema guidance](https://www.postgresql.org/docs/17/ddl-schemas.html) explains why PUBLIC schema CREATE privileges and search paths matter.


## UTC deployment gate (2026-10-15)

Application timestamps use Prisma's UTC convention. Provisioning now sets `TimeZone=UTC` for both dedicated roles in the target database, and production runtime startup plus preflight reject non-UTC sessions. Reconnect existing pools after applying role settings. Raw availability and outbox comparisons explicitly convert the database clock to UTC, so a non-UTC session cannot make a future UTC retry eligible early. The worker backlog-age expression uses the same convention. PostgreSQL explains mixed timestamp comparison behavior in its [date/time operators documentation](https://www.postgresql.org/docs/17/functions-datetime.html).

If an earlier deployment wrote default timestamps under a non-UTC session, investigate affected rows and their originating writer/timezone before migration or reissue decisions. This sprint does not silently rewrite historical timestamps. Existing operator/bootstrap connections must also use UTC when importing real application data. The read-only `db:preflight` command checks safe roles, TLS in production, UTC, exact migration/checksum state, critical validated constraints/indexes, expected runtime permissions and the registration trigger. It never grants runtime access to migration history.
