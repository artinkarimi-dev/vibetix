export function verifyDemoResetTarget(env: Record<string, string | undefined>) {
  if (
    env.APP_MODE !== "portfolio" ||
    env.DEMO_RESET_CONFIRM !== "DELETE_PORTFOLIO_DATA" ||
    env.DEMO_RESET_OFFLINE !== "true"
  )
    throw new Error(
      "Explicit portfolio mode, offline maintenance and reset confirmation are required.",
    );
  let name: string;
  try {
    name = decodeURIComponent(
      new URL(env.DEMO_DATABASE_ADMIN_URL ?? "").pathname.slice(1),
    );
  } catch {
    throw new Error("Invalid demo reset target.");
  }
  if (
    !/^[a-z0-9_]+_demo(?:_test)?$/.test(name) ||
    env.DATABASE_EXPECTED_NAME !== name
  )
    throw new Error(
      "Reset is restricted to an explicitly matched dedicated *_demo database.",
    );
  return name;
}
