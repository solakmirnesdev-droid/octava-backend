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
import { applyQualityGate, cleanOfficialTitle, cleanArtistName } from './song_quality_gate.js';

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

const KNOWN_ARTISTS = [
  'aca_matic', 'aco_pejovic', 'adil', 'alegro_bend', 'aleksandra_mladenovic', 'aleksandra_prijovic',
  'aleksandra_radovic', 'ana_bekuta', 'al_dino', 'aleksandra_kovac', 'amar_gile', 'ana_nikolic',
  'angel_dimov', 'apsolutno_romanticno', 'azra', 'anastasija_raznatovic', 'amadeus_bend', 'alen_islamovic',
  'aca_lukas', 'babe', 'badza', 'baja', 'bajaga', 'bane_mojicevic', 'bane_bojanic', 'beba_selimovic',
  'bebi_dol', 'beki_bekic', 'beogradski_sindikat', 'bjelo_dugme', 'boban_zdravkovic', 'bora_drljca',
  'bora_spuzuc_kvaka', 'bora_corba', 'biljana_jeftic', 'ceca_raznjatovic', 'cakana', 'cune_gojkovic',
  'dado_polumenta', 'dado_topic', 'dara_bubamara', 'darko_rundek', 'dejan_cukic', 'dejan_matic',
  'dino_dvornik', 'dino_merlin', 'dobrivoje_topalovic', 'dragana_mirkovic', 'dule_rajkovic', 'dusko_kulis',
  'darko_lazic', 'dona_ares', 'dzej_ramadanovski', 'dzenan_loncarevic', 'djordje_balasevic', 'djani',
  'elma', 'enes_begovic', 'elektricni_orgazam', 'era_ojdanic', 'emina_jahovic', 'galija', 'garavi_sokak1',
  'gibonni', 'gordana_lazarevic', 'gordana_stojicevic', 'halid_beslic', 'halid_muslimovic', 'haris_dzinovic',
  'hanka_paldum', 'hari_mata_hari', 'ivana_selakov', 'indexi', 'jovana_tipsin', 'juzni_vetar',
  'kemal_monteno', 'lepa_brena', 'marinko_rokvic', 'medeni_mesec', 'mile_kitic', 'miroslav_ilic',
  'nedeljko_bajic_baja', 'oliver_dragojevic', 'parni_valjak', 'prljavo_kazaliste', 'riblja_corba',
  'saban_saulic', 'sasa_kovacevic', 'sasa_matic', 'sinan_sakic', 'snezana_djurisic', 'toma_zdravkovic',
  'toshe_proeski', 'vesna_zmijanac', 'zeljko_bebek', 'zeljko_joksimovic', 'zeljko_samardzic', 'zdravko_colic'
];

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

function processSongContent(rawPre) {
  const decoded = decodeHtmlEntities(rawPre);
  const rawLines = decoded.split('\n');
  const processed = [];

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
        processed.push(cleaned);
      }
    }
  }

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
      const idx = list.findIndex(s => s.slug === newEntry.slug || (s.title.toLowerCase() === newEntry.title.toLowerCase() && s.artist.toLowerCase() === newEntry.artist.toLowerCase()));
      if (idx >= 0) {
        // OVERWRITE with tacnaharmonija version!
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
      const sourceCol = s.source === 'tacnaharmonija.rs' ? '**TačnaHarmonija ⭐**' : (s.source === 'youtube_url' ? 'YouTube URL' : 'Pesmarica.rs');
      md += `| ${i + 1} | **${s.artist}** | ${s.title} | \`${s.originalKey}\` | ${ytCol} | ${sourceCol} | \`${s.status}\` ✅ | \`${s.mongoId}\` |\n`;
    });

    fs.writeFileSync(catalogPath, md);
    console.log(`[Memory] Updated persistent catalog! Total songs: ${list.length}`);
  } catch (err) {
    console.error('[Memory] Error updating persistent memory:', err);
  }
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return await res.text();
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await delay(1000 * attempt);
    }
  }
  return null;
}

async function scrapeArtist(artistSlug, staffId, genreIds) {
  const artistUrl = `http://tacnaharmonija.rs/${artistSlug}/`;
  console.log(`\n------------------------------------------------------`);
  console.log(`[TacnaHarmonija] Scanning artist: ${artistSlug} (${artistUrl})`);
  console.log(`------------------------------------------------------`);

  let html;
  try {
    html = await fetchWithRetry(artistUrl);
    if (!html) return [];
  } catch (e) {
    console.log(`[TacnaHarmonija] Could not fetch artist ${artistSlug} (${e.message}). Skipping.`);
    return [];
  }

  // Extract artist name from title
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  let artistName = '';
  if (titleMatch) {
    artistName = decodeHtmlEntities(titleMatch[1]).replace(/\s*-\s*Tačna\s*harmonija/i, '').trim();
  }
  if (!artistName) {
    artistName = artistSlug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Extract song links under artist
  const songMatches = [...html.matchAll(new RegExp(`<a\\s+[^>]*href=[\\"\\'](/${artistSlug}/[^/\\"\\']+/)[\\"\\'][^>]*>(.*?)</a>`, 'gi'))];
  const uniqueSongs = [];
  const seen = new Set();
  for (const m of songMatches) {
    const relUrl = m[1];
    const rawTitle = decodeHtmlEntities(m[2]).replace(/<[^>]+>/g, '').trim();
    if (!seen.has(relUrl) && rawTitle.length > 0) {
      seen.add(relUrl);
      uniqueSongs.push({ relUrl, title: rawTitle });
    }
  }

  console.log(`[TacnaHarmonija] Found ${uniqueSongs.length} songs for ${artistName}`);

  const processed = [];

  for (let i = 0; i < uniqueSongs.length; i++) {
    const { relUrl, title: extractedTitle } = uniqueSongs[i];
    const songUrl = `http://tacnaharmonija.rs${relUrl}`;

    try {
      await delay(350);
      const sHtml = await fetchWithRetry(songUrl);
      if (!sHtml) continue;

      // Extract pre or text block
      const preMatch = sHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i) || sHtml.match(/<div class=["']tekst["'][^>]*>([\s\S]*?)<\/div>/i);
      let rawContent = preMatch ? preMatch[1] : '';

      if (!rawContent) {
        // Look for description meta tag or article content
        const metaDesc = sHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
        if (metaDesc && metaDesc[1].length > 80) {
          rawContent = metaDesc[1];
        }
      }

      let content = processSongContent(rawContent);
      const chords = extractUniqueChords(content);
      const originalKey = detectOriginalKey(chords);

      const cleanSongTitle = cleanOfficialTitle(extractedTitle, artistName);
      const cleanArtist = cleanArtistName(artistName);

      // PRE-PUBLISH QUALITY GATE
      content = applyQualityGate(content, originalKey);

      const artistDoc = await Artist.findOrCreateByName(cleanArtist);

      // Check if duplicate exists -> REPLACE / OVERWRITE WITH TACNA HARMONIJA!
      const existingSongs = await Song.find({ artist: artistDoc._id }).setOptions({ withDeleted: true });
      const normSearch = normalizeTitle(cleanSongTitle);
      let song = existingSongs.find(s => normalizeTitle(s.title) === normSearch);

      if (song) {
        // OVERWRITE DUPLICATE WITH HIGH PRECISION TACNA HARMONIJA
        song.title = cleanSongTitle;
        song.artist = artistDoc._id;
        song.genres = genreIds;
        song.status = 'published';
        song.deletedAt = null;
        song.deletedBy = undefined;
        song.updatedBy = staffId;
        if (!song.tags.includes('tacnaharmonija.rs')) {
          song.tags.push('tacnaharmonija.rs');
        }

        if (song.arrangements && song.arrangements.length > 0) {
          song.arrangements[0].content = content;
          song.arrangements[0].originalKey = originalKey;
          song.arrangements[0].capo = 0;
          song.arrangements[0].difficulty = 'medium';
          song.arrangements[0].isPrimary = true;
        } else {
          song.arrangements = [{
            label: 'Osnovna verzija (Tačna harmonija)',
            content,
            originalKey,
            capo: 0,
            difficulty: 'medium',
            isPrimary: true,
            createdBy: staffId
          }];
        }
        await song.save();
        console.log(`[TacnaHarmonija:REPLACED] "${cleanSongTitle}" by ${cleanArtist} (${originalKey}) -> Updated ID: ${song._id}`);
      } else {
        song = await Song.create({
          title: cleanSongTitle,
          artist: artistDoc._id,
          genres: genreIds,
          tags: ['tacnaharmonija.rs', 'gold-standard', 'harmonizovano'],
          status: 'published',
          createdBy: staffId,
          updatedBy: staffId,
          arrangements: [{
            label: 'Osnovna verzija (Tačna harmonija)',
            content,
            originalKey,
            capo: 0,
            difficulty: 'medium',
            isPrimary: true,
            createdBy: staffId
          }]
        });
        await Artist.updateOne({ _id: artistDoc._id }, { $inc: { songCount: 1 } });
        console.log(`[TacnaHarmonija:Created] "${extractedTitle}" by ${artistName} (${originalKey}) -> New ID: ${song._id}`);
      }

      await AuditLog.record({
        req: { staff: { _id: staffId, name: 'solakmirnes', email: 'solakmirnes.dev@gmail.com', role: 'superadmin' }, ip: '127.0.0.1' },
        action: 'create',
        entity: 'song',
        entityId: song._id,
        entityLabel: song.title,
        meta: { status: 'published', artist: artistName, source: 'tacnaharmonija.rs', key: originalKey, replacedDuplicate: !!song }
      });

      processed.push({
        title: song.title,
        artist: artistName,
        originalKey: originalKey,
        youtubeId: song.youtubeId || '',
        youtubeUrl: song.youtubeId ? `https://www.youtube.com/watch?v=${song.youtubeId}` : '',
        status: 'published',
        mongoId: song._id.toString(),
        slug: song.slug,
        source: 'tacnaharmonija.rs',
        addedAt: new Date().toISOString()
      });

    } catch (err) {
      console.error(`[Error] Failed song ${songUrl}:`, err.message);
    }
  }

  if (processed.length > 0) {
    updatePersistentMemory(processed);
  }

  return processed;
}

async function main() {
  console.log(`======================================================`);
  console.log(`[Main] Starting TacnaHarmonija.rs Gold-Standard Scraper`);
  console.log(`[Main] Total Artists to scan: ${KNOWN_ARTISTS.length}`);
  console.log(`======================================================\n`);

  await mongoose.connect(process.env.MONGODB_URI);

  const staff = await mongoose.connection.db.collection('staff').findOne({ role: 'superadmin' });
  const staffId = staff ? staff._id : new mongoose.Types.ObjectId('6a8ce24999402a978a600f08');

  const genres = await Genre.find({ slug: { $in: ['pop', 'rock', 'folk', 'domaca', 'zabavna', 'starogradska'] } });
  const genreIds = genres.map(g => g._id);

  let totalProcessed = 0;

  for (let i = 0; i < KNOWN_ARTISTS.length; i++) {
    const artistSlug = KNOWN_ARTISTS[i];
    const results = await scrapeArtist(artistSlug, staffId, genreIds);
    totalProcessed += results.length;
    console.log(`[Progress] Artist ${i + 1}/${KNOWN_ARTISTS.length} (${artistSlug}) done. Processed: ${results.length}. Total: ${totalProcessed}`);
    await delay(500);
  }

  console.log(`\n======================================================`);
  console.log(`[Main] COMPLETE! Scraped & Replaced ${totalProcessed} songs from Tačna Harmonija.`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
