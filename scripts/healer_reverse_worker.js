import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  restoreExYuDiacritics,
  correctGrammarAndSpelling,
  isDummyContent,
  detectOriginalKey,
  estimateDifficulty,
  healOverlappingAndBrokenChords,
  classifyGenresForArtist
} from './song_quality_gate.js';

const SLEEP_BETWEEN_CYCLES = 5000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runReverseSweep() {
  console.log(`\n======================================================`);
  console.log(`🔄 [Reverse-Healer] Starting reverse sweep (Bottom -> Top)...`);
  console.log(`======================================================`);

  const songs = await Song.find({ deletedAt: null }).sort({ _id: -1 }).populate('artist').lean();
  let healedCount = 0;
  let keysFixed = 0;
  let grammarFixed = 0;
  const bulkUpdates = [];

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const artistName = song.artist?.name || '';
    const arr = song.arrangements?.[0];
    const oldContent = arr?.content || '';

    if (!oldContent || isDummyContent(oldContent)) continue;

    // 1. Title Normalization & Diacritics
    const cleanTitle = restoreExYuDiacritics(cleanOfficialTitle(song.title, artistName));
    const titleChanged = cleanTitle && cleanTitle !== song.title;

    // 2. High-Precision Quality Gate + Anti-Overlap
    let healedContent = applyQualityGate(oldContent, arr?.originalKey || '');
    healedContent = healOverlappingAndBrokenChords(healedContent);
    healedContent = correctGrammarAndSpelling(healedContent);

    const contentChanged = healedContent !== oldContent;
    if (contentChanged) healedCount++;

    // 3. Key Detection
    let key = arr?.originalKey || '';
    const detectedKey = detectOriginalKey(healedContent, key);
    let keyChanged = false;
    if (detectedKey && key !== detectedKey) {
      key = detectedKey;
      keyChanged = true;
      keysFixed++;
    }

    // 4. Difficulty
    const diff = estimateDifficulty(healedContent);
    const diffChanged = arr?.difficulty !== diff;

    if (titleChanged || contentChanged || keyChanged || diffChanged) {
      bulkUpdates.push({
        updateOne: {
          filter: { _id: song._id },
          update: {
            $set: {
              title: cleanTitle || song.title,
              'arrangements.0.content': healedContent,
              'arrangements.0.originalKey': key,
              'arrangements.0.difficulty': diff
            }
          }
        }
      });
    }

    if ((i + 1) % 250 === 0 || i === songs.length - 1) {
      console.log(`🔄 [Reverse-Healer] Scanned ${i + 1}/${songs.length} | Queued updates: ${bulkUpdates.length}`);
    }
  }

  if (bulkUpdates.length > 0) {
    console.log(`💾 [Reverse-Healer] Flushing ${bulkUpdates.length} verified updates to MongoDB...`);
    const CHUNK = 200;
    for (let i = 0; i < bulkUpdates.length; i += CHUNK) {
      await Song.bulkWrite(bulkUpdates.slice(i, i + CHUNK), { ordered: false });
    }
    console.log(`✅ [Reverse-Healer] Reverse sweep write complete!`);
  } else {
    console.log(`✨ [Reverse-Healer] 100% of songs verified clean on reverse sweep.`);
  }
}

async function startDaemon() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/octava');
  console.log(`🚀 [Reverse-Healer] Daemon online on MongoDB: ${mongoose.connection.name}`);

  while (true) {
    try {
      await runReverseSweep();
    } catch (err) {
      console.error(`❌ [Reverse-Healer Error]:`, err.message);
    }
    await delay(SLEEP_BETWEEN_CYCLES);
  }
}

startDaemon();
