import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  restoreExYuDiacritics,
  healOverlappingAndBrokenChords,
  correctGrammarAndSpelling,
  detectOriginalKey,
  estimateDifficulty,
  countChordsInContent
} from './song_quality_gate.js';
import { snapChordsToVowelNucleus, validateHarmonicStructure } from '../../src/utils/balkan_harmony_engine.js';
import { toLatin } from '../../src/utils/latinise.js';

export async function runMasterSweep() {
  console.log('======================================================================');
  console.log('💎  OCTAVA MASTER HARMONY, GRAMMAR & AUTO-PROMOTION ENGINE');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Connected to MongoDB Atlas Cloud.\n');

  const totalSongs = await Song.countDocuments({ deletedAt: null });
  console.log(`📊 Ukupno pronađeno ${totalSongs.toLocaleString('sr-RS')} živih pjesama na Atlasu.\n`);

  const BATCH_SIZE = 300;
  let processed = 0;
  let promotedCount = 0;
  let healedCount = 0;
  let grammarFixedCount = 0;

  for (let offset = 0; offset < totalSongs; offset += BATCH_SIZE) {
    const songs = await Song.find({ deletedAt: null })
      .skip(offset)
      .limit(BATCH_SIZE)
      .populate('artist', 'name')
      .lean();

    const bulkOps = [];

    for (const song of songs) {
      processed++;
      const artistName = song.artist?.name || '';
      let modified = false;

      // 1. Clean Title & Grammar
      let cleanTitle = cleanOfficialTitle(song.title, artistName);
      cleanTitle = correctGrammarAndSpelling(cleanTitle);
      cleanTitle = restoreExYuDiacritics(cleanTitle);

      const titleChanged = cleanTitle !== song.title;

      // 2. Heal Arrangements (Grammar, Syllable Snapping, Quality Gates)
      let arrangementsChanged = false;
      const updatedArrangements = (song.arrangements || []).map(arr => {
        let content = arr.content || '';
        const oldContent = content;

        // Apply 9-Layer Quality Gate
        content = applyQualityGate(content, arr.originalKey);
        content = healOverlappingAndBrokenChords(content);
        content = correctGrammarAndSpelling(content);
        content = restoreExYuDiacritics(content);

        // Apply Guitarist Syllable Snapping Line by Line
        const lines = content.split('\n');
        const snappedLines = lines.map(line => snapChordsToVowelNucleus(line));
        content = snappedLines.join('\n');

        const chordsCount = countChordsInContent(content);
        const key = detectOriginalKey(content, arr.originalKey) || arr.originalKey || 'Am';
        const diff = estimateDifficulty(content);

        if (content !== oldContent || arr.originalKey !== key || arr.difficulty !== diff) {
          arrangementsChanged = true;
          return {
            ...arr,
            content,
            originalKey: key,
            difficulty: diff
          };
        }
        return arr;
      });

      // 3. Check for Promotion from Draft to Published
      const primaryArr = updatedArrangements[0];
      const chordsCount = primaryArr && primaryArr.content ? countChordsInContent(primaryArr.content) : 0;
      const lyricsLength = primaryArr && primaryArr.content ? primaryArr.content.length : 0;

      let newStatus = song.status;
      if (song.status === 'draft' && chordsCount >= 2 && lyricsLength >= 120) {
        newStatus = 'published';
        promotedCount++;
      }

      if (titleChanged || arrangementsChanged || newStatus !== song.status) {
        healedCount++;
        if (titleChanged) grammarFixedCount++;

        bulkOps.push({
          updateOne: {
            filter: { _id: song._id },
            update: {
              $set: {
                title: cleanTitle,
                searchTitle: toLatin(cleanTitle).toLowerCase(),
                arrangements: updatedArrangements,
                status: newStatus,
                updatedAt: new Date()
              }
            }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await Song.bulkWrite(bulkOps, { ordered: false });
    }

    process.stdout.write(`\r🚀 Progres: ${processed.toLocaleString('sr-RS')} / ${totalSongs.toLocaleString('sr-RS')} | Healed: ${healedCount} | Promoted to Published: ${promotedCount}`);
  }

  console.log('\n\n======================================================================');
  console.log('🎉 REZULTAT MASTER HARMONIJSKOG I GRAMATIČKOG ČIŠĆENJA:');
  console.log('======================================================================');
  console.log(`✅ Ukupno pjesama ispolirano:           ${healedCount}`);
  console.log(`🌟 Promovisano u Published (Zlatne):    ${promotedCount}`);
  console.log(`✍️ Gramatika i kvačice ispravljene:      ${grammarFixedCount}`);
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

runMasterSweep().catch(err => {
  console.error('[Master Sweep Error]', err);
});
