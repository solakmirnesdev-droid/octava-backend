import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  cleanArtistName,
  detectOriginalKey,
  estimateDifficulty,
  isDummyContent
} from './song_quality_gate.js';

let isProcessing = false;

async function healSongDocument(songId) {
  try {
    const song = await Song.findById(songId).populate('artist', 'name');
    if (!song || song.deletedAt) return;

    let modified = false;

    // 1. Clean Title
    const artistName = song.artist?.name || '';
    const cleanTitle = cleanOfficialTitle(song.title, artistName);
    if (cleanTitle && cleanTitle !== song.title) {
      song.title = cleanTitle;
      modified = true;
    }

    // 2. Clean Content
    const content = song.arrangements?.[0]?.content || '';
    if (content.length > 0 && !isDummyContent(content)) {
      const healed = applyQualityGate(content, song.arrangements[0].originalKey || '');
      if (healed !== content) {
        song.arrangements[0].content = healed;
        modified = true;
      }

      // 3. Tonality & Difficulty
      const key = detectOriginalKey(healed, song.arrangements[0].originalKey || '');
      const diff = estimateDifficulty(healed);
      if (song.arrangements[0].originalKey !== key || song.arrangements[0].difficulty !== diff) {
        song.arrangements[0].originalKey = key;
        song.arrangements[0].difficulty = diff;
        song.originalKey = key;
        song.difficulty = diff;
        modified = true;
      }
    }

    if (modified) {
      await song.save();
      console.log(`⚡ [RealTimeWatcher:Healed] "${song.title}" (${artistName}) healed in real-time!`);
    }
  } catch (err) {
    console.error(`[RealTimeWatcher Error for ${songId}]:`, err.message);
  }
}

async function startChangeStreamWatcher() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log('⚡ [RealTimeWatcher] MongoDB Real-Time Quality Gate Watcher Online');
  console.log('======================================================================\n');

  try {
    const changeStream = Song.watch([], { fullDocument: 'updateLookup' });
    console.log('✓ MongoDB ChangeStream connected successfully (Zero-Latency Mode).');

    changeStream.on('change', async (change) => {
      if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
        const docId = change.documentKey._id;
        await healSongDocument(docId);
      }
    });

    changeStream.on('error', (err) => {
      console.warn('[RealTimeWatcher] ChangeStream encountered error, switching to reactive micro-interval mode:', err.message);
      startReactivePolling();
    });
  } catch (err) {
    console.warn('[RealTimeWatcher] Standalone MongoDB detected. Running in Reactive Micro-Watcher Mode (50ms).');
    startReactivePolling();
  }
}

let lastCheckTime = new Date(Date.now() - 60000);
async function startReactivePolling() {
  while (true) {
    try {
      const recentSongs = await Song.find({
        updatedAt: { $gte: lastCheckTime },
        deletedAt: null
      }).select('_id updatedAt');

      lastCheckTime = new Date();

      for (const s of recentSongs) {
        await healSongDocument(s._id);
      }
    } catch (err) {
      // Graceful loop continue
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

if (process.argv[1]?.endsWith('realtime_gate_watcher.js')) {
  startChangeStreamWatcher().catch(console.error);
}
