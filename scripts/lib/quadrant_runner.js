import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  restoreExYuDiacritics,
  correctGrammarAndSpelling,
  isDummyContent,
  detectOriginalKey,
  estimateDifficulty,
  healOverlappingAndBrokenChords
} from '../song_quality_gate.js';

const SLEEP_MS = 3000;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function fastHash(str) {
  return crypto.createHash('md5').update(str || '').digest('hex');
}

export async function runQuadrantWorker(config) {
  const { name, quadrantIndex, totalQuadrants, direction, color = '\x1b[32m' } = config;
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`${color}🚀 [${name}] Hyper-Speed Engine Online on Atlas (Quadrant ${quadrantIndex + 1}/${totalQuadrants} | ${direction.toUpperCase()})\x1b[0m`);

  // In-Memory Hash-Guard for verified clean songs
  const cleanCache = new Map();
  const BATCH_SIZE = 250;

  while (true) {
    const startTime = Date.now();
    try {
      const totalCount = await Song.countDocuments({ deletedAt: null });
      const quadSize = Math.ceil(totalCount / totalQuadrants);
      const startOffset = quadrantIndex * quadSize;
      const sortOrder = direction === 'desc' ? { _id: -1 } : { _id: 1 };

      let totalProcessed = 0;
      let totalHealed = 0;
      let skippedFast = 0;

      for (let offset = 0; offset < quadSize; offset += BATCH_SIZE) {
        const currentLimit = Math.min(BATCH_SIZE, quadSize - offset);
        const batch = await Song.find({ deletedAt: null })
          .select('_id title arrangements.content arrangements.originalKey arrangements.difficulty artist')
          .sort(sortOrder)
          .skip(startOffset + offset)
          .limit(currentLimit)
          .populate('artist', 'name')
          .lean();

        if (!batch || batch.length === 0) break;

        const bulkUpdates = [];

        for (const s of batch) {
          totalProcessed++;
          const artistName = s.artist?.name || '';
          const arr = s.arrangements?.[0];
          const oldContent = arr?.content || '';

          if (!oldContent || isDummyContent(oldContent)) continue;

          const currentFingerprint = fastHash(`${s.title}|${oldContent}|${arr?.originalKey}|${arr?.difficulty}`);
          
          // Hash-Guard: if already verified 100% clean and unchanged, skip in 0.0001 ms!
          if (cleanCache.get(s._id.toString()) === currentFingerprint) {
            skippedFast++;
            continue;
          }

          // Full 9-Layer Quality Gate + Anti-Overlap
          const cleanTitle = restoreExYuDiacritics(cleanOfficialTitle(s.title, artistName));
          const titleChanged = cleanTitle && cleanTitle !== s.title;

          let healedContent = applyQualityGate(oldContent, arr?.originalKey || '');
          healedContent = healOverlappingAndBrokenChords(healedContent);
          healedContent = correctGrammarAndSpelling(healedContent);

          const contentChanged = healedContent !== oldContent;

          let key = arr?.originalKey || '';
          const detectedKey = detectOriginalKey(healedContent, key);
          let keyChanged = false;
          if (detectedKey && key !== detectedKey) {
            key = detectedKey;
            keyChanged = true;
          }

          const diff = estimateDifficulty(healedContent);
          const diffChanged = arr?.difficulty !== diff;

          if (titleChanged || contentChanged || keyChanged || diffChanged) {
            totalHealed++;
            bulkUpdates.push({
              updateOne: {
                filter: { _id: s._id },
                update: {
                  $set: {
                    title: cleanTitle || s.title,
                    'arrangements.0.content': healedContent,
                    'arrangements.0.originalKey': key,
                    'arrangements.0.difficulty': diff
                  }
                }
              }
            });
            // Update cache with new clean fingerprint
            const newFingerprint = fastHash(`${cleanTitle || s.title}|${healedContent}|${key}|${diff}`);
            cleanCache.set(s._id.toString(), newFingerprint);
          } else {
            // Already clean -> remember fingerprint
            cleanCache.set(s._id.toString(), currentFingerprint);
          }
        }

        if (bulkUpdates.length > 0) {
          await Song.bulkWrite(bulkUpdates, { ordered: false });
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      if (totalHealed > 0) {
        console.log(`${color}💾 [${name}] Healed ${totalHealed} songs in ${elapsed}s (Skipped fast: ${skippedFast}/${totalProcessed})\x1b[0m`);
      } else {
        console.log(`${color}⚡ [${name}] Sweep verified in ${elapsed}s (100% clean: ${totalProcessed} songs)\x1b[0m`);
      }
    } catch (err) {
      console.error(`❌ [${name} Error]:`, err.message);
    }
    await delay(SLEEP_MS);
  }
}
