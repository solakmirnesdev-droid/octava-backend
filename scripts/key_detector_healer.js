import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import { detectOriginalKey, estimateDifficulty } from './song_quality_gate.js';

export async function runKeyHealerCycle() {
  const songs = await Song.find({ deletedAt: null });
  let updatedCount = 0;

  for (const song of songs) {
    const content = song.arrangements?.[0]?.content || '';
    if (content.length > 0) {
      const key = detectOriginalKey(content, song.arrangements[0].originalKey || '');
      const difficulty = estimateDifficulty(content);
      const currentKey = song.arrangements[0].originalKey || song.originalKey || '';
      const currentDiff = song.arrangements[0].difficulty || song.difficulty || '';

      if (key !== currentKey || difficulty !== currentDiff) {
        song.arrangements[0].originalKey = key;
        song.arrangements[0].difficulty = difficulty;
        song.originalKey = key;
        song.difficulty = difficulty;
        await song.save();
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    console.log(`[KeyHealer] Updated tonality and difficulty for ${updatedCount} songs.`);
  }
  return updatedCount;
}

async function startDaemon() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log('🎼 [KeyHealer] Harmonic Tonality & Difficulty Detection Daemon Online');
  console.log('======================================================================\n');

  while (true) {
    try {
      await runKeyHealerCycle();
    } catch (err) {
      console.error('[KeyHealer Error]', err.message);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

if (process.argv[1]?.endsWith('key_detector_healer.js')) {
  startDaemon().catch(console.error);
}
