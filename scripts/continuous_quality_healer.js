import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  cleanArtistName,
  normalizeTitleForDeduplication,
  restoreExYuDiacritics,
  correctGrammarAndSpelling,
  isDummyContent,
  countChordsInContent,
  isForeignSong,
  validateSongCompleteness,
  classifyGenresForArtist,
  detectOriginalKey,
  estimateDifficulty,
  extractCanonicalAndFeaturedArtists,
  collapseConsecutiveHeaders,
  sanitizeSongSlug
} from './song_quality_gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportsDir = path.join(__dirname, '../reports');
const dataDir = path.join(__dirname, '../data');

const logsDir = path.join(__dirname, '../logs');
const liveLogPath = path.join(logsDir, 'healer_live.log');

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Ensure every console.log is also flushed to logs/healer_live.log
const originalLog = console.log;
console.log = function(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  originalLog.apply(console, args);
  try {
    fs.appendFileSync(liveLogPath, line + '\n', 'utf8');
  } catch (e) {}
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hasDiacritics(str) {
  return /[čćšđžČĆŠĐŽ]/.test(str);
}

/**
 * Phase 1: Deduplicate and merge artists with live logging
 */
async function healAndMergeArtists() {
  const artists = await Artist.find({ deletedAt: null }).lean();
  const artistBuckets = {};

  for (const a of artists) {
    const cleaned = cleanArtistName(a.name);
    const norm = normalizeTitleForDeduplication(cleaned);
    if (!artistBuckets[norm]) artistBuckets[norm] = [];
    artistBuckets[norm].push({ doc: a, cleanedName: cleaned });
  }

  let mergedArtists = 0;
  let renamedArtists = 0;

  for (const [normKey, entries] of Object.entries(artistBuckets)) {
    if (entries.length === 1) {
      const { doc, cleanedName } = entries[0];
      if (doc.name !== cleanedName && cleanedName.length > 0) {
        await Artist.updateOne({ _id: doc._id }, { $set: { name: cleanedName } });
        console.log(`  🔤 [Artist:Renamed] "${doc.name}" -> "${cleanedName}"`);
        renamedArtists++;
      }
    } else {
      entries.sort((a, b) => {
        const aHasDia = hasDiacritics(a.cleanedName) ? 1 : 0;
        const bHasDia = hasDiacritics(b.cleanedName) ? 1 : 0;
        if (bHasDia !== aHasDia) return bHasDia - aHasDia;
        return (a.doc.createdAt || 0) - (b.doc.createdAt || 0);
      });

      const primary = entries[0].doc;
      const primaryCleanName = entries[0].cleanedName;
      if (primary.name !== primaryCleanName) {
        await Artist.updateOne({ _id: primary._id }, { $set: { name: primaryCleanName } });
      }

      for (let i = 1; i < entries.length; i++) {
        const duplicate = entries[i].doc;
        await Song.updateMany(
          { artist: duplicate._id },
          { $set: { artist: primary._id } }
        );
        await Artist.updateOne({ _id: duplicate._id }, { $set: { deletedAt: new Date() } });
        console.log(`  👥 [Artist:Merged] "${duplicate.name}" -> "${primaryCleanName}"`);
        mergedArtists++;
      }
    }
  }

  return { mergedArtists, renamedArtists };
}

/**
 * Phase 2 & 3: High-Speed 7-Pillar Healer with Real-Time Terminal Stream
 */
async function healAndAuditSongs() {
  const startTime = Date.now();
  console.log(`[Fetching] Querying all active songs and artists from MongoDB...`);
  
  const artistDocs = await Artist.find({ deletedAt: null }).select('_id name').lean();
  const artistNameMap = new Map(artistDocs.map((a) => [a._id.toString(), a.name]));

  const songs = await Song.find({ deletedAt: null })
    .select('_id title slug artist status genres tags arrangements createdAt')
    .lean();

  const totalActive = songs.length;
  console.log(`[Loaded] ${totalActive} total active songs found. Beginning live 7-pillar inspection stream...\n`);

  let titlesCleaned = 0;
  let arrangementsHealed = 0;
  let keysFixed = 0;
  let difficultyFixed = 0;
  let duetsNormalized = 0;
  let slugsFixed = 0;
  let duplicatesMerged = 0;
  let statusDrafted = 0;
  let genresFixed = 0;

  const dummySongs = [];
  const lyricsOnlySongs = [];
  const byArtist = {};
  const bulkSongUpdates = [];

  const BATCH_SIZE = 1000;
  const totalBatches = Math.ceil(songs.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batchStart = b * BATCH_SIZE;
    const batchSongs = songs.slice(batchStart, batchStart + BATCH_SIZE);
    let batchHealed = 0;
    let batchDummy = 0;

    for (const song of batchSongs) {
      const artistId = song.artist?.toString() || 'unknown';
      const rawArtistName = artistNameMap.get(artistId) || 'Nepoznat';

      // 3. Duet & Featuring Normalizer
      const { canonicalArtist, featuredArtists } = extractCanonicalAndFeaturedArtists(rawArtistName);
      let artistName = canonicalArtist || rawArtistName;

      if (!byArtist[artistId]) byArtist[artistId] = [];
      byArtist[artistId].push({ ...song, artistName });

      const arr = song.arrangements?.[0];
      const oldContent = arr?.content || '';

      // Check Dummy / Placeholder
      if (isDummyContent(oldContent)) {
        batchDummy++;
        dummySongs.push({
          id: song._id,
          title: song.title,
          artist: artistName,
          sample: oldContent.slice(0, 50).replace(/\n/g, ' ')
        });
        console.log(`  🟡 [Dummy/Lorem] "${song.title}" by ${artistName} -> Content: "${oldContent.slice(0, 40).trim()}..."`);
        continue;
      }

      const chordsCount = countChordsInContent(oldContent);
      if (chordsCount === 0) {
        lyricsOnlySongs.push({
          id: song._id,
          title: song.title,
          artist: artistName,
          sample: oldContent.slice(0, 50).replace(/\n/g, ' ')
        });
        console.log(`  ⚪ [0-Chords] "${song.title}" by ${artistName} -> Tekst bez akorada`);
      }

      // 1. Clean Title with Diacritics
      const cleanTitle = restoreExYuDiacritics(cleanOfficialTitle(song.title, artistName));
      let titleChanged = false;
      if (song.title !== cleanTitle && cleanTitle.length > 0) {
        titleChanged = true;
        titlesCleaned++;
      }

      // 2. Heal Arrangements & Section Headers & Collapse Double Headers
      let healedContent = applyQualityGate(oldContent, arr?.originalKey || '');
      healedContent = collapseConsecutiveHeaders(healedContent);
      healedContent = correctGrammarAndSpelling(healedContent);
      healedContent = healedContent.replace(/\[\[+([A-H][b#]?[^\]]*)\]\]+/g, '[$1]');

      let contentChanged = false;
      if (healedContent !== oldContent) {
        contentChanged = true;
        arrangementsHealed++;
        batchHealed++;
        console.log(`  🟢 [Healed] "${cleanTitle || song.title}" by ${artistName} (strofe, refreni, kvačice)`);
      }

      // 3. Harmonic Key Auto-Detector & Key Sanity
      let key = arr?.originalKey || '';
      let keyChanged = false;
      const detectedKey = detectOriginalKey(healedContent, key);
      if (detectedKey && key !== detectedKey) {
        key = detectedKey;
        keyChanged = true;
        keysFixed++;
      }

      // 4. Auto-Difficulty Estimator
      let diff = arr?.difficulty || '';
      let diffChanged = false;
      const calculatedDiff = estimateDifficulty(healedContent);
      if (diff !== calculatedDiff) {
        diff = calculatedDiff;
        diffChanged = true;
        difficultyFixed++;
      }

      // 5. Featured Artist Tags
      let tags = song.tags || [];
      let tagsChanged = false;
      if (featuredArtists.length > 0) {
        const newTags = [...tags];
        for (const fa of featuredArtists) {
          const t = fa.toLowerCase().trim();
          if (!newTags.includes(t)) {
            newTags.push(t);
            tagsChanged = true;
          }
        }
        if (tagsChanged) {
          tags = newTags;
          duetsNormalized++;
        }
      }

      // 6. Status Validation
      let status = song.status || 'published';
      let statusChanged = false;
      const isForeign = isForeignSong(song.title, artistName, healedContent);
      const isComplete = validateSongCompleteness(song.title, healedContent);

      if (status === 'published' && (isForeign || !isComplete)) {
        status = 'draft';
        statusChanged = true;
        statusDrafted++;
        console.log(`  ⚠️ [Drafted] "${song.title}" by ${artistName} -> ${isForeign ? 'Strana muzika' : 'Nepotpun tekst (<6 stihova)'}`);
      }

      // 7. Genre Classification
      let genres = song.genres || [];
      let genresChanged = false;
      if (!genres || genres.length === 0) {
        genres = classifyGenresForArtist(artistName, song.title);
        genresChanged = true;
        genresFixed++;
      }

      const updateFields = {
        title: cleanTitle || song.title,
        status,
        genres,
        tags,
        'arrangements.0.content': healedContent,
        'arrangements.0.originalKey': key,
        'arrangements.0.difficulty': diff
      };

      if (titleChanged || contentChanged || keyChanged || diffChanged || tagsChanged || statusChanged || genresChanged) {
        bulkSongUpdates.push({
          updateOne: {
            filter: { _id: song._id },
            update: { $set: updateFields }
          }
        });
      }
    }

    const currentProcessed = Math.min(batchStart + BATCH_SIZE, totalActive);
    const percent = ((currentProcessed / totalActive) * 100).toFixed(1);
    console.log(`⚡ [7-Pillars] Batch ${b + 1}/${totalBatches} | ${currentProcessed}/${totalActive} (${percent}%) | Healed: ${batchHealed} | Dummy: ${batchDummy}`);
  }

  // Execute Bulk Updates in Chunks of 200
  if (bulkSongUpdates.length > 0) {
    console.log(`\n[Database] Writing ${bulkSongUpdates.length} healed updates to MongoDB...`);
    const CHUNK_SIZE = 200;
    for (let i = 0; i < bulkSongUpdates.length; i += CHUNK_SIZE) {
      const chunk = bulkSongUpdates.slice(i, i + CHUNK_SIZE);
      await Song.bulkWrite(chunk, { ordered: false });
    }
    console.log(`[Database] Bulk write finished!`);
  }

  // Phase 3: Deduplicate per artist
  console.log(`\n[Deduplication] Checking duplicate songs per artist...`);
  const dupeBulkUpdates = [];
  for (const [artistId, aSongs] of Object.entries(byArtist)) {
    const titleBuckets = {};

    for (const song of aSongs) {
      const officialTitle = cleanOfficialTitle(song.title, song.artistName);
      const norm = normalizeTitleForDeduplication(officialTitle);
      if (!titleBuckets[norm]) titleBuckets[norm] = [];
      titleBuckets[norm].push({ song, officialTitle });
    }

    for (const [normTitle, dupes] of Object.entries(titleBuckets)) {
      if (dupes.length > 1) {
        dupes.sort((a, b) => {
          const aContent = a.song.arrangements?.[0]?.content || '';
          const bContent = b.song.arrangements?.[0]?.content || '';

          const aDummy = isDummyContent(aContent);
          const bDummy = isDummyContent(bContent);
          if (aDummy !== bDummy) return aDummy ? 1 : -1;

          const aChords = countChordsInContent(aContent);
          const bChords = countChordsInContent(bContent);
          if ((aChords > 0) !== (bChords > 0)) return bChords > 0 ? 1 : -1;

          return bContent.length - aContent.length;
        });

        const primary = dupes[0].song;
        const bestTitle = dupes[0].officialTitle;
        let primaryArr = primary.arrangements?.[0];

        // Grey Bar Eliminator: If primary was dummy or had 0 chords, copy chords from duplicate
        for (let i = 1; i < dupes.length; i++) {
          const dupeArr = dupes[i].song.arrangements?.[0];
          const primaryChords = countChordsInContent(primaryArr?.content);
          const dupeChords = countChordsInContent(dupeArr?.content);

          if ((isDummyContent(primaryArr?.content) || primaryChords === 0) && dupeChords > 0) {
            primary.arrangements = dupes[i].song.arrangements;
            primaryArr = primary.arrangements[0];
            break;
          }
        }

        if (primary.title !== bestTitle && bestTitle.length > 0) {
          dupeBulkUpdates.push({
            updateOne: {
              filter: { _id: primary._id },
              update: { $set: { title: bestTitle, arrangements: primary.arrangements } }
            }
          });
        }

        for (let i = 1; i < dupes.length; i++) {
          const duplicate = dupes[i].song;
          dupeBulkUpdates.push({
            updateOne: {
              filter: { _id: duplicate._id },
              update: { $set: { deletedAt: new Date() } }
            }
          });
          duplicatesMerged++;
          console.log(`  👥 [Dupe:Merged] "${duplicate.title}" -> "${bestTitle}" (${dupes[0].song.artistName})`);
        }
      }
    }
  }

  if (dupeBulkUpdates.length > 0) {
    const CHUNK_SIZE = 200;
    for (let i = 0; i < dupeBulkUpdates.length; i += CHUNK_SIZE) {
      const chunk = dupeBulkUpdates.slice(i, i + CHUNK_SIZE);
      await Song.bulkWrite(chunk, { ordered: false });
    }
  }

  // 6. Export Scraper Priority Queue (Crawler Target Generator)
  const queuePath = path.join(dataDir, 'scraper_priority_queue.json');
  const priorityQueue = [
    ...dummySongs.map(d => ({ ...d, priority: 'URGENT_DUMMY_OVERWRITE' })),
    ...lyricsOnlySongs.map(l => ({ ...l, priority: 'NEEDS_CHORDS' }))
  ];
  fs.writeFileSync(queuePath, JSON.stringify(priorityQueue, null, 2), 'utf8');

  const durationMs = Date.now() - startTime;
  const harmonizedCount = totalActive - dummySongs.length - lyricsOnlySongs.length;

  // Generate Live Audit Markdown Report
  const reportPath = path.join(reportsDir, 'HEALER_AUDIT_REPORT.md');
  const timestamp = new Date().toISOString();

  const dummyByArtist = {};
  for (const d of dummySongs) {
    dummyByArtist[d.artist] = (dummyByArtist[d.artist] || 0) + 1;
  }
  const topDummyArtists = Object.entries(dummyByArtist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const reportMarkdown = `# 🏥 Octava Continuous Quality Healer — 7-Pillar Live Diagnostic Report

**Last Sweep Timestamp:** \`${timestamp}\`  
**Execution Duration:** \`${(durationMs / 1000).toFixed(2)}s\`

---

## 📊 Catalog Health Matrix

| Metric | Count | Percentage |
| :--- | :--- | :--- |
| 🎵 **Total Active Songs in DB** | **${totalActive}** | 100% |
| 🟢 **Harmonized (Real Studio Chords)** | **${harmonizedCount}** | **${((harmonizedCount / totalActive) * 100).toFixed(1)}%** |
| 🟡 **Dummy / Lorem Ipsum Placeholders** | **${dummySongs.length}** | ${((dummySongs.length / totalActive) * 100).toFixed(1)}% |
| ⚪ **Lyrics Only (0 Chords)** | **${lyricsOnlySongs.length}** | ${((lyricsOnlySongs.length / totalActive) * 100).toFixed(1)}% |
| 🔄 **Songs Healed in Last Pass** | **${arrangementsHealed}** | — |
| 🎼 **Harmonic Keys Auto-Detected** | **${keysFixed}** | — |
| 🎸 **Difficulties Calculated** | **${difficultyFixed}** | — |
| 👥 **Duets & Featurings Separated** | **${duetsNormalized}** | — |
| 🔗 **Canonical SEO Slugs Fixed** | **${slugsFixed}** | — |
| 🔤 **Titles Cleaned / Diacritics Fixed** | **${titlesCleaned}** | — |
| 👥 **Duplicate Songs Merged** | **${duplicatesMerged}** | — |
| 🏷️ **Genres Auto-Assigned** | **${genresFixed}** | — |

---

## 🟡 Top Artists with Dummy / Lorem Ipsum Songs (Target for Scraper)

${topDummyArtists.map(([artist, count], i) => `${i + 1}. **${artist || 'Nepoznat izvođač'}**: \`${count}\` placeholder pjesama`).join('\n')}

---

## 🎯 Scraper Priority Queue Status
- Active crawl targets generated: \`${priorityQueue.length}\` items in \`data/scraper_priority_queue.json\`

---
_Generated automatically by Octava Continuous Quality Healer Daemon._
`;

  fs.writeFileSync(reportPath, reportMarkdown, 'utf8');

  return {
    totalActive,
    harmonizedCount,
    dummyCount: dummySongs.length,
    lyricsOnlyCount: lyricsOnlySongs.length,
    titlesCleaned,
    arrangementsHealed,
    keysFixed,
    difficultyFixed,
    duetsNormalized,
    slugsFixed,
    duplicatesMerged,
    durationMs
  };
}

async function runContinuousPass() {
  console.log(`\n======================================================================`);
  console.log(`[ContinuousHealer] 🚀 STARTING 7-PILLAR REAL-TIME REGRESSION SWEEP`);
  console.log(`======================================================================`);

  const artistResult = await healAndMergeArtists();
  console.log(`[Artists] Merged: ${artistResult.mergedArtists} | Renamed: ${artistResult.renamedArtists}`);

  const songResult = await healAndAuditSongs();
  console.log(`\n======================================================================`);
  console.log(`[ContinuousHealer] 🏁 7-PILLAR PASS FINISHED in ${(songResult.durationMs / 1000).toFixed(2)}s`);
  console.log(`  🎵 Total Songs:        ${songResult.totalActive}`);
  console.log(`  🟢 Harmonized Chords:   ${songResult.harmonizedCount} (${((songResult.harmonizedCount / songResult.totalActive) * 100).toFixed(1)}%)`);
  console.log(`  🟡 Dummy/Lorem Ipsum:   ${songResult.dummyCount}`);
  console.log(`  ⚪ 0-Chords (Lyrics):   ${songResult.lyricsOnlyCount}`);
  console.log(`  🔄 Healed Content:     ${songResult.arrangementsHealed}`);
  console.log(`  🎼 Keys Fixed:         ${songResult.keysFixed}`);
  console.log(`  🎸 Difficulties:       ${songResult.difficultyFixed}`);
  console.log(`  👥 Duets Separated:    ${songResult.duetsNormalized}`);
  console.log(`  🔗 Slugs Sanitized:    ${songResult.slugsFixed}`);
  console.log(`  🔤 Cleaned Titles:     ${songResult.titlesCleaned}`);
  console.log(`  👥 Merged Duplicates:   ${songResult.duplicatesMerged}`);
  console.log(`  🎯 Scraper Queue:      data/scraper_priority_queue.json`);
  console.log(`  📄 Report updated:     reports/HEALER_AUDIT_REPORT.md`);
  console.log(`======================================================================\n`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`[ContinuousHealer] Connected to MongoDB. Running continuous regression healer daemon...`);

  while (true) {
    try {
      await runContinuousPass();
    } catch (err) {
      console.error(`[ContinuousHealer] Error during healing cycle:`, err.message);
    }
    // Zero-pause continuous cycle
    await delay(100);
  }
}

main().catch(console.error);
