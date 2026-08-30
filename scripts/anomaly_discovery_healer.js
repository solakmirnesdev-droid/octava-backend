import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import '../src/models/Artist.js';
import Artist from '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import {
  cleanArtistName,
  cleanOfficialTitle,
  applyQualityGate,
  countChordsInContent,
  isDummyContent,
  isTabLine
} from './song_quality_gate.js';

const SLEEP_MS = 2000;

async function runAnomalySweep() {
  const songs = await Song.find({ deletedAt: null }).populate('artist', 'name');
  let titleHealed = 0;
  let contentHealed = 0;
  let publishedAuto = 0;

  for (const song of songs) {
    const artistName = song.artist?.name || '';
    const oldTitle = song.title || '';

    // 1. Clean Title Anomalies
    let cleanT = cleanOfficialTitle(oldTitle, artistName);
    // Strip trailing years e.g. "Izbegavam 2011" -> "Izbegavam", "Putnicka 2011" -> "Putnička"
    cleanT = cleanT.replace(/\s+(?:19[5-9]\d|20[0-2]\d)\b/g, '').trim();
    // Strip trailing extensions .tab, .crd
    cleanT = cleanT.replace(/\.(?:tab|crd|txt|chords)\b/gi, '').trim();
    // Strip double punctuation
    cleanT = cleanT.replace(/[\?\.]{2,}$/, '?').replace(/[\!\.]{2,}$/, '!').replace(/[\,\:\-]+$/, '').trim();

    if (cleanT && cleanT !== oldTitle) {
      if (song.artist?._id) {
        const existing = await Song.findOne({
          artist: song.artist._id,
          title: cleanT,
          deletedAt: null,
          _id: { $ne: song._id }
        });
        if (existing) {
          const thisChords = countChordsInContent(song.arrangements?.[0]?.content || '');
          const existingChords = countChordsInContent(existing.arrangements?.[0]?.content || '');
          if (thisChords > existingChords) {
            existing.deletedAt = new Date();
            await existing.save();
            song.title = cleanT;
            await song.save();
          } else {
            song.deletedAt = new Date();
            await song.save();
          }
          titleHealed++;
          continue;
        }
      }
      try {
        song.title = cleanT;
        await song.save();
        titleHealed++;
      } catch (err) {
        // Duplicate slug gracefully handled
      }
    }

    // 2. Clean Content & Harmonic Anomalies
    const content = song.arrangements?.[0]?.content || '';
    if (content.length > 0 && !isDummyContent(content)) {
      const healedContent = applyQualityGate(content, song.arrangements[0].originalKey || '');
      if (healedContent !== content) {
        song.arrangements[0].content = healedContent;
        await song.save();
        contentHealed++;
      }

      // Auto-publish valid songs with real chords
      if (song.status !== 'published' && countChordsInContent(healedContent) >= 4 && healedContent.split('\n').length >= 4) {
        song.status = 'published';
        await song.save();
        publishedAuto++;
      }
    }
  }

  if (titleHealed > 0 || contentHealed > 0 || publishedAuto > 0) {
    console.log(`[AnomalyHealer] Cycle Summary: Titles Healed: ${titleHealed} | Lyrics Healed: ${contentHealed} | Auto-Published: ${publishedAuto}`);
  }
}

async function startDaemon() {
  console.log('======================================================================');
  console.log('🔍 [AnomalyHealer] Autonomous Self-Improving Error Hunter Online');
  console.log('======================================================================\n');
  await mongoose.connect(process.env.MONGODB_URI);

  while (true) {
    try {
      await runAnomalySweep();
    } catch (err) {
      console.error('[AnomalyHealer Error]', err.message);
    }
    await new Promise(r => setTimeout(r, SLEEP_MS));
  }
}

startDaemon().catch(console.error);
