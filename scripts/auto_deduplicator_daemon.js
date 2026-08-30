import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import '../src/models/Artist.js';
import Artist from '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import { cleanArtistName, cleanOfficialTitle, normalizeTitleForDeduplication, countChordsInContent, isDummyContent } from './song_quality_gate.js';

const SLEEP_MS = 500;

async function runDeduplicationCycle() {
  // 1. Artist Dedup & Duet Disentanglement
  const artists = await Artist.find({ deletedAt: null });
  const artistBuckets = {};

  for (const a of artists) {
    const clean = cleanArtistName(a.name);
    const norm = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!artistBuckets[norm]) artistBuckets[norm] = [];
    artistBuckets[norm].push({ doc: a, cleanName: clean });
  }

  for (const [normKey, entries] of Object.entries(artistBuckets)) {
    if (entries.length > 1) {
      entries.sort((a, b) => {
        const aImg = a.doc.imageBytes ? 1 : 0;
        const bImg = b.doc.imageBytes ? 1 : 0;
        if (bImg !== aImg) return bImg - aImg;
        return (b.doc.songCount || 0) - (a.doc.songCount || 0);
      });

      const primary = entries[0];
      for (let i = 1; i < entries.length; i++) {
        const dup = entries[i];
        await Song.updateMany({ artist: dup.doc._id }, { $set: { artist: primary.doc._id } });
        await Artist.deleteOne({ _id: dup.doc._id });
      }
      await Artist.updateOne({ _id: primary.doc._id }, { $set: { name: primary.cleanName } });
    }
  }

  // 2. Song Dedup per Artist
  const allSongs = await Song.find({ deletedAt: null }).populate('artist', 'name');
  const byArtist = {};

  for (const s of allSongs) {
    const artistId = s.artist?._id?.toString() || 'unknown';
    if (!byArtist[artistId]) byArtist[artistId] = [];
    byArtist[artistId].push(s);
  }

  for (const [artistId, aSongs] of Object.entries(byArtist)) {
    const artistName = aSongs[0]?.artist?.name || 'Nepoznat';
    const songBuckets = {};

    for (const s of aSongs) {
      const cleanTitle = cleanOfficialTitle(s.title, artistName);
      const normKey = normalizeTitleForDeduplication(cleanTitle);

      if (!songBuckets[normKey]) songBuckets[normKey] = [];
      songBuckets[normKey].push({ song: s, cleanTitle });
    }

    for (const [normKey, entries] of Object.entries(songBuckets)) {
      if (entries.length > 1) {
        entries.sort((a, b) => {
          const aArr = a.song.arrangements?.[0];
          const bArr = b.song.arrangements?.[0];
          const aContent = aArr?.content || '';
          const bContent = bArr?.content || '';

          const aDummy = isDummyContent(aContent);
          const bDummy = isDummyContent(bContent);
          if (aDummy !== bDummy) return aDummy ? 1 : -1;

          const aChords = countChordsInContent(aContent);
          const bChords = countChordsInContent(bContent);
          if ((aChords > 0) !== (bChords > 0)) return bChords > 0 ? 1 : -1;

          return bContent.length - aContent.length;
        });

        const primary = entries[0];
        if (primary.song.title !== primary.cleanTitle) {
          await Song.updateOne({ _id: primary.song._id }, { $set: { title: primary.cleanTitle } });
        }

        for (let i = 1; i < entries.length; i++) {
          const dup = entries[i];
          await Song.updateOne({ _id: dup.song._id }, { $set: { deletedAt: new Date() } });
        }
      }
    }

    if (artistId !== 'unknown') {
      const activeCount = await Song.countDocuments({ artist: artistId, deletedAt: null });
      await Artist.updateOne({ _id: artistId }, { $set: { songCount: activeCount } });
    }
  }
}

async function startDaemon() {
  console.log('[Auto-Deduplicator Daemon] Online & Monitoring catalog...');
  await mongoose.connect(process.env.MONGODB_URI);

  while (true) {
    try {
      await runDeduplicationCycle();
    } catch (err) {
      console.error('[Auto-Deduplicator Error]', err.message);
    }
    await new Promise(r => setTimeout(r, SLEEP_MS));
  }
}

startDaemon().catch(console.error);
