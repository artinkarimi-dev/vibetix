import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHttpsTemplate } from './policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const domain = process.argv[2] ?? '';
const target = resolve(root, 'artifacts/stage4/nginx/https.conf');
try {
  const template = await readFile(resolve(root, 'frontend/https.conf.example'), 'utf8');
  const config = renderHttpsTemplate(template, domain);
  await mkdir(dirname(target), { recursive: true, mode: 0o755 });
  await writeFile(target, config, { mode: 0o644, flag: 'w' });
  console.log(`Rendered domain-specific HTTPS vhost: ${target}`);
  console.log('Review this file and run nginx -t with your certificate mounts before public traffic.');
} catch (error) { console.error(`Cannot render HTTPS config: ${error.message}`); process.exitCode = 1; }
