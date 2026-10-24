import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const password = randomBytes(24).toString("hex");
const migrationPassword = randomBytes(32).toString("hex"),
  appPassword = randomBytes(32).toString("hex");
const content = `# Generated local configuration. Never commit.\nPOSTGRES_PASSWORD=${password}\nMIGRATION_DATABASE_PASSWORD=${migrationPassword}\nAPP_DATABASE_PASSWORD=${appPassword}\nDATABASE_URL=postgresql://vibetix_app:${appPassword}@127.0.0.1:5432/vibetix?schema=public\nMIGRATION_DATABASE_URL=postgresql://vibetix_migrator:${migrationPassword}@127.0.0.1:5432/vibetix?schema=public\nTICKET_SIGNING_KEY=${randomBytes(48).toString("hex")}\nABUSE_KEY_SECRET=${randomBytes(32).toString("hex")}\nAPP_ORIGIN=http://127.0.0.1:8080\nHOST=127.0.0.1\nPORT=3001\nALLOW_SIMULATED_PAYMENTS=true\nEMAIL_TRANSPORT=local\nNODE_ENV=development\n`;
await writeFile(".env.local", content, { flag: "wx", mode: 0o600 });
console.info(
  "Created .env.local with random local credentials. Existing files are never overwritten.",
);
