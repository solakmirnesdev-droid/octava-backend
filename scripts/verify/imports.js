/**
 * Resolves every import in every script, and reports the ones that do not.
 *
 *   node scripts/verify/imports.js
 *
 * AI-DECISION: written before the scripts folder was reorganised, and kept
 * afterwards. Moving a file one directory deeper silently invalidates every
 * `../src/...` in it, and a broken script does not announce itself — it fails
 * the next time somebody runs it, which for an overnight job means the morning.
 * This turns "I think I fixed all the paths" into a number.
 *
 * Static only: it reads import specifiers and checks the file exists. It does
 * not execute anything, so it is safe to run against a database being written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptsDir = path.join(root, 'scripts');

/** Every .js under scripts/, at any depth. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const IMPORT = /(?:^|\n)\s*import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * A path the code spawns rather than imports — a scripts/... path written
 * inside a string literal, as the overnight orchestrator's table does.
 */
const SPAWNED = /['"](scripts\/[A-Za-z0-9_./-]+\.js)['"]/g;

const files = walk(scriptsDir);
const broken = [];
const missingSpawn = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const here = path.dirname(file);

  for (const re of [IMPORT, DYNAMIC]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      // Bare specifiers are packages; node resolves those itself.
      if (!spec.startsWith('.')) continue;

      const target = path.resolve(here, spec);
      if (!fs.existsSync(target)) {
        broken.push({ file: path.relative(root, file), spec });
      }
    }
  }

  SPAWNED.lastIndex = 0;
  let s;
  while ((s = SPAWNED.exec(src))) {
    if (!fs.existsSync(path.join(root, s[1]))) {
      missingSpawn.push({ file: path.relative(root, file), spec: s[1] });
    }
  }
}

console.log(`  pregledano skripti: ${files.length}`);

if (broken.length) {
  console.log(`\n  NERAZRJESIVI UVOZI (${broken.length}):`);
  for (const b of broken) console.log(`    ${b.file}  ->  ${b.spec}`);
}

if (missingSpawn.length) {
  console.log(`\n  POKRECU NEPOSTOJECU SKRIPTU (${missingSpawn.length}):`);
  for (const b of missingSpawn) console.log(`    ${b.file}  ->  ${b.spec}`);
}

if (!broken.length && !missingSpawn.length) {
  console.log('  sve putanje se razrjesavaju');
}

process.exitCode = broken.length || missingSpawn.length ? 1 : 0;
