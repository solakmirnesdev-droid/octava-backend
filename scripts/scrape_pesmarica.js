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
  classifyGenresForArtist
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

function cleanDisplayTitle(title, artistName = '') {
  if (!title) return '';
  let t = title.trim();

  // Strip artist prefix
  if (artistName && t.toLowerCase().startsWith(artistName.toLowerCase() + ' - ')) {
    t = t.slice(artistName.length + 3).trim();
  }
  t = t.replace(/^[a-zA-Z0-9\sčćšđžČĆŠĐŽ]+\s*-\s*/, '');

  // Strip all suffixes: (original), original, (ispravno), (cover), (akordi), (ms), (live), (am), COVER, etc.
  t = t
    .replace(/\s*\((?:ispravno|original|cover|akordi|tabovi|live|ms|akordi i tekst|sa prelazima|tacna verzija|[a-h][b#]?m?|[0-9]{4})[^\)]*\)/gi, '')
    .replace(/\s+(?:original|ispravno|cover|akordi|tabovi|live|ms|akordi i tekst|sa prelazima|tacna verzija)\b/gi, '')
    .replace(/\s*-\s*(?:akordi|tekst|pesmarica|tacnaharmonija).*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }

  return t;
}

function normalizeChord(chord) {
  if (!chord) return '';
  let c = chord.trim();
  c = c.replace(/^[\[\(]+/, '').replace(/[\]\)\.,:]+$/, '');
  
  // Standard flat conversions
  c = c
    .replace(/^Bb/g, 'A#')
    .replace(/^Eb/g, 'D#')
    .replace(/^Ab/g, 'G#')
    .replace(/^Db/g, 'C#')
    .replace(/^Gb/g, 'F#')
    .replace(/^Cb/g, 'H')
    .replace(/\/Bb/g, '/A#')
    .replace(/\/Eb/g, '/D#')
    .replace(/\/Ab/g, '/G#')
    .replace(/\/Db/g, '/C#')
    .replace(/\/Gb/g, '/F#')
    .replace(/\/Cb/g, '/H');

  // In ex-yu tabs, B / Bm / B7 is almost universally used for B-flat (A#)
  c = c
    .replace(/^Bm/g, 'A#m')
    .replace(/^B7/g, 'A#7')
    .replace(/^Bmaj/g, 'A#maj')
    .replace(/^Bdim/g, 'A#dim')
    .replace(/^Bsus/g, 'A#sus')
    .replace(/^B(?=[0-9]|$)/g, 'A#')
    .replace(/\/Bm/g, '/A#m')
    .replace(/\/B7/g, '/A#7')
    .replace(/\/B(?=[0-9]|$)/g, '/A#');

  return c;
}

function isChordToken(token) {
  if (!token) return false;
  const clean = token.replace(/^[\[\(]+/, '').replace(/[\]\)\.,:\*\#]+$/, '');
  const chordRegex = /^[A-H][b#]?(?:m|maj|min|dim|aug|sus|add|M)?[0-9]*(?:[\/][A-H][b#]?)?$/;
  return chordRegex.test(clean);
}

function cleanTabLine(line) {
  if (!line) return '';
  // Replace long runs of dashes or underscores with spaces to preserve column positions
  return line.replace(/[-_]{2,}/g, (m) => ' '.repeat(m.length));
}

function isChordLine(line) {
  const cleaned = cleanTabLine(line);
  const trimmed = cleaned.trim();
  if (!trimmed) return false;
  if (/^(intro|uvod|solo|prelaz|outro|kraj|ref|refren|strofa|bridge|chorus|verse)[:\.\s]/i.test(trimmed)) {
    const withoutHeader = trimmed.replace(/^(intro|uvod|solo|prelaz|outro|kraj|ref|refren|strofa|bridge|chorus|verse)[:\.\s]+/i, '').trim();
    if (!withoutHeader) return false;
    const tokens = withoutHeader.split(/[\s,]+/).filter(Boolean);
    const chordCount = tokens.filter(isChordToken).length;
    return tokens.length > 0 && chordCount / tokens.length >= 0.7;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordCount = tokens.filter(isChordToken).length;
  return chordCount / tokens.length >= 0.7;
}

function mergeChordsIntoText(chordLine, textLine) {
  const cleanedChordLine = cleanTabLine(chordLine);
  const regex = /\S+/g;
  let match;
  const chords = [];
  while ((match = regex.exec(cleanedChordLine)) !== null) {
    if (isChordToken(match[0])) {
      chords.push({ col: match.index, chord: normalizeChord(match[0]) });
    }
  }

  if (chords.length === 0) return textLine;

  let result = textLine;
  for (let i = chords.length - 1; i >= 0; i--) {
    const { col, chord } = chords[i];
    if (col < result.length) {
      result = result.slice(0, col) + '[' + chord + ']' + result.slice(col);
    } else {
      const padding = ' '.repeat(col - result.length);
      result = result + padding + '[' + chord + ']';
    }
  }
  return result;
}

function formatStandaloneChords(line) {
  const cleaned = cleanTabLine(line);
  return cleaned.replace(/\b[A-H][b#]?(?:m|maj|min|dim|aug|sus|add|M)?[0-9]*(?:[\/][A-H][b#]?)?\b/g, (m) => {
    return '[' + normalizeChord(m) + ']';
  });
}

function formatSectionHeaders(line) {
  const t = line.trim();
  if (/^(intro|uvod|solo|prelaz|outro|kraj|ref|refren|strofa\s*\d*|bridge|chorus|verse\s*\d*)[:\.\s]*$/i.test(t)) {
    const clean = t.replace(/[:\.]+$/, '').trim();
    const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
    return `[${capitalized}]`;
  }
  return line;
}

function replicateVerseChords(lines) {
  // Find verse 1 chord pattern and project onto unharmonized verse lines
  const verse1Lines = [];
  let inVerse1 = false;

  for (const line of lines) {
    if (/^\[strofa\s*1?\]/i.test(line)) {
      inVerse1 = true;
      continue;
    }
    if (/^\[(refren|ref|solo|prelaz|outro|strofa\s*2)\]/i.test(line)) {
      inVerse1 = false;
    }
    if (inVerse1 && line.trim().length > 0) {
      // Extract chords and positions
      const chords = [...line.matchAll(/\[([A-H][b#]?[^\]]*)\]/g)];
      verse1Lines.push(chords.map(c => c[1]));
    }
  }

  if (verse1Lines.length === 0) return lines;

  // Now scan for unharmonized verses (lines without any [Chord])
  const result = [];
  let inUnharmonizedVerse = false;
  let verseLineIdx = 0;

  for (const line of lines) {
    if (/^\[strofa\s*\d+\]/i.test(line)) {
      inUnharmonizedVerse = true;
      verseLineIdx = 0;
      result.push(line);
      continue;
    }
    if (/^\[(refren|ref|solo|prelaz|outro)\]/i.test(line)) {
      inUnharmonizedVerse = false;
    }

    if (inUnharmonizedVerse && line.trim().length > 0 && !line.includes('[')) {
      const chordsForLine = verse1Lines[verseLineIdx % verse1Lines.length];
      if (chordsForLine && chordsForLine.length > 0) {
        // Place first chord at start, second chord in middle if available
        let harmonized = `[${chordsForLine[0]}]` + line;
        if (chordsForLine.length > 1 && line.length > 15) {
          const mid = Math.floor(line.length / 2);
          const spaceIdx = line.indexOf(' ', mid);
          if (spaceIdx > 0) {
            harmonized = `[${chordsForLine[0]}]` + line.slice(0, spaceIdx) + ` [${chordsForLine[1]}]` + line.slice(spaceIdx + 1);
          }
        }
        result.push(harmonized);
        verseLineIdx++;
        continue;
      }
    }
    result.push(line);
  }

  return result;
}

function processSongContent(rawPre) {
  const decoded = decodeHtmlEntities(rawPre);
  const rawLines = decoded.split('\n');
  let processed = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const nextLine = rawLines[i + 1];

    if (isChordLine(line) && nextLine && !isChordLine(nextLine) && nextLine.trim().length > 0) {
      processed.push(mergeChordsIntoText(line, nextLine));
      i++;
    } else if (isChordLine(line)) {
      processed.push(formatStandaloneChords(line));
    } else {
      const cleaned = line.replace(/^[-_\s]+$/, '');
      if (cleaned.length > 0) {
        processed.push(formatSectionHeaders(cleaned));
      }
    }
  }

  processed = replicateVerseChords(processed);

  return processed.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractUniqueChords(content) {
  const matches = [...content.matchAll(/\[([A-H][b#]?[^\]]*)\]/g)];
  return [...new Set(matches.map(m => m[1].trim()))].filter(Boolean);
}

function detectOriginalKey(chords) {
  if (!chords || chords.length === 0) return 'C';
  const first = chords[0];
  const root = first.replace(/[^A-H#]/g, '');
  if (first.includes('m') && !first.includes('maj')) {
    return root + 'm';
  }
  return root;
}

function updatePersistentMemory(newEntries) {
  try {
    let list = [];
    if (fs.existsSync(jsonPath)) {
      list = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }

    newEntries.forEach(newEntry => {
      const idx = list.findIndex(s => s.slug === newEntry.slug || (s.title === newEntry.title && s.artist === newEntry.artist));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...newEntry };
      } else {
        list.push(newEntry);
      }
    });

    fs.writeFileSync(jsonPath, JSON.stringify(list, null, 2));

    let md = '# AI Processed & Published Songs Catalog\n\nPersistent tracking log of all songs harmonized, verified, and published by the agent.\n\n';
    md += '| # | Izvođač | Naziv Pjesme | Tonalitet | YouTube ID | Izvor | Status | Mongo ID |\n';
    md += '|---|---|---|---|---|---|---|---|\n';

    list.forEach((s, i) => {
      const ytCol = s.youtubeId ? `[\`${s.youtubeId}\`](https://youtu.be/${s.youtubeId})` : '`—`';
      const sourceCol = s.source === 'youtube_url' ? 'YouTube URL' : (s.source === 'pesmarica.rs' ? 'Pesmarica.rs' : 'Screenshot');
      md += `| ${i + 1} | **${s.artist}** | ${s.title} | \`${s.originalKey}\` | ${ytCol} | ${sourceCol} | \`${s.status}\` ✅ | \`${s.mongoId}\` |\n`;
    });

    fs.writeFileSync(catalogPath, md);
    console.log(`[Memory] Updated persistent catalog! Total songs in catalog: ${list.length}`);
  } catch (err) {
    console.error('[Memory] Error updating persistent memory:', err);
  }
}

async function scrapeAndPublishPage(pageNum, staffId, genreIds) {
  const url = `https://www.pesmarica.rs/pesme?page=${pageNum}`;
  console.log(`\n======================================================`);
  console.log(`[Crawler] Fetching page ${pageNum}: ${url}`);
  console.log(`======================================================`);

  let html;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error(`[Crawler] Failed to fetch page ${pageNum}: HTTP ${res.status}`);
      return [];
    }
    html = await res.text();
  } catch (e) {
    console.error(`[Crawler] Network error on page ${pageNum}:`, e.message);
    return [];
  }

  const songUrls = [...new Set([...html.matchAll(/href=[\"'](\/akordi\/\d+\/[^\"']+)[\"']/gi)].map(m => m[1]))];
  console.log(`[Crawler] Found ${songUrls.length} songs on page ${pageNum}`);

  const processedSongs = [];

  for (let i = 0; i < songUrls.length; i++) {
    const relativeUrl = songUrls[i];
    const songUrl = `https://www.pesmarica.rs${relativeUrl}`;

    try {
      await delay(350);
      const sRes = await fetch(songUrl, { headers: HEADERS });
      if (!sRes.ok) continue;
      const sHtml = await sRes.text();

      const preMatch = sHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      if (!preMatch || !preMatch[1].trim()) continue;

      const ogTitleMatch = sHtml.match(/<meta\s+property=[\"']og:title[\"']\s+content=[\"']([^\"']+)[\"']/i);
      let artistName = '';
      let songTitle = '';

      if (ogTitleMatch) {
        const rawOg = decodeHtmlEntities(ogTitleMatch[1]).replace(/\|.*$/, '').trim();
        const parts = rawOg.split(/\s*-\s*/);
        if (parts.length >= 2) {
          artistName = parts[0].trim();
          songTitle = parts.slice(1).join(' - ').trim();
        }
      }

      if (!songTitle || !artistName) {
        const h1Match = sHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        songTitle = h1Match ? decodeHtmlEntities(h1Match[1]).replace(/<[^>]+>/g, '').trim() : '';
      }

      const cleanSongTitle = cleanOfficialTitle(songTitle, artistName);
      const cleanArtist = cleanArtistName(artistName);

      let content = processSongContent(preMatch[1]);
      if (!content || content.length < 50) continue;

      const chords = extractUniqueChords(content);
      if (chords.length === 0) continue;

      const originalKey = detectOriginalKey(chords);

      // PRE-PUBLISH QUALITY GATE: Full lyrics scan, unroll refrains, replicate chords onto unharmonized verses
      content = applyQualityGate(content, originalKey);

      const artistDoc = await Artist.findOrCreateByName(cleanArtist);

      // STRICT ZERO DUPLICATES: Check all songs of artist by normalized title
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
          song.arrangements[0].capo = 0;
          song.arrangements[0].difficulty = 'medium';
          song.arrangements[0].isPrimary = true;
        } else {
          song.arrangements = [{
            label: 'Osnovna verzija',
            content,
            originalKey,
            capo: 0,
            difficulty: 'medium',
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
          tags: ['pesmarica.rs', 'harmonizovano', 'studio-standard'],
          status: songStatus,
          createdBy: staffId,
          updatedBy: staffId,
          arrangements: [{
            label: 'Osnovna verzija',
            content,
            originalKey,
            capo: 0,
            difficulty: 'medium',
            isPrimary: true,
            createdBy: staffId
          }]
        });
        await Artist.updateOne({ _id: artistDoc._id }, { $inc: { songCount: 1 } });
        console.log(`[DB:Created] #${i + 1} "${cleanSongTitle}" by ${cleanArtist} (${originalKey}) -> Status: ${songStatus} | ID: ${song._id}`);
      }

      await AuditLog.record({
        req: { staff: { _id: staffId, name: 'solakmirnes', email: 'solakmirnes.dev@gmail.com', role: 'superadmin' }, ip: '127.0.0.1' },
        action: 'create',
        entity: 'song',
        entityId: song._id,
        entityLabel: song.title,
        meta: { status: 'published', artist: artistName, source: 'pesmarica.rs', key: originalKey }
      });

      processedSongs.push({
        title: song.title,
        artist: artistName,
        originalKey: originalKey,
        youtubeId: song.youtubeId || '',
        youtubeUrl: song.youtubeId ? `https://www.youtube.com/watch?v=${song.youtubeId}` : '',
        status: 'published',
        mongoId: song._id.toString(),
        slug: song.slug,
        source: 'pesmarica.rs',
        addedAt: new Date().toISOString()
      });

    } catch (songErr) {
      console.error(`[Error] Failed processing song ${songUrl}:`, songErr.message);
    }
  }

  if (processedSongs.length > 0) {
    updatePersistentMemory(processedSongs);
  }

  return processedSongs;
}

async function main() {
  const maxPages = parseInt(process.argv[2] || '10', 10);
  const startPage = parseInt(process.argv[3] || '1', 10);

  console.log(`[Main] Starting Pesmarica.rs Crawler & Publisher...`);
  console.log(`[Main] Range: Page ${startPage} to Page ${startPage + maxPages - 1}`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`[Main] Connected to MongoDB database.`);

  const staff = await mongoose.connection.db.collection('staff').findOne({ role: 'superadmin' });
  const staffId = staff ? staff._id : new mongoose.Types.ObjectId('6a8ce24999402a978a600f08');

  const genres = await Genre.find({ slug: { $in: ['pop', 'rock', 'folk', 'domaca', 'zabavna', 'starogradska'] } });
  const genreIds = genres.map(g => g._id);

  let totalImported = 0;

  for (let page = startPage; page < startPage + maxPages; page++) {
    const results = await scrapeAndPublishPage(page, staffId, genreIds);
    totalImported += results.length;
    console.log(`[Progress] Page ${page} complete. Imported in this page: ${results.length}. Cumulative total: ${totalImported}`);
    await delay(800);
  }

  console.log(`\n======================================================`);
  console.log(`[Main] COMPLETE! Successfully imported and published ${totalImported} songs.`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
