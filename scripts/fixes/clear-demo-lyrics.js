/**
 * Replaces seeded placeholder sheets with an honest line.
 *
 *   node scripts/clear-demo-lyrics.js            # dry run, writes nothing
 *   node scripts/clear-demo-lyrics.js --apply    # writes
 *
 * AI-DECISION: 594 published songs shipped with Latin filler for words AND a
 * fabricated chord progression. The chords were the worse half: across all 594
 * there are only ten distinct sequences, the same I–V–vi–IV shape transposed
 * into six keys, so 71 unrelated songs carried an identical chart. A made-up
 * progression looks exactly like one somebody checked, which is why AI-NOTES
 * says imported titles ship with an empty arrangement instead.
 *
 * So the whole sheet goes, not only the words. What is left says plainly that
 * the song has not been written up yet, and the song is tagged `bez-akorda`
 * like every other title still waiting for a transcription.
 *
 * AI-TRAP: songs carry no history, so this cannot be undone from the database.
 * The dry run is the default for that reason, and --apply writes a JSON copy of
 * everything it is about to overwrite next to this script first.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../../src/config/db.js';
import Song from '../../src/models/Song.js';

const PLACEHOLDER = 'Tekst još uvijek nije ažuriran.';
const apply = process.argv.includes('--apply');

const here = path.dirname(fileURLToPath(import.meta.url));

try {
  await connectDB();

  // Matched on the filler itself rather than on the `demo` tag: the tag is on
  // 1404 songs, most of which have no text at all and nothing to replace.
  const songs = await Song.find({
    deletedAt: null,
    'arrangements.content': { $regex: 'orem ipsum' }
  });

  console.log(`${songs.length} pjesama s lorem ipsum tekstom`);
  if (!songs.length) process.exit(0);

  if (!apply) {
    const s = songs[0];
    console.log('\nPROBNI PROLAZ — nista nije upisano. Primjer izmjene:\n');
    console.log(`  ${s.title}`);
    console.log('  prije :', JSON.stringify(s.arrangements[0].content.slice(0, 70)));
    console.log('  poslije:', JSON.stringify(PLACEHOLDER));
    console.log('  akordi :', JSON.stringify(s.arrangements[0].chords), '=> []');
    console.log('\nPokreni s --apply da se stvarno upise.');
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(here, `demo-lyrics-backup-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(
    songs.map((s) => ({
      _id: s._id,
      title: s.title,
      arrangements: s.arrangements.map((a) => ({ _id: a._id, content: a.content, chords: a.chords }))
    })), null, 1));
  console.log('kopija prije izmjene:', backup);

  let changed = 0;
  for (const song of songs) {
    for (const arrangement of song.arrangements) {
      if (!/orem ipsum/.test(arrangement.content || '')) continue;
      arrangement.content = PLACEHOLDER;
      arrangement.chords = [];
    }
    // The same mark every other untranscribed title carries, so the dashboard
    // filter finds these alongside them rather than in a category of their own.
    if (!song.tags.includes('bez-akorda')) song.tags.push('bez-akorda');
    await song.save();
    changed += 1;
  }

  console.log(`izmijenjeno: ${changed}`);
} catch (err) {
  console.error('Nije uspjelo:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
