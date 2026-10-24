import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestFile = resolve(root, 'PACKAGE_SHA256SUMS.txt');
let failures = 0;
try {
  const manifest = await readFile(manifestFile, 'utf8');
  const lines = manifest.trim().split('\n');
  if (!lines.length || lines.length < 200) throw new Error('Unexpectedly small package manifest');
  let checked = 0;
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_./ -]+)$/.exec(line);
    if (!match || match[2].startsWith('/') || match[2].split('/').includes('..') || match[2] === 'PACKAGE_SHA256SUMS.txt') throw new Error('Invalid or unsafe manifest record');
    let content;
    try { content = await readFile(resolve(root, match[2])); }
    catch { console.error(`Missing package input: ${match[2]}`); failures++; continue; }
    if (createHash('sha256').update(content).digest('hex') !== match[1]) { console.error(`Modified package input: ${match[2]}`); failures++; }
    checked++;
  }
  console.log(`Package integrity: ${checked} file(s) checked; ${failures} mismatches.`);
} catch (error) { console.error(`Package integrity failed: ${error.message}`); failures++; }
if (failures) process.exitCode = 1;
