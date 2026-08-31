import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import { applyQualityGate, cleanOfficialTitle, normalizeTitleForDeduplication } from '../healers/song_quality_gate.js';

async function auditAndFix() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB. Starting database-wide Quality Gate scan...');

  const songs = await Song.find({ deletedAt: null }).populate('artist', 'name');
  console.log(`Found ${songs.length} active songs to audit.`);

  let fixedFormatting = 0;
  let unrolledRefrains = 0;
  let replicatedStanzas = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    if (!song.arrangements || song.arrangements.length === 0) continue;

    const arr = song.arrangements[0];
    const oldContent = arr.content || '';
    if (!oldContent || oldContent.length < 20) continue;

    const cleanTitle = cleanOfficialTitle(song.title, song.artist?.name);
    const newContent = applyQualityGate(oldContent, arr.originalKey || '');

    let changed = false;

    if (newContent !== oldContent) {
      if (newContent.length > oldContent.length && oldContent.includes('Ref')) {
        unrolledRefrains++;
      }
      if (oldContent.includes('Strofa 2') && !oldContent.includes('[Strofa 2]')) {
        replicatedStanzas++;
      }
      arr.content = newContent;
      changed = true;
      fixedFormatting++;
    }

    if (song.title !== cleanTitle && cleanTitle.length > 0) {
      song.title = cleanTitle;
      changed = true;
    }

    if (changed) {
      await Song.updateOne(
        { _id: song._id },
        {
          $set: {
            title: song.title,
            'arrangements.0.content': arr.content
          }
        }
      );
    }
  }

  console.log('\n======================================================');
  console.log('Database Quality Gate Audit Complete!');
  console.log(`- Songs audited: ${songs.length}`);
  console.log(`- Formatting fixed / Bracketed: ${fixedFormatting}`);
  console.log(`- Stanzas harmonized: ${replicatedStanzas}`);
  console.log(`- Refrains unrolled: ${unrolledRefrains}`);
  console.log('======================================================\n');

  await mongoose.disconnect();
}

auditAndFix().catch(console.error);
