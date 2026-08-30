import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import fetch from 'node-fetch';

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import { toLatin } from '../src/utils/latinise.js';

const CONCURRENCY = 16; // 16 parallel search workers for turbo throughput
const BATCH_SIZE = 100;

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomHeaders() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return {
    'User-Agent': ua,
    'Accept-Language': 'sr,hr,bs,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
}

export async function searchYouTubeId(artistName, songTitle) {
  const cleanA = toLatin(artistName || '').trim();
  const cleanT = toLatin(songTitle || '').trim();

  if (!cleanA || !cleanT) return null;

  // 1. YouTube Direct Search
  const q = encodeURIComponent(`${cleanA} ${cleanT} official audio`);
  const url = `https://www.youtube.com/results?search_query=${q}`;

  try {
    const res = await fetch(url, { headers: getRandomHeaders(), timeout: 4500 });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch (err) {
    // Fall through to secondary search
  }

  // 2. DuckDuckGo Secondary Search Fallback
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${cleanA} ${cleanT} youtube`)}`;
    const ddgRes = await fetch(ddgUrl, { headers: getRandomHeaders(), timeout: 4000 });
    if (ddgRes.ok) {
      const ddgHtml = await ddgRes.text();
      const m = ddgHtml.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (m && m[1]) {
        return m[1];
      }
    }
  } catch (e) {}

  return null;
}

// Simple concurrent worker queue
async function mapConcurrent(items, limit, fn) {
  const results = [];
  const executing = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);

    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

export async function runYouTubeMatcher() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log(`🎬 [YouTubeMatcher] TURBO Multi-Threaded Matcher Online (Workers: ${CONCURRENCY})`);
  console.log('======================================================================\n');

  while (true) {
    try {
      const songs = await Song.find({
        deletedAt: null,
        $or: [{ youtubeId: { $exists: false } }, { youtubeId: null }, { youtubeId: '' }]
      }).populate('artist', 'name').limit(BATCH_SIZE);

      if (songs.length === 0) {
        console.log('[YouTubeMatcher] Sva muzika ima povezan YouTube ID! (100% Pokrivenost)');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      console.log(`\n[YouTubeMatcher] Pretražujem batch od ${songs.length} pjesama sa ${CONCURRENCY} paralelnih workera...`);
      const t0 = Date.now();
      let matchedCount = 0;

      const bulkOps = [];

      await mapConcurrent(songs, CONCURRENCY, async (song) => {
        const artistName = song.artist?.name || '';
        if (!artistName || !song.title) return;

        const ytId = await searchYouTubeId(artistName, song.title);
        if (ytId) {
          bulkOps.push({
            updateOne: {
              filter: { _id: song._id },
              update: { $set: { youtubeId: ytId } }
            }
          });
          matchedCount++;
          console.log(`  🎬 [Matched] "${song.title}" (${artistName}) -> https://youtu.be/${ytId}`);
        }
      });

      if (bulkOps.length > 0) {
        await Song.bulkWrite(bulkOps);
      }

      const diffSec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[YouTubeMatcher] Batch završen za ${diffSec}s! Povezano ${matchedCount}/${songs.length} pjesama. Nastavljam odmah...`);
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.error('[YouTubeMatcher Error]', err.message);
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

if (process.argv[1]?.endsWith('youtube_matcher_daemon.js')) {
  runYouTubeMatcher().catch(console.error);
}
