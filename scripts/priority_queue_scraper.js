import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  isDummyContent,
  countChordsInContent,
  detectOriginalKey,
  estimateDifficulty
} from './song_quality_gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const queueFile = path.join(__dirname, '../data/scraper_priority_queue.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'sr,hr,bs,en;q=0.9'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function searchPesmarica(title, artist) {
  try {
    const query = encodeURIComponent(`${artist} ${title}`);
    const searchUrl = `https://www.pesmarica.rs/pretraga?q=${query}`;
    const res = await fetch(searchUrl, { headers: HEADERS });
    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/href="(\/akordi\/\d+\/[^"]+)"/i);
    if (match) {
      const songUrl = `https://www.pesmarica.rs${match[1]}`;
      const songRes = await fetch(songUrl, { headers: HEADERS });
      if (!songRes.ok) return null;

      const songHtml = await songRes.text();
      const contentMatch = songHtml.match(/<pre[^>]*id="pesma"[^>]*>([\s\S]*?)<\/pre>/i) ||
                           songHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      
      if (contentMatch) {
        const rawContent = decodeHtml(contentMatch[1]);
        const keyMatch = songHtml.match(/(?:Tonalitet|Key|Iz tonaliteta)[:\s]*<strong>([A-H][b#]?m?)<\/strong>/i) ||
                         songHtml.match(/(?:Tonalitet|Key|Iz tonaliteta)[:\s]*([A-H][b#]?m?)/i);
        const key = keyMatch ? keyMatch[1].trim() : '';

        return { rawContent, key };
      }
    }
  } catch (err) {
    // Ignore network error
  }
  return null;
}

async function processPriorityQueue() {
  if (!fs.existsSync(queueFile)) {
    console.log(`[PriorityScraper] Queue file not found yet. Waiting for Healer...`);
    return;
  }

  const rawData = fs.readFileSync(queueFile, 'utf8');
  let queue = [];
  try {
    queue = JSON.parse(rawData);
  } catch (e) {
    return;
  }

  if (queue.length === 0) {
    console.log(`[PriorityScraper] Queue is empty! No dummy songs need healing.`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`[PriorityScraper] Processing ${queue.length} target songs from Priority Queue...`);
  console.log(`======================================================`);

  let overwritten = 0;

  for (let i = 0; i < Math.min(queue.length, 30); i++) {
    const item = queue[i];
    console.log(`[Target #${i + 1}] Searching studio chords for: "${item.title}" by ${item.artist}...`);

    const result = await searchPesmarica(item.title, item.artist);
    if (result && countChordsInContent(result.rawContent) > 0 && !isDummyContent(result.rawContent)) {
      const cleaned = applyQualityGate(result.rawContent, result.key);
      const key = detectOriginalKey(cleaned, result.key);
      const difficulty = estimateDifficulty(cleaned);

      await Song.updateOne(
        { _id: item.id },
        {
          $set: {
            'arrangements.0.content': cleaned,
            'arrangements.0.originalKey': key,
            'arrangements.0.difficulty': difficulty,
            status: 'published'
          }
        }
      );

      console.log(`  🎯 [SUCCESS:Overwritten] Successfully harmonized "${item.title}" with studio chords! (${cleaned.length} chars)`);
      overwritten++;
    } else {
      console.log(`  ⚪ [No Match] Online studio tab not available yet for "${item.title}".`);
    }

    await delay(1200);
  }

  console.log(`[PriorityScraper] Cycle complete. Overwritten ${overwritten} dummy songs in this batch.\n`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`[PriorityScraper] Connected to MongoDB. Running Priority Queue Scraper Daemon...`);

  while (true) {
    try {
      await processPriorityQueue();
    } catch (err) {
      console.error(`[PriorityScraper] Error:`, err.message);
    }
    // Sleep 15 seconds before checking queue again
    await delay(15000);
  }
}

main().catch(console.error);
