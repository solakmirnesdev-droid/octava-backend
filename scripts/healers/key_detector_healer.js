/**
 * Keeps each song's key and difficulty in step with its chords.
 *
 *   node scripts/healers/key_detector_healer.js          # one pass, dry
 *   node scripts/healers/key_detector_healer.js --write  # one pass, saved
 *   node scripts/healers/key_detector_healer.js --daemon # keep watching
 *
 * AI-DECISION: rewritten onto lib/sweep.js after measuring the original. It
 * loaded every song as a full Mongoose document — 863ms and 72.6MB for 14,389
 * songs — saved each change one at a time, and did that every ten seconds
 * forever: 360 complete sweeps of the catalogue an hour, from this daemon
 * alone, while twelve others did the same. The work it does is unchanged; only
 * the shape around it is.
 *
 * AI-NOTE: dry by default now. It used to start writing the moment it was run,
 * which is the wrong default for anything that edits fourteen thousand rows.
 */
import 'dotenv/config';
import Song from '../../src/models/Song.js';
import '../../src/models/Artist.js';
import { detectOriginalKey, estimateDifficulty } from './song_quality_gate.js';
import { connect, sweep, loop } from '../lib/sweep.js';

const WRITE = process.argv.includes('--write');
const DAEMON = process.argv.includes('--daemon');

/** The $set for one song, or null when it is already correct. */
function change(song) {
  const arrangement = song.arrangements?.[0];
  const content = arrangement?.content || '';
  if (!content) return null;

  const key = detectOriginalKey(content, arrangement.originalKey || '');
  const difficulty = estimateDifficulty(content);

  if (key === (arrangement.originalKey || '') && difficulty === (arrangement.difficulty || '')) {
    return null;
  }

  /*
   * AI-TRAP: written by path, not by replacing the arrangements array. The
   * original assigned the whole document and saved it, which rewrites every
   * arrangement — including a second version somebody was editing at that
   * moment. A positional $set touches the two fields it means to.
   */
  return {
    'arrangements.0.originalKey': key,
    'arrangements.0.difficulty': difficulty,
    originalKey: key,
    difficulty
  };
}

export async function runKeyHealerCycle(since = null) {
  return sweep({
    model: Song,
    filter: { deletedAt: null },
    /*
     * AI-TRAP: project 'arrangements.content', never 'arrangements.0.content'.
     * MongoDB has no positional projection — it reads the '0' as a literal field
     * name, finds none, and hands back [{}]. No error, no warning: the healer
     * simply sees empty content and decides every song is already correct. This
     * shipped for one turn and did nothing at all, quickly.
     */
    select: 'arrangements.content arrangements.originalKey arrangements.difficulty',
    since,
    dry: !WRITE,
    change
  });
}

await connect();

if (DAEMON) {
  await loop({ label: 'KeyHealer', every: 10000, pass: runKeyHealerCycle });
} else {
  const r = await runKeyHealerCycle();
  console.log(`  pregledano ${r.seen}, za izmjenu ${r.changed}, ${r.ms}ms`);
  if (!WRITE) console.log('  (probni prolaz — nista nije upisano; dodaj --write)');
  process.exit(0);
}
