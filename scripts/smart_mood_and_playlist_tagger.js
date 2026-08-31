import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';

const SLEEP_MS = 12000;
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const MOOD_KEYWORDS = {
  'balada': ['ljubav', 'suza', 'suze', 'tuga', 'tugo', 'srce', 'noc', 'noć', 'dusa', 'duša', 'sjecanje', 'sjećanje', 'volim', 'ostani', 'sama', 'sam'],
  'kafanska': ['kafana', 'kafani', 'vino', 'vina', 'casa', 'čaša', 'case', 'čaše', 'tamburasi', 'tamburaši', 'zora', 'zore', 'drustvo', 'društvo', 'jaran', 'jarani', 'merak', 'krcma', 'krčma'],
  'akusticna': ['akustik', 'gitara', 'akusticna', 'tiho', 'nocas', 'noćas', 'polako'],
  'rok_klasik': ['rock', 'rok', 'gitara', 'ulica', 'grad', 'bunt', 'motor', 'vatra', 'put'],
  'sevdalinka': ['sevdah', 'sevdalinka', 'aman', 'dragi', 'draga', 'seka', 'biser', 'carsija', 'čaršija', 'sabah', 'avlija', 'ceif', 'ćejf'],
  'brza_ritmicna': ['ritam', 'ples', 'igraj', 'zurka', 'žurka', 'klub', 'nocas', 'ludilo', 'dj'],
  'tuzna': ['bol', 'boli', 'placi', 'plači', 'zaboravi', 'kraj', 'rastanak', 'tuzna', 'tužna', 'samoca', 'samoća'],
  'svadba_veselje': ['svadba', 'veselje', 'kume', 'kuma', 'svatovi', 'mlada', 'mladozenja', 'mladoženja', 'pjesma', 'kolo', 'harmonika']
};

const SEVDAH_ARTISTS = new Set([
  'safet isovic', 'safet isović', 'hanka paldum', 'himzo polovina', 'z苦im nikšić', 'zhim niksic',
  'amira medunjanin', 'divanhana', 'mostar sevdah reunion', 'bozo vreco', 'božo vrećo', 'silvana armenulic', 'silvana armenulić'
]);

const ROCK_ARTISTS = new Set([
  'bijelo dugme', 'azra', 'riblja corba', 'riblja čorba', 'parni valjak', 'prljavo kazaliste', 'prljavo kazalište',
  'divlje jagode', 'smak', 'ekv', 'ekatarina velika', 'zabranjeno pusenje', 'zabranjeno pušenje', 'atomsko skloniste',
  'kerber', 'galija', 'generacija 5', 'osvajači', 'osvajaci', 'yu grupa', 'van gogh', 'partibrejkers'
]);

async function runMoodTaggerCycle() {
  const BATCH = 300;
  const totalCount = await Song.countDocuments({ deletedAt: null });
  let taggedCount = 0;

  for (let skip = 0; skip < totalCount; skip += BATCH) {
    const songs = await Song.find({ deletedAt: null })
      .select('_id title tags arrangements.content artist')
      .skip(skip)
      .limit(BATCH)
      .populate('artist', 'name')
      .lean();

    if (!songs || songs.length === 0) break;
    const bulkUpdates = [];

    for (const s of songs) {
      const artistName = (s.artist?.name || '').toLowerCase().trim();
      const content = (s.arrangements?.[0]?.content || '').toLowerCase();
      const currentTags = new Set((s.tags || []).map(t => t.toLowerCase().trim()));
      const initialSize = currentTags.size;

      // 1. Artist-level mood rules
      if (SEVDAH_ARTISTS.has(artistName)) {
        currentTags.add('sevdalinka');
        currentTags.add('akusticna');
      }
      if (ROCK_ARTISTS.has(artistName)) {
        currentTags.add('rok_klasik');
      }

      // 2. Lyrics Keyword Analysis
      for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
        let matches = 0;
        for (const kw of keywords) {
          if (content.includes(` ${kw} `) || content.includes(` ${kw},`) || content.includes(` ${kw}.`)) {
            matches++;
          }
        }
        if (matches >= 2) {
          currentTags.add(mood);
        }
      }

      if (currentTags.size > initialSize) {
        taggedCount++;
        bulkUpdates.push({
          updateOne: {
            filter: { _id: s._id },
            update: { $set: { tags: Array.from(currentTags) } }
          }
        });
      }
    }

    if (bulkUpdates.length > 0) {
      await Song.bulkWrite(bulkUpdates, { ordered: false });
    }
  }

  if (taggedCount > 0) {
    console.log(`🏷️ [Smart Mood Tagger] Updated tags on ${taggedCount} songs.`);
  }
}

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`🚀 [Smart Mood Tagger] Online on Atlas.`);
  while (true) {
    try {
      await runMoodTaggerCycle();
    } catch (err) {
      console.error('[Smart Mood Tagger Error]', err.message);
    }
    await delay(SLEEP_MS);
  }
}

start();
