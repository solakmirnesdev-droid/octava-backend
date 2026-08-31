/**
 * Per-song quality scores, and the worklist behind them.
 *
 *   node scripts/maintenance/quality.js --list sekcija-bez-akorda --limit 40
 *
 * AI-NOTE: the rules themselves live in scripts/lib/kvalitet.js, and the
 * everyday entry point is `npm run katalog`. This script exists for one job the
 * summary cannot do: printing WHICH songs carry a given flag, so you can open
 * them. Reach for katalog.js first.
 */
import 'dotenv/config';
import Song from '../../src/models/Song.js';
import '../../src/models/Artist.js';
import { connect, sweep } from '../lib/sweep.js';
import { RULES, judge } from '../lib/kvalitet.js';

const WRITE = process.argv.includes('--write');
const LIST = argOf('--list');
const LIMIT = Number(argOf('--limit') || 25);

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

if (LIST && !RULES.some((r) => r.id === LIST)) {
  console.error(`\n  nepoznat nalaz: ${LIST}`);
  console.error(`  dostupno: ${RULES.map((r) => r.id).join(', ')}\n`);
  process.exit(1);
}

await connect();

const tally = new Map();
const examples = [];
let scored = 0;
let clean = 0;

const result = await sweep({
  model: Song,
  filter: { deletedAt: null },
  select: 'title artist arrangements.content quality',
  dry: !WRITE,
  change(song) {
    const content = song.arrangements?.[0]?.content || '';
    if (!content) return null;
    const { score, flags } = judge(content);
    scored++;
    if (!flags.length) clean++;
    for (const f of flags) tally.set(f, (tally.get(f) || 0) + 1);
    if (LIST && flags.includes(LIST) && examples.length < LIMIT) examples.push(song);
    if (song.quality?.score === score) return null;
    return { quality: { score, flags, checkedAt: new Date() } };
  }
});

console.log(`\n  ocijenjeno ${scored}, bez zamjerke ${clean} (${((clean / scored) * 100).toFixed(1)}%), ${result.ms}ms\n`);

for (const rule of RULES) {
  const n = tally.get(rule.id) || 0;
  if (n) {
    console.log(
      `  ${rule.id.padEnd(22)} ${String(n).padStart(6)}  ${((n / scored) * 100).toFixed(1).padStart(5)}%  ${rule.fix}`
    );
  }
}

if (LIST) {
  console.log(`\n  === ${LIST} — prvih ${examples.length} ===`);
  for (const s of examples) console.log(`     ${String(s._id)}  ${s.title}`);
}

if (!WRITE) console.log('\n  (probni prolaz — ocjene nisu upisane; dodaj --write)');
process.exit(0);
