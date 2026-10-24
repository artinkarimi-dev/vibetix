import { verifyMigrationState } from "./migration-state.mjs";
import { connect, target } from "./database.mjs";
let runtime, migration;
try {
  const rt = target("DATABASE_URL"),
    mt = target("MIGRATION_DATABASE_URL");
  if (
    rt.database !== mt.database ||
    rt.url.hostname !== mt.url.hostname ||
    rt.url.port !== mt.url.port ||
    rt.url.username === mt.url.username
  )
    throw new Error("Separate roles on one database required.");
  if (
    process.env.NODE_ENV === "production" &&
    [rt, mt].some(
      (t) =>
        t.url.searchParams.get("sslmode") !== "require" ||
        t.url.searchParams.get("sslaccept") !== "strict",
    )
  )
    throw new Error("Strict TLS required.");
  runtime = await connect("DATABASE_URL");
  migration = await connect("MIGRATION_DATABASE_URL");
  await runtime.query("BEGIN READ ONLY");
  await migration.query("BEGIN READ ONLY");
  for (const c of [runtime, migration])
    await c.query("SET LOCAL statement_timeout='10s'");
  const role = (
    await runtime.query(
      `SELECT current_user AS name, (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) OR pg_has_role(current_user,d.datdba,'MEMBER') OR has_database_privilege(current_user,current_database(),'CREATE') OR has_schema_privilege(current_user,'public','CREATE') OR has_table_privilege(current_user,'public."_prisma_migrations"','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege(current_user,'public."AuditLog"','SELECT,UPDATE,DELETE,TRUNCATE')) AS unsafe FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`,
    )
  ).rows[0];
  if (role?.name !== "vibetix_app" || role.unsafe)
    throw new Error("Runtime role unsafe.");
  const migrator = (
    await migration.query(
      `SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,has_schema_privilege(current_user,'public','CREATE') AS can_migrate FROM pg_roles WHERE rolname=current_user`,
    )
  ).rows[0];
  if (
    migrator.name !== "vibetix_migrator" ||
    !migrator.can_migrate ||
    [
      "rolsuper",
      "rolcreatedb",
      "rolcreaterole",
      "rolreplication",
      "rolbypassrls",
    ].some((k) => migrator[k])
  )
    throw new Error("Migration role unsafe.");
  if (process.env.NODE_ENV === "production")
    for (const c of [runtime, migration])
      if (
        !(
          await c.query(
            "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
          )
        ).rows[0]?.ssl
      )
        throw new Error("TLS missing.");
  for (const c of [runtime, migration])
    if ((await c.query("SHOW TimeZone")).rows[0].TimeZone !== "UTC")
      throw new Error("Application roles require UTC sessions.");
  const migrationCount = await verifyMigrationState(
    async (sql) => (await migration.query(sql)).rows,
  );
  for (const table of [
    "User",
    "Session",
    "Event",
    "EventSeat",
    "SeatHold",
    "Order",
    "OrderItem",
    "Ticket",
    "Payment",
    "OutboxJob",
  ]) {
    if (
      !(
        await runtime.query(
          "SELECT has_table_privilege(current_user,$1,'SELECT') AS allowed",
          [`public."${table}"`],
        )
      ).rows[0].allowed
    )
      throw new Error("Required runtime read denied.");
  }
  for (const [table, privilege] of [
    ["User", "INSERT"],
    ["Session", "INSERT,UPDATE,DELETE"],
    ["SeatHold", "INSERT,UPDATE,DELETE"],
    ["Favorite", "INSERT,UPDATE,DELETE"],
    ["Order", "INSERT"],
    ["OrderItem", "INSERT"],
    ["Payment", "INSERT"],
    ["Ticket", "INSERT"],
    ["OutboxJob", "INSERT,UPDATE"],
    ["AuditLog", "INSERT"],
  ]) {
    for (const p of privilege.split(","))
      if (
        !(
          await runtime.query(
            "SELECT has_table_privilege(current_user,$1,$2) AS allowed",
            [`public."${table}"`, p],
          )
        ).rows[0].allowed
      )
        throw new Error("Required runtime write denied.");
  }
  if (
    !(
      await runtime.query(
        `SELECT has_column_privilege(current_user,'public."EventSeat"','status','UPDATE') AS allowed`,
      )
    ).rows[0].allowed
  )
    throw new Error("Inventory status write denied.");
  const required = [
    "order_money_balanced",
    "event_seat_price_nonnegative",
    "OrderItem_eventSeatId_fkey",
    "Ticket_orderItemId_fkey",
    "Payment_orderId_fkey",
    "SeatHold_eventSeatId_fkey",
  ];
  const constraints = (
    await migration.query(
      "SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND convalidated",
    )
  ).rows.map((r) => r.conname);
  if (required.some((name) => !constraints.includes(name)))
    throw new Error("Critical constraint missing.");
  for (const name of [
    "OrderItem_eventSeatId_key",
    "Ticket_orderItemId_key",
    "Order_userId_idempotencyKey_key",
  ])
    if (
      !(
        await migration.query(
          "SELECT 1 FROM pg_index WHERE indexrelid=to_regclass($1) AND indisunique AND indisvalid",
          [`public."${name}"`],
        )
      ).rowCount
    )
      throw new Error("Unique index missing.");
  const triggers = (
    await migration.query(
      "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D'",
    )
  ).rows.map((r) => r.tgname);
  if (!triggers.includes("runtime_role_guard"))
    throw new Error("Runtime registration guard missing.");
  await runtime.query("COMMIT");
  await migration.query("COMMIT");
  console.info(
    JSON.stringify({
      passed: true,
      runtimeRole: "restricted",
      migrationRole: "separate non-superuser",
      migrations: migrationCount,
      criticalConstraints: true,
      timezone: "UTC",
      extensions: "No non-default extension required by current migrations",
      tls:
        process.env.NODE_ENV === "production"
          ? "verified"
          : "development boundary",
    }),
  );
} catch {
  console.error(
    "Database preflight failed; credentials and database rows are not printed.",
  );
  process.exitCode = 1;
} finally {
  await runtime?.end();
  await migration?.end();
}
