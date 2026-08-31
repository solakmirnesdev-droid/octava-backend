import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import { countChordsInContent } from '../healers/song_quality_gate.js';
import { toLatin } from '../../src/utils/latinise.js';
import { sanitizeSongTitle, sanitizeSongContent } from '../../src/utils/song_sanitizer.js';
import { formatSongNotationAndPropagate } from '../healers/propagate_harmony_and_clean_notation.js';

async function runContinuousWorker() {
  console.log('======================================================================');
  console.log('⚡ OCTAVA CONTINUOUS UNBREAKABLE WORKER PIPELINE');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Povezan na MongoDB Atlas Cloud.\n');

  const artists = await Artist.find({ deletedAt: null }).select('_id name').lean();
  const artistMap = new Map();
  for (const a of artists) artistMap.set(a._id.toString(), a.name);

  const songs = await Song.find({ deletedAt: null }).lean();
  console.log(`Učitano ${songs.length} pjesama za obradu i kontinuirano čišćenje...`);

  let processed = 0;
  let published = 0;
  let drafts = 0;

  for (const song of songs) {
    processed++;
    const artistName = artistMap.get(song.artist?.toString()) || 'Nepoznat izvođač';
    let content = song.arrangements?.[0]?.content || '';

    if (!content || content.length < 30) {
      if (song.status === 'published') {
        await Song.updateOne({ _id: song._id }, { $set: { status: 'draft' } });
        drafts++;
      }
      continue;
    }

    const isPlaceholder = /tekst\s+(?:još\s+)?(?:uvijek\s+|uvek\s+)?(?:nije\s+)?ažuriran|lorem\s+ipsum|sed\s+do\s+eiusmod|tempor\s+incididunt|veniam\s+quis/i.test(content);
    
    // 1. Sanitize content and notation
    let cleaned = sanitizeSongContent(content);
    cleaned = formatSongNotationAndPropagate(cleaned);
    
    // 2. Clean title
    let cleanTitle = sanitizeSongTitle(song.title);
    
    const chordsCount = countChordsInContent(cleaned);

    if (isPlaceholder || chordsCount === 0) {
      if (song.status === 'published') {
        await Song.updateOne({ _id: song._id }, { $set: { status: 'draft' } });
        drafts++;
      }
      continue;
    }

    try {
      await Song.updateOne(
        { _id: song._id },
        {
          $set: {
            title: cleanTitle,
            searchTitle: toLatin(cleanTitle).toLowerCase(),
            status: 'published',
            'arrangements.0.content': cleaned,
            'arrangements.0.label': song.arrangements?.[0]?.label || 'Glavna verzija',
            updatedAt: new Date()
          }
        }
      );
      published++;

      if (published % 50 === 0) {
        console.log(`✨ [${published}] PUBLISHED & NOTATED: "${artistName} - ${cleanTitle}" (${chordsCount} akorda)`);
      }
    } catch (err) {
      // Safe skip duplicate slug errors
      continue;
    }
  }

  console.log('\n======================================================================');
  console.log(`🎉 ZAVRŠEN PIPELINE! Obrađeno: ${processed} | Objavljeno čisto: ${published} | Draft: ${drafts}`);
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

runContinuousWorker().catch(err => console.error('[Fatal Worker Error]', err));
