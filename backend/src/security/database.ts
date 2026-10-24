import type { Database } from "../database/client.js";
import type { Config } from "../config.js";
export async function verifyRuntimeDatabase(db: Database, cfg: Config) {
  if (cfg.NODE_ENV !== "production") return;
  const [role] = await db.$queryRaw<
    { unsafe: boolean }[]
  >`SELECT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) OR pg_has_role(current_user,d.datdba,'MEMBER') OR has_database_privilege(current_user,current_database(),'CREATE') OR has_schema_privilege(current_user,'public','CREATE') OR has_table_privilege(current_user,'public."_prisma_migrations"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege(current_user,'public."AuditLog"','SELECT,UPDATE,DELETE,TRUNCATE')) AS unsafe FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`;
  const [connection] = await db.$queryRaw<
    { ssl: boolean; timezone: string }[]
  >`SELECT ssl,current_setting('TimeZone') AS timezone FROM pg_stat_ssl WHERE pid=pg_backend_pid()`;
  if (!role || role.unsafe || !connection?.ssl || connection.timezone !== "UTC")
    throw new Error("Runtime database privilege/TLS verification failed.");
}
