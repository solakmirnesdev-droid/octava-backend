import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import { countChordsInContent } from './song_quality_gate.js';
import { toLatin } from '../src/utils/latinise.js';
import { sanitizeSongTitle, sanitizeSongContent } from '../src/utils/song_sanitizer.js';
import { formatSongNotationAndPropagate } from './propagate_harmony_and_clean_notation.js';

async function runTurboParallelEngine() {
  const startTime = Date.now();
  console.log('======================================================================');
  console.log('⚡⚡ OCTAVA HIGH-SPEED TURBO QUALITY & HARMONIC ENGINE (V2)');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Povezan na MongoDB Atlas Cloud.\n');

  console.log('📦 Učitavam mapu izvođača u memoriju...');
  const artists = await Artist.find({ deletedAt: null }).select('_id name').lean();
  const artistMap = new Map();
  for (const a of artists) artistMap.set(a._id.toString(), a.name);

  console.log('🔍 Učitavam sve pjesme radi paralelne obrade...');
  const songs = await Song.find({ deletedAt: null }).lean();
  console.log(`🚀 Pokrećem Turbo obradu nad ${songs.length} pjesama...\n`);

  let publishedCount = 0;
  let draftCount = 0;
  let modifiedCount = 0;

  const bulkOps = [];
  const BATCH_SIZE = 500;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const artistName = artistMap.get(song.artist?.toString()) || 'Nepoznat izvođač';
    let content = song.arrangements?.[0]?.content || '';

    // 1. Raw Tab / Legend dump detector
    const isRawTabDump = /(?:palm\s+mute|hammer\s+on|Standard\s+Tuning|Standard\s+Tunning|pinch\s+harmonic|tabbed\s+by|transcribed\s+by|Suffixes\s+for\s+bend)/i.test(content);
    const isPlaceholder = !content || content.length < 30 || /tekst\s+(?:još\s+)?(?:uvijek\s+|uvek\s+)?(?:nije\s+)?ažuriran|lorem\s+ipsum|sed\s+do\s+eiusmod|tempor\s+incididunt|veniam\s+quis/i.test(content);

    if (isRawTabDump || isPlaceholder) {
      if (song.status === 'published') {
        bulkOps.push({
          updateOne: {
            filter: { _id: song._id },
            update: { $set: { status: 'draft', updatedAt: new Date() } }
          }
        });
        draftCount++;
      }
      continue;
    }

    // 2. High-precision Master Sanitation & Formatting
    let cleaned = sanitizeSongContent(content);
    cleaned = formatSongNotationAndPropagate(cleaned);
    let cleanTitle = sanitizeSongTitle(song.title);
    const chordsCount = countChordsInContent(cleaned);

    if (chordsCount === 0) {
      if (song.status === 'published') {
        bulkOps.push({
          updateOne: {
            filter: { _id: song._id },
            update: { $set: { status: 'draft', updatedAt: new Date() } }
          }
        });
        draftCount++;
      }
      continue;
    }

    // 3. Check if changes are needed
    const needsUpdate = cleaned !== content || cleanTitle !== song.title || song.status !== 'published';
    if (needsUpdate) {
      bulkOps.push({
        updateOne: {
          filter: { _id: song._id },
          update: {
            $set: {
              title: cleanTitle,
              searchTitle: toLatin(cleanTitle).toLowerCase(),
              status: 'published',
              'arrangements.0.content': cleaned,
              'arrangements.0.label': song.arrangements?.[0]?.label || 'Glavna verzija',
              updatedAt: new Date()
            }
          }
        }
      });
      modifiedCount++;
    }
    publishedCount++;

    // Flush batch to Atlas in high speed chunks
    if (bulkOps.length >= BATCH_SIZE) {
      const chunk = bulkOps.splice(0, BATCH_SIZE);
      await Song.bulkWrite(chunk, { ordered: false });
      const percent = Math.round((i / songs.length) * 100);
      console.log(`⚡ [${percent}%] Obrađeno ${i}/${songs.length} pjesama | Ažurirano u bazi: ${modifiedCount}...`);
    }
  }

  // Flush remaining ops
  if (bulkOps.length > 0) {
    await Song.bulkWrite(bulkOps, { ordered: false });
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log('\n======================================================================');
  console.log(`🎉 TURBO OBRADA ZAVRŠENA U ${durationSec} SEKUNDI!`);
  console.log(`  ✨ Objavljene i savršeno formatirane pjesme: ${publishedCount}`);
  console.log(`  🧹 Ažurirano i poboljšano: ${modifiedCount} pjesama`);
  console.log(`  🔒 Povučeno u Draft (tabulature/placeholdera): ${draftCount}`);
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

runTurboParallelEngine().catch(err => console.error('[Turbo Engine Error]', err));
