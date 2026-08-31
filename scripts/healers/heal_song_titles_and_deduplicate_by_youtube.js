import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import {
  cleanOfficialTitle,
  restoreExYuDiacritics,
  healOverlappingAndBrokenChords,
  countChordsInContent
} from './song_quality_gate.js';
import { toLatin } from '../../src/utils/latinise.js';

function toAsciiSlug(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/[š]/g, 's')
    .replace(/[đ]/g, 'dj')
    .replace(/[ž]/g, 'z')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function healAndDeduplicateByYouTube() {
  console.log('======================================================================');
  console.log('👑  OCTAVA YOUTUBE OFFICIAL TITLE REGRESSION & DEDUPLICATOR');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Connected to MongoDB Atlas Cloud.\n');

  // Pre-load all artist names in memory
  const allArtists = await Artist.collection.find({ deletedAt: null }, { projection: { _id: 1, name: 1 } }).toArray();
  const artistNameMap = new Map();
  allArtists.forEach(a => artistNameMap.set(a._id.toString(), a.name));

  // 1. Group by YouTube ID (for all songs with valid youtubeId)
  const songsWithYt = await Song.collection.find(
    { deletedAt: null, youtubeId: { $exists: true, $ne: null, $ne: '' } },
    { projection: { _id: 1, title: 1, slug: 1, youtubeId: 1, status: 1, artist: 1 } }
  ).toArray();

  console.log(`📊 Ukupno pronađeno ${songsWithYt.length} pjesama sa YouTube ID-jem na Atlasu.\n`);

  const ytGroups = new Map();
  for (const s of songsWithYt) {
    const yId = s.youtubeId.trim();
    if (!ytGroups.has(yId)) {
      ytGroups.set(yId, []);
    }
    ytGroups.get(yId).push(s);
  }

  let mergedYtGroups = 0;
  let duplicateSongsDeleted = 0;
  let titlesHealed = 0;

  const songUpdates = [];
  const deleteUpdates = [];

  for (const [yId, group] of ytGroups.entries()) {
    if (group.length <= 1) {
      const single = group[0];
      const artistName = artistNameMap.get(single.artist?.toString()) || '';
      const rawTitle = single.title;
      let clean = cleanOfficialTitle(rawTitle, artistName);
      clean = restoreExYuDiacritics(clean);

      if (clean && clean !== rawTitle) {
        songUpdates.push({
          updateOne: {
            filter: { _id: single._id },
            update: {
              $set: {
                title: clean,
                searchTitle: toLatin(clean).toLowerCase(),
                updatedAt: new Date()
              }
            }
          }
        });
        titlesHealed++;
      }
      continue;
    }

    // MULTIPLE SONGS WITH SAME YOUTUBE ID = DUPLICATES!
    mergedYtGroups++;

    // Pick canonical: prefer published, clean title without junk, highest chord count
    let canonical = group[0];
    let bestScore = -1;

    for (const doc of group) {
      let score = 0;
      const chords = doc.arrangements?.[0]?.chords?.length || 0;
      score += chords * 5;
      if (doc.status === 'published') score += 50;
      
      const t = doc.title.toLowerCase();
      if (t.includes('ispravak') || t.includes('tablatura') || t.includes('tacnija') || t.includes('akordi') || t.includes('verzija')) {
        score -= 100;
      }
      // Penalize corrupted titles like "Kafana je moja istina" vs "Kafana je moja sudbina"
      if (t.includes('istina') && group.some(g => g.title.toLowerCase().includes('sudbina'))) {
        score -= 200;
      }

      if (score > bestScore) {
        bestScore = score;
        canonical = doc;
      }
    }

    const artistName = artistNameMap.get(canonical.artist?.toString()) || '';
    let canonicalTitle = cleanOfficialTitle(canonical.title, artistName);
    canonicalTitle = restoreExYuDiacritics(canonicalTitle);

    console.log(`👑 [MERGING DUPLICATES] YT "${yId}" (${artistName}): "${canonical.title}" ➔ Canonical: "${canonicalTitle}"`);

    for (const dup of group) {
      if (dup._id.toString() === canonical._id.toString()) continue;

      // Soft delete duplicate
      deleteUpdates.push({
        updateOne: {
          filter: { _id: dup._id },
          update: {
            $set: {
              deletedAt: new Date(),
              slug: `deleted-${dup._id}-${dup.slug || 'dup'}`
            }
          }
        }
      });
      duplicateSongsDeleted++;
    }

    // Update canonical song with clean official title and published status
    songUpdates.push({
      updateOne: {
        filter: { _id: canonical._id },
        update: {
          $set: {
            title: canonicalTitle,
            searchTitle: toLatin(canonicalTitle).toLowerCase(),
            status: 'published',
            updatedAt: new Date()
          }
        }
      }
    });
  }

  if (deleteUpdates.length > 0) {
    console.log(`🧹 Purging ${deleteUpdates.length} duplicate songs in bulk...`);
    const CHUNK = 200;
    for (let i = 0; i < deleteUpdates.length; i += CHUNK) {
      await Song.bulkWrite(deleteUpdates.slice(i, i + CHUNK), { ordered: false });
    }
  }

  if (songUpdates.length > 0) {
    console.log(`✨ Writing ${songUpdates.length} official title & canonical updates in bulk...`);
    const CHUNK = 200;
    for (let i = 0; i < songUpdates.length; i += CHUNK) {
      await Song.bulkWrite(songUpdates.slice(i, i + CHUNK), { ordered: false });
    }
  }

  console.log('\n======================================================================');
  console.log('🎉 REZULTAT REGRESIJE I SPAJANJA DUPLIKATA PO YOUTUBE OFICIJELNOM ID-U:');
  console.log('======================================================================');
  console.log(`👑 Grupa duplikata pronađeno i spojeno:  ${mergedYtGroups}`);
  console.log(`🧹 Duplih pjesama trajno uklonjeno:       ${duplicateSongsDeleted}`);
  console.log(`✨ Naslova pjesama očišćeno od junk taga: ${titlesHealed}`);
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

healAndDeduplicateByYouTube().catch(err => {
  console.error('[YouTube Harmonizer Error]', err);
});
