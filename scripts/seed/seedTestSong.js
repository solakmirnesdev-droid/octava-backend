/**
 * Seeds one test song so the app and dashboard have something to render.
 *
 *   node scripts/seedTestSong.js
 *
 * The lyrics are placeholder text written for this repository, not words from
 * any released recording. Real catalogue entries are a licensing question, not
 * a seeding one.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../../src/config/db.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import User from '../../src/models/User.js';

const CONTENT = `[Uvod]
[Am]  [F]  [C]  [G]

[Strofa 1]
[Am]Jutro se budi nad [F]gradom tihim,
[C]koraci moji po [G]kaldrmi zvone.
[Am]Nosim u rukama [F]pjesmu bez rijeci,
[C]cekam da [G/B]negdje se [Am]slome.

[Refren]
[F]Daj mi jos jednu [C]noc,
[G]samo jos jednu [Am]zoru.
[F]Daj mi jos jednu [C]rijec,
[G]da je ne izgubim u [Am]govoru.

[Strofa 2]
[Am]Vjetar kroz prozor [F]donosi glase,
[C]neko se smije, a [G]neko se seli.
[Am]Ja jos uvijek [F]stojim na mjestu,
[C]gdje smo se [G/B]jednom [Am]sreli.

[Refren]
[F]Daj mi jos jednu [C]noc,
[G]samo jos jednu [Am]zoru.
[F]Daj mi jos jednu [C]rijec,
[G]da je ne izgubim u [Am]govoru.

[Solo]
[Am]  [F]  [C]  [G]  [Am]  [F]  [G]  [Am]

[Kraj]
[Am]Nosim u rukama [F]pjesmu bez rijeci,
[C]cekam da [G/B]negdje se [Am]slome.`;

try {
  await connectDB();

  const worker = await User.findOne({ role: { $in: ['worker', 'admin'] } });
  if (!worker) {
    console.error('No worker or admin account found. Run scripts/createAdmin.js first.');
    process.exit(1);
  }

  const artist = await Artist.findOrCreateByName('Testni Izvodjac');

  const existing = await Song.findOne({ title: 'Jos jednu zoru' });
  if (existing) {
    console.log('Test song already exists at /pjesma/' + existing.slug);
    process.exit(0);
  }

  const song = await Song.create({
    title: 'Jos jednu zoru',
    artist: artist._id,
    tags: ['test', 'balada'],
    status: 'published',
    createdBy: worker._id,
    updatedBy: worker._id,
    arrangements: [{
      label: 'Osnovna verzija',
      content: CONTENT,
      originalKey: 'Am',
      capo: 2,
      difficulty: 'easy',
      isPrimary: true,
      createdBy: worker._id
    }]
  });

  await Artist.updateOne({ _id: artist._id }, { $inc: { songCount: 1 } });

  console.log('Created: ' + song.title);
  console.log('URL:     /pjesma/' + song.slug);
  console.log('Chords:  ' + song.primary.chords.join(' '));
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
