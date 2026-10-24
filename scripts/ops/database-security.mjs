import {
  connect,
  target,
  requireOperation,
  sqlIdentifier as ident,
  sqlLiteral as literal,
} from "./database.mjs";

const database = requireOperation("DATABASE_ADMIN_URL");
const roles = [
  ["MIGRATION_DATABASE_URL", "vibetix_migrator"],
  ["DATABASE_URL", "vibetix_app"],
];
for (const [env, role] of roles) {
  const t = target(env);
  if (
    t.database !== database ||
    decodeURIComponent(t.url.username) !== role ||
    decodeURIComponent(t.url.password).length < 32
  )
    throw new Error(
      "Role URLs must target the dedicated database with correct roles and strong independent passwords.",
    );
}
if (
  target("DATABASE_URL").url.password ===
  target("MIGRATION_DATABASE_URL").url.password
)
  throw new Error("Role passwords must differ.");
const db = await connect("DATABASE_ADMIN_URL");
try {
  await db.query("BEGIN");
  for (const [env, role] of roles) {
    const existing = await db.query(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolreplication FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (existing.rows[0] && Object.values(existing.rows[0]).some(Boolean))
      throw new Error(
        "Existing role has unsafe authority; manual review required.",
      );
    const password = literal(decodeURIComponent(target(env).url.password));
    if (!existing.rowCount)
      await db.query(
        `CREATE ROLE ${ident(role)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${password}`,
      );
    else if (process.env.ROTATE_DATABASE_ROLE_PASSWORDS === "true")
      await db.query(`ALTER ROLE ${ident(role)} PASSWORD ${password}`);
  }
  const membership = await db.query(
    "SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='vibetix_app'",
  );
  if (membership.rowCount)
    throw new Error("Runtime role must not hold other roles.");
  const owned = await db.query(
    "SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database() AND r.rolname='vibetix_app'",
  );
  if (owned.rowCount)
    throw new Error("Runtime role must not own the database.");
  await db.query(
    `REVOKE ALL ON DATABASE ${ident(database)} FROM PUBLIC,vibetix_app`,
  );
  await db.query(
    `GRANT CONNECT ON DATABASE ${ident(database)} TO vibetix_migrator,vibetix_app`,
  );
  // CREATE SCHEMA requires database CREATE even for IF NOT EXISTS on public.
  // This is schema authority, not the cluster-level CREATEDB role attribute.
  await db.query(
    `GRANT CREATE ON DATABASE ${ident(database)} TO vibetix_migrator`,
  );
  await db.query("REVOKE ALL ON SCHEMA public FROM PUBLIC,vibetix_app");
  await db.query("ALTER SCHEMA public OWNER TO vibetix_migrator");
  if (process.argv[2] !== "roles") {
    // Transfer application objects, not database ownership or objects in other schemas/databases.
    for (const row of (
      await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      )
    ).rows)
      await db.query(
        `ALTER TABLE public.${ident(row.tablename)} OWNER TO vibetix_migrator`,
      );
    for (const row of (
      await db.query(
        "SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND typtype='e'",
      )
    ).rows)
      await db.query(
        `ALTER TYPE public.${ident(row.typname)} OWNER TO vibetix_migrator`,
      );
    for (const name of ["check_inventory_venue", "check_order_item_event"])
      await db.query(
        `ALTER FUNCTION public.${ident(name)}() OWNER TO vibetix_migrator`,
      );
    await db.query(
      "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,vibetix_app",
    );
    await db.query(
      "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,vibetix_app",
    );
    await db.query(
      "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC",
    );
    await db.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE vibetix_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC",
    );
    await db.query("GRANT USAGE ON SCHEMA public TO vibetix_app");
    const grants = [
      'GRANT SELECT,INSERT ON "User" TO vibetix_app',
      'GRANT SELECT,INSERT,UPDATE,DELETE ON "Session","SeatHold","Favorite" TO vibetix_app',
      'GRANT SELECT,INSERT,UPDATE ON "Artist","Venue","Event","OutboxJob" TO vibetix_app',
      'GRANT SELECT ON "Section","Seat","Extra","PromoCode" TO vibetix_app',
      'GRANT SELECT,INSERT ON "EventSeat","Order","OrderItem","Payment","Ticket" TO vibetix_app',
      'GRANT UPDATE(status) ON "EventSeat" TO vibetix_app',
      'GRANT INSERT ON "AuditLog" TO vibetix_app',
    ];
    for (const sql of grants) await db.query(sql);
    // Runtime registration must never insert a privileged account, even via direct DML.
    await db.query(
      `CREATE OR REPLACE FUNCTION public.guard_runtime_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_user='vibetix_app' AND NEW.role<>'CUSTOMER' THEN RAISE EXCEPTION 'Privileged account creation prohibited' USING ERRCODE='42501'; END IF; RETURN NEW; END $$`,
    );
    await db.query(
      "ALTER FUNCTION public.guard_runtime_role() OWNER TO vibetix_migrator",
    );
    await db.query(
      "REVOKE ALL ON FUNCTION public.guard_runtime_role() FROM PUBLIC,vibetix_app",
    );
    await db.query(
      'DROP TRIGGER IF EXISTS runtime_role_guard ON public."User"',
    );
    await db.query(
      'CREATE TRIGGER runtime_role_guard BEFORE INSERT OR UPDATE OF role ON public."User" FOR EACH ROW EXECUTE FUNCTION public.guard_runtime_role()',
    );
  }
  for (const role of ["vibetix_migrator", "vibetix_app"]) {
    await db.query(
      `ALTER ROLE ${ident(role)} IN DATABASE ${ident(database)} SET TimeZone='UTC'`,
    );
    await db.query(
      `ALTER ROLE ${ident(role)} IN DATABASE ${ident(database)} SET search_path=${role === "vibetix_migrator" ? "public" : "pg_catalog,public"}`,
    );
  }
  await db.query("ALTER ROLE vibetix_app SET statement_timeout='15s'");
  await db.query(
    "ALTER ROLE vibetix_app SET idle_in_transaction_session_timeout='20s'",
  );
  await db.query("COMMIT");
  console.info(
    "Database role separation and explicit grants applied. No credentials printed.",
  );
} catch {
  await db.query("ROLLBACK");
  console.error(
    "Database provisioning failed; transaction rolled back. Check dedicated-database configuration and permissions.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
