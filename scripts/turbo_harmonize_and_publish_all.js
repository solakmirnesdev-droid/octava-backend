import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
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
import { snapChordsToVowelNucleus, HARMONIC_KEYS_MAP } from '../src/utils/balkan_harmony_engine.js';
import { toLatin } from '../src/utils/latinise.js';

function harmonizeLyricsLines(lines, key = 'Am') {
  const k = HARMONIC_KEYS_MAP[key] || HARMONIC_KEYS_MAP['Am'];
  const versePattern = [k.tonic, k.subdominant, k.subtonic || k.dominant, k.relativeMajor || k.tonic];
  const chorusPattern = [k.tonic, k.subdominant, k.subtonic || k.dominant, k.relativeMajor, k.subdominant, k.tonic, k.dominant, k.tonic];

  let chordIndex = 0;
  let inChorus = false;

  const result = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    if (/^\[Refren\]/i.test(trimmed) || /^\[Chorus\]/i.test(trimmed)) {
      inChorus = true;
      chordIndex = 0;
      result.push('[Refren]:');
      continue;
    }
    if (/^\[Strofa/i.test(trimmed) || /^\[Verse/i.test(trimmed)) {
      inChorus = false;
      chordIndex = 0;
      result.push(trimmed);
      continue;
    }
    if (/^\[/i.test(trimmed)) {
      result.push(trimmed);
      continue;
    }

    // Already has chords?
    if (/\[[A-H][b#]?[^\]]*\]/.test(trimmed)) {
      result.push(snapChordsToVowelNucleus(trimmed));
      continue;
    }

    const pattern = inChorus ? chorusPattern : versePattern;
    const words = trimmed.split(/\s+/);
    if (words.length === 0 || !trimmed) {
      result.push(trimmed);
      continue;
    }

    // Place chord on 1st and middle word
    const chord1 = pattern[chordIndex % pattern.length];
    chordIndex++;

    if (words.length <= 3) {
      result.push(`[${chord1}]${trimmed}`);
    } else {
      const mid = Math.floor(words.length / 2);
      const chord2 = pattern[chordIndex % pattern.length];
      chordIndex++;

      const p1 = words.slice(0, mid).join(' ');
      const p2 = words.slice(mid).join(' ');
      result.push(`[${chord1}]${p1} [${chord2}]${p2}`);
    }
  }

  return result.join('\n');
}

export async function turboHarmonizeAndPublish() {
  console.log('======================================================================');
  console.log('⚡  OCTAVA TURBO HARMONIZER & INSTANT PUBLISHER (100% ACCELERATOR)');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Connected to MongoDB Atlas Cloud.\n');

  // Pre-load artist map in memory
  const allArtists = await Artist.collection.find({ deletedAt: null }, { projection: { _id: 1, name: 1 } }).toArray();
  const artistMap = new Map();
  allArtists.forEach(a => artistMap.set(a._id.toString(), a.name));

  const drafts = await Song.find({ deletedAt: null, status: 'draft' }).lean();

  console.log(`🚀 Pronađeno ${drafts.length} draft pjesama za instant turbo objavu!\n`);

  const bulkOps = [];
  let count = 0;

  for (const song of drafts) {
    count++;
    const artistName = artistMap.get(song.artist?.toString()) || '';
    let cleanTitle = cleanOfficialTitle(song.title, artistName);
    cleanTitle = correctGrammarAndSpelling(cleanTitle);
    cleanTitle = restoreExYuDiacritics(cleanTitle);

    let rawContent = song.arrangements?.[0]?.content || '';
    if (!rawContent || rawContent.length < 50) {
      rawContent = `[Intro / Uvod]:\n[Am] [Dm] [G] [C] [F] [Dm] [E]\n\n[Strofa 1]:\n${cleanTitle}\n\n[Refren]:\n${cleanTitle}`;
    }

    // Detect Key (default Am or Dm)
    let key = song.arrangements?.[0]?.originalKey || 'Am';
    if (!HARMONIC_KEYS_MAP[key]) key = 'Am';

    const lines = rawContent.split('\n');
    let harmonized = harmonizeLyricsLines(lines, key);

    // Apply 9 Quality Gate layers
    harmonized = applyQualityGate(harmonized, key);
    harmonized = healOverlappingAndBrokenChords(harmonized);
    harmonized = correctGrammarAndSpelling(harmonized);
    harmonized = restoreExYuDiacritics(harmonized);

    const diff = estimateDifficulty(harmonized);

    const updatedArrangements = [
      {
        label: song.arrangements?.[0]?.label || 'Glavna verzija',
        content: harmonized,
        originalKey: key,
        difficulty: diff,
        isPrimary: true
      }
    ];

    bulkOps.push({
      updateOne: {
        filter: { _id: song._id },
        update: {
          $set: {
            title: cleanTitle,
            searchTitle: toLatin(cleanTitle).toLowerCase(),
            arrangements: updatedArrangements,
            status: 'published',
            updatedAt: new Date()
          }
        }
      }
    });
  }

  if (bulkOps.length > 0) {
    console.log(`✨ Writing ${bulkOps.length} turbo-harmonized songs in bulk to Atlas...`);
    const CHUNK = 200;
    for (let i = 0; i < bulkOps.length; i += CHUNK) {
      await Song.bulkWrite(bulkOps.slice(i, i + CHUNK), { ordered: false });
      process.stdout.write(`\r🚀 Published batch: ${Math.min(i + CHUNK, bulkOps.length)} / ${bulkOps.length}`);
    }
  }

  console.log('\n\n======================================================================');
  console.log('🎉 SVE DRAFT PJESME SU TURBO HARMONIZOVANE I OBJAVLJENE (100% PUBLISHED)!');
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

turboHarmonizeAndPublish().catch(err => {
  console.error('[Turbo Error]', err);
});
