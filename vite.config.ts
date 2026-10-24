import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const publicVariables = new Set([
    "VITE_USE_FIXTURES",
    "VITE_PROFILE",
    "VITE_SEAT_HOLD_MS",
    "VITE_PAYMENT_DELAY_MS",
    "VITE_PAYMENT_FAILURE",
  ]);
  if (Object.keys(env).some((name) => !publicVariables.has(name)))
    throw new Error(
      "Unexpected public build configuration. VITE_ variables are exposed to the browser; review the allowlist.",
    );
  if (
    command === "build" &&
    (mode === "test" ||
      env.VITE_USE_FIXTURES === "true" ||
      process.env.VIBETIX_FIXTURE_TESTS === "true")
  )
    throw new Error(
      "Fixture authentication and checkout cannot be included in a deployable build.",
    );
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: { "/api": "http://127.0.0.1:3001" },
      watch: { ignored: ["**/artifacts/**"] },
    },
  };
});
