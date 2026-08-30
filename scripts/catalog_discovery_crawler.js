import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import Genre from '../src/models/Genre.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  cleanArtistName,
  isForeignSong,
  validateSongCompleteness,
  classifyGenresForArtist,
  detectOriginalKey,
  estimateDifficulty,
  restoreExYuDiacritics
} from './song_quality_gate.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'sr,hr,bs,en;q=0.9'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#64;/g, '@')
    .replace(/&nbsp;/g, ' ');
}

function normalizeTitle(t) {
  if (!t) return '';
  return t
    .replace(/\s*\((?:ispravno|original|cover|akordi|tabovi|live|ms|akordi i tekst|sa prelazima|[a-h][b#]?m?)[^\)]*\)/gi, '')
    .replace(/[\(\)\[\]\{\}\-\_\,\.\:\"]/g, ' ')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/đ/g, 'dj')
    .replace(/ž/g, 'z')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Autonomous Discovery Crawler:
 * Searches across multi-source archives (2Akordi, Pesmarica) for missing artists and missing songs.
 */
async function runDiscoveryCrawler() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log('🔍 [DiscoveryCrawler] Autonomous Catalog & Artist Discovery Daemon Online');
  console.log('======================================================================\n');

  let loopCount = 1;

  while (true) {
    console.log(`\n--- 🌟 Starting Discovery Wave #${loopCount} ---`);

    // 1. Crawl 2Akordi Pages 1 to 120
    for (let r = 1; r <= 120; r++) {
      try {
        const pageUrl = `https://www.2akordi.net/?a=uploads&t=l&r=${r}`;
        const res = await fetch(pageUrl, { headers: HEADERS, timeout: 8000 });
        if (!res.ok) continue;
        const html = await res.text();

        const songLinks = [...new Set([...html.matchAll(/href=[\"'](\?a=uploads&t=v&id=\d+)[\"']/gi)].map(m => m[1]))];

        const CONCURRENCY = 5;
        for (let i = 0; i < songLinks.length; i += CONCURRENCY) {
          const chunk = songLinks.slice(i, i + CONCURRENCY);
          await Promise.all(chunk.map(async (relUrl) => {
            try {
              const fullUrl = `https://www.2akordi.net/${relUrl}`;
              const sRes = await fetch(fullUrl, { headers: HEADERS, timeout: 8000 });
              if (!sRes.ok) return;
              const sHtml = await sRes.text();

              const preMatch = sHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
              if (!preMatch || !preMatch[1].trim()) return;

              const titleMatch = sHtml.match(/<title>([^<]+)<\/title>/i);
              if (!titleMatch) return;

              const rawTitle = decodeHtmlEntities(titleMatch[1]).replace(/\s*-\s*akordi.*$/i, '').trim();
              const parts = rawTitle.split(/\s*-\s*/);
              if (parts.length < 2) return;

              const cleanArtist = cleanArtistName(parts[0].trim());
              const cleanSongTitle = restoreExYuDiacritics(cleanOfficialTitle(parts.slice(1).join(' - ').trim(), cleanArtist));

              if (!cleanSongTitle || !cleanArtist) return;

              const artistDoc = await Artist.findOrCreateByName(cleanArtist);
              if (!artistDoc) return;

              const existing = await Song.findOne({
                artist: artistDoc._id,
                deletedAt: null,
                title: new RegExp(`^${cleanSongTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
              });

              if (!existing) {
                // Full Pre-Publish Quality Gate
                let content = applyQualityGate(decodeHtmlEntities(preMatch[1]));
                if (!content || content.length < 50) return;

                const chords = [...content.matchAll(/\[([A-H][b#]?[^\]]*)\]/g)].map(m => m[1]);
                if (chords.length === 0) return;

                const originalKey = detectOriginalKey(content);
                const difficulty = estimateDifficulty(content);
                const isForeign = isForeignSong(cleanSongTitle, cleanArtist, content);
                const isComplete = validateSongCompleteness(cleanSongTitle, content);
                const autoGenres = classifyGenresForArtist(cleanArtist, cleanSongTitle);

                await Song.create({
                  title: cleanSongTitle,
                  artist: artistDoc._id,
                  genres: autoGenres,
                  status: (isForeign || !isComplete) ? 'draft' : 'published',
                  arrangements: [{
                    label: 'Osnovna verzija',
                    content,
                    originalKey,
                    difficulty,
                    isPrimary: true,
                    chords: [...new Set(chords)]
                  }]
                });

                console.log(`  ✨ [DISCOVERY QUALITY GATE PASSED] "${cleanSongTitle}" by "${cleanArtist}" -> Key: [${originalKey}], Difficulty: [${difficulty}], Chords: ${[...new Set(chords)].length}`);
              }
            } catch (err) {}
          }));
          await delay(50);
        }
      } catch (err) {
        console.error(`[DiscoveryCrawler] Error on page ${r}:`, err.message);
        await delay(3000);
      }
    }

    loopCount++;
    console.log(`\n[DiscoveryCrawler] Wave #${loopCount - 1} finished. Sleeping 60s before next wave...`);
    await delay(60000);
  }
}

if (process.argv[1]?.endsWith('catalog_discovery_crawler.js')) {
  runDiscoveryCrawler().catch(console.error);
}
