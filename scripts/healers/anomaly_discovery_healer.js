import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import '../../src/models/Artist.js';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import {
  cleanArtistName,
  cleanOfficialTitle,
  applyQualityGate,
  countChordsInContent,
  isDummyContent,
  healOverlappingAndBrokenChords,
  restoreExYuDiacritics,
  correctGrammarAndSpelling,
  detectOriginalKey,
  estimateDifficulty
} from './song_quality_gate.js';
import { toLatin } from '../../src/utils/latinise.js';

const SLEEP_MS = 4000;

async function runAnomalySweep() {
  const songs = await Song.find({ deletedAt: null }).populate('artist', 'name');
  let titleHealed = 0;
  let contentHealed = 0;
  let publishedAuto = 0;
  let overlapHealed = 0;
  let homoglyphsFixed = 0;
  let ghostSectionsPurged = 0;

  for (const song of songs) {
    const artistName = song.artist?.name || '';
    const oldTitle = song.title || '';

    // 1. Radar for Title Anomalies & Inverted Artist - Title
    let cleanT = cleanOfficialTitle(oldTitle, artistName);
    cleanT = restoreExYuDiacritics(cleanT);
    cleanT = cleanT.replace(/\s+(?:19[5-9]\d|20[0-2]\d)\b/g, '').trim();
    cleanT = cleanT.replace(/\.(?:tab|crd|txt|chords)\b/gi, '').trim();
    cleanT = cleanT.replace(/[\?\.]{2,}$/, '?').replace(/[\!\.]{2,}$/, '!').replace(/[\,\:\-]+$/, '').trim();

    if (cleanT && cleanT !== oldTitle) {
      try {
        song.title = cleanT;
        await song.save();
        titleHealed++;
      } catch (err) {
        // Handled duplicate slug
      }
    }

    // 2. Radar for Chord Overlaps, Geometry & Homoglyphs
    const arr = song.arrangements?.[0];
    let content = arr?.content || '';

    if (content.length > 0 && !isDummyContent(content)) {
      const oldLen = content.length;
      
      // Homoglyph & Cyrillic Hunter in Latin text
      if (/[а-яА-ЯёЁ]/.test(content)) {
        content = toLatin(content);
        homoglyphsFixed++;
      }

      // Anti-Overlap Radar
      const beforeOverlap = content;
      content = healOverlappingAndBrokenChords(content);
      if (content !== beforeOverlap) {
        overlapHealed++;
      }

      // Ghost Section Purger
      const lines = content.split('\n');
      const filteredLines = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^\[(Strofa|Refren|Intro|Uvod|Solo|Outro|Prelaz)[\s0-9\/\:]*\]:?$/i.test(line)) {
          const next = (lines[i + 1] || '').trim();
          if (!next || /^\[(Strofa|Refren|Intro|Uvod|Solo|Outro|Prelaz)[\s0-9\/\:]*\]:?$/i.test(next)) {
            ghostSectionsPurged++;
            continue; // Purge ghost header
          }
        }
        filteredLines.push(lines[i]);
      }
      content = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

      // Deep Quality Gate pass
      const healedContent = applyQualityGate(content, arr?.originalKey || '');
      
      if (healedContent !== arr?.content) {
        arr.content = healedContent;
        if (!arr.originalKey) {
          arr.originalKey = detectOriginalKey(healedContent);
        }
        arr.difficulty = estimateDifficulty(healedContent);
        await song.save();
        contentHealed++;
      }

      // Auto-publish verified songs with full lyrics & real chords
      if (song.status !== 'published' && countChordsInContent(healedContent) >= 4 && healedContent.split('\n').length >= 6) {
        song.status = 'published';
        await song.save();
        publishedAuto++;
      }
    }
  }

  if (titleHealed > 0 || contentHealed > 0 || publishedAuto > 0 || overlapHealed > 0 || homoglyphsFixed > 0) {
    console.log(`🔍 [AnomalyHunter-2.0] Cycle: Titles: ${titleHealed} | Lyrics: ${contentHealed} | Overlaps: ${overlapHealed} | Homoglyphs: ${homoglyphsFixed} | Auto-Pub: ${publishedAuto}`);
  }
}

async function startDaemon() {
  console.log('======================================================================');
  console.log('💎 [AnomalyHunter-2.0] Multi-Radar Autonomous Precision Engine Online');
  console.log('======================================================================\n');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/octava');

  while (true) {
    try {
      await runAnomalySweep();
    } catch (err) {
      console.error('[AnomalyHunter Error]', err.message);
    }
    await new Promise(r => setTimeout(r, SLEEP_MS));
  }
}

startDaemon().catch(console.error);
