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
import AuditLog from '../src/models/AuditLog.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  cleanArtistName,
  isForeignSong,
  validateSongCompleteness,
  classifyGenresForArtist,
  detectOriginalKey,
  estimateDifficulty
} from './song_quality_gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = '/Users/solakmirnes/.gemini/config/skills/song-chords/added-songs.json';
const catalogPath = '/Users/solakmirnes/.gemini/config/skills/song-chords/CATALOG.md';

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

function updatePersistentMemory(newSongs) {
  try {
    let existing = [];
    if (fs.existsSync(jsonPath)) {
      existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }
    const merged = [...existing, ...newSongs];
    fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2), 'utf8');

    let mdContent = `# Octava Song Catalog\n\nTotal Songs: ${merged.length}\nLast Updated: ${new Date().toISOString()}\n\n| Artist | Song | Key | Status |\n| :--- | :--- | :--- | :--- |\n`;
    for (const s of merged.slice(-300)) {
      mdContent += `| ${s.artist} | ${s.title} | ${s.originalKey} | ${s.status} |\n`;
    }
    fs.writeFileSync(catalogPath, mdContent, 'utf8');
    console.log(`[Memory] Updated persistent catalog! Total songs: ${merged.length}`);
  } catch (err) {
    console.error('[Memory Error]', err.message);
  }
}

async function scrape2AkordiPage(pageNum, staffId, genreIds) {
  const pageUrl = `https://www.2akordi.net/?a=uploads&t=l&r=${pageNum}`;
  console.log(`\n======================================================`);
  console.log(`[2Akordi Crawler] Fetching page ${pageNum}: ${pageUrl}`);
  console.log(`======================================================`);

  let html = '';
  try {
    const res = await fetch(pageUrl, { headers: HEADERS, timeout: 8000 });
    if (!res.ok) {
      console.log(`[2Akordi] Page ${pageNum} returned HTTP ${res.status}`);
      return [];
    }
    html = await res.text();
  } catch (e) {
    console.error(`[2Akordi] Error fetching page ${pageNum}:`, e.message);
    return [];
  }

  const songLinks = [...new Set([...html.matchAll(/href=[\"'](\?a=uploads&t=v&id=\d+)[\"']/gi)].map(m => m[1]))];
  console.log(`[2Akordi] Found ${songLinks.length} songs on page ${pageNum}`);

  const processedSongs = [];

  for (let i = 0; i < songLinks.length; i++) {
    const relUrl = songLinks[i];
    const fullUrl = `https://www.2akordi.net/${relUrl}`;

    try {
      await delay(350);
      const sRes = await fetch(fullUrl, { headers: HEADERS, timeout: 8000 });
      if (!sRes.ok) continue;
      const sHtml = await sRes.text();

      const preMatch = sHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      if (!preMatch || !preMatch[1].trim()) continue;

      const titleMatch = sHtml.match(/<title>([^<]+)<\/title>/i);
      if (!titleMatch) continue;

      const rawTitle = decodeHtmlEntities(titleMatch[1]).replace(/\s*-\s*akordi.*$/i, '').trim();
      const parts = rawTitle.split(/\s*-\s*/);
      if (parts.length < 2) continue;

      const artistName = parts[0].trim();
      const songTitle = parts.slice(1).join(' - ').trim();

      const cleanSongTitle = cleanOfficialTitle(songTitle, artistName);
      const cleanArtist = cleanArtistName(artistName);

      if (!cleanSongTitle || !cleanArtist) continue;

      let rawPre = decodeHtmlEntities(preMatch[1]);
      let content = applyQualityGate(rawPre);
      if (!content || content.length < 50) continue;

      const chords = [...content.matchAll(/\[([A-H][b#]?[^\]]*)\]/g)].map(m => m[1]);
      if (chords.length === 0) continue;

      const originalKey = detectOriginalKey(content);
      const difficulty = estimateDifficulty(content);

      const artistDoc = await Artist.findOrCreateByName(cleanArtist);

      const existingSongs = await Song.find({ artist: artistDoc._id }).setOptions({ withDeleted: true });
      const normSearch = normalizeTitle(cleanSongTitle);
      let song = existingSongs.find(s => normalizeTitle(s.title) === normSearch);

      const isForeign = isForeignSong(cleanSongTitle, cleanArtist, content);
      const isComplete = validateSongCompleteness(cleanSongTitle, content);
      const songStatus = (isForeign || !isComplete) ? 'draft' : 'published';
      const autoGenres = classifyGenresForArtist(cleanArtist, cleanSongTitle);
      const finalGenres = (genreIds && genreIds.length > 0) ? [...new Set([...genreIds, ...autoGenres])] : autoGenres;

      if (song) {
        song.title = cleanSongTitle;
        song.artist = artistDoc._id;
        song.genres = finalGenres;
        song.status = songStatus;
        song.deletedAt = null;
        song.deletedBy = undefined;
        song.updatedBy = staffId;

        if (song.arrangements && song.arrangements.length > 0) {
          song.arrangements[0].content = content;
          song.arrangements[0].originalKey = originalKey;
          song.arrangements[0].difficulty = difficulty;
          song.arrangements[0].isPrimary = true;
        } else {
          song.arrangements = [{
            label: 'Osnovna verzija',
            content,
            originalKey,
            difficulty,
            isPrimary: true,
            createdBy: staffId
          }];
        }
        await song.save();
        console.log(`[DB:Updated] #${i + 1} "${cleanSongTitle}" by ${cleanArtist} (${originalKey}) -> Status: ${songStatus} | ID: ${song._id}`);
      } else {
        song = await Song.create({
          title: cleanSongTitle,
          artist: artistDoc._id,
          genres: finalGenres,
          tags: ['2akordi.net', 'harmonizovano', 'studio-standard'],
          status: songStatus,
          createdBy: staffId,
          arrangements: [{
            label: 'Osnovna verzija',
            content,
            originalKey,
            difficulty,
            isPrimary: true,
            createdBy: staffId
          }]
        });

        await AuditLog.create({
          action: 'create',
          entity: 'song',
          entityId: song._id,
          actor: staffId,
          meta: { title: cleanSongTitle, artist: cleanArtist, source: '2akordi.net' }
        });

        console.log(`[DB:Created] #${i + 1} "${cleanSongTitle}" by ${cleanArtist} (${originalKey}) -> Status: ${songStatus} | ID: ${song._id}`);
      }

      processedSongs.push({
        id: song._id.toString(),
        title: cleanSongTitle,
        artist: cleanArtist,
        originalKey,
        status: songStatus,
        source: '2akordi.net',
        addedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(`[Error] Failed song ${fullUrl}:`, err.message);
    }
  }

  if (processedSongs.length > 0) {
    updatePersistentMemory(processedSongs);
  }

  return processedSongs;
}

async function main() {
  const maxPages = parseInt(process.argv[2] || '50', 10);
  const startPage = parseInt(process.argv[3] || '1', 10);

  console.log(`[2Akordi] Starting 2Akordi.net Crawler & Publisher...`);
  console.log(`[2Akordi] Range: Page ${startPage} to Page ${startPage + maxPages - 1}`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`[2Akordi] Connected to MongoDB database.`);

  const staff = await mongoose.connection.db.collection('staff').findOne({ role: 'superadmin' });
  const staffId = staff ? staff._id : new mongoose.Types.ObjectId('6a8ce24999402a978a600f08');

  const genres = await Genre.find({ slug: { $in: ['pop', 'rock', 'folk', 'domaca', 'zabavna', 'starogradska'] } });
  const genreIds = genres.map(g => g._id);

  let totalImported = 0;

  for (let page = startPage; page < startPage + maxPages; page++) {
    const results = await scrape2AkordiPage(page, staffId, genreIds);
    totalImported += results.length;
    console.log(`[Progress] 2Akordi Page ${page} complete. Imported in this page: ${results.length}. Total: ${totalImported}`);
    await delay(500);
  }

  console.log(`\n======================================================`);
  console.log(`[2Akordi] COMPLETE! Successfully imported and published ${totalImported} songs.`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
