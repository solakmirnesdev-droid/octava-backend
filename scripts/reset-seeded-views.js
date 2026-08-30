/**
 * Zeroes the invented view counts, so `views` starts meaning what it says.
 *
 *   node scripts/reset-seeded-views.js            # dry run, writes nothing
 *   node scripts/reset-seeded-views.js --apply    # writes
 *
 * AI-DECISION: subtracting the seeded share was tried on paper and does not
 * work. The seed assigned `views: rand() * 5000` and the real counter increments
 * the same integer, with no timestamp to tell the two apart — so once a seeded
 * song is genuinely read, its number is permanently part invention. Reporting
 * "total minus demo-tagged" leaves the four worst offenders behind (3909, 3761,
 * 1516 and 371 views on songs nobody has opened), which is 98% of what is left.
 *
 * The only honest number is one that starts at a known point. Zeroing gives
 * that: from the moment this runs, every view in the database was somebody
 * actually opening a page.
 *
 * AI-TRAP: this also reorders "Najgledanije" on the public site, because that
 * list sorts by this field. That is the point — it was sorted by a random
 * number, and every bar the same length is what gave it away — but it is a
 * visible change, not an internal one.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Song from '../src/models/Song.js';

/**
 * Above this, a count is invention rather than traffic.
 *
 * The site has 22 registered readers and has never been deployed, so nothing
 * can honestly have been opened hundreds of times. The real tail sits at 40 and
 * below — pages opened while testing today.
 */
const IMPLAUSIBLE = 100;

const apply = process.argv.includes('--apply');

try {
  await connectDB();

  // Two populations, one rule: anything seeded, plus anything whose count is
  // not survivable as real traffic on a site that has never been public.
  const filter = {
    deletedAt: null,
    $or: [{ tags: 'demo' }, { views: { $gte: IMPLAUSIBLE } }]
  };

  const [before] = await Song.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: null, views: { $sum: '$views' } } }
  ]);

  const affected = await Song.countDocuments(filter);
  const [removing] = await Song.aggregate([
    { $match: filter },
    { $group: { _id: null, views: { $sum: '$views' } } }
  ]);

  const total = before?.views || 0;
  const invented = removing?.views || 0;

  console.log(`ukupno pregleda      : ${total.toLocaleString('bs')}`);
  console.log(`izmisljeno           : ${invented.toLocaleString('bs')}  (${affected} pjesama)`);
  console.log(`ostaje stvarno       : ${(total - invented).toLocaleString('bs')}`);

  if (!apply) {
    console.log('\nPROBNI PROLAZ — nista nije upisano.');
    console.log('Sa --apply se ovi brojaci postavljaju na 0.');
    console.log('Napomena: ovo mijenja i redoslijed "Najgledanije" na sajtu.');
    process.exit(0);
  }

  /*
   * A view count has no history and nothing else records it, so this is the
   * only way back. Small — an id and a number per row — and worth keeping until
   * the site has real traffic to compare against.
   */
  const here = path.dirname(fileURLToPath(import.meta.url));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(here, `seeded-views-backup-${stamp}.json`);
  const rows = await Song.find(filter).select('_id title views').lean();
  fs.writeFileSync(backup, JSON.stringify(rows, null, 1));
  console.log('kopija prije izmjene:', backup);

  const res = await Song.updateMany(filter, { $set: { views: 0 } });
  console.log(`\nponisteno na ${res.modifiedCount} pjesama`);
} catch (err) {
  console.error('Nije uspjelo:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
