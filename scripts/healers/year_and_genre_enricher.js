import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';
import { classifyGenresForArtist } from './song_quality_gate.js';

const SLEEP_MS = 10000;
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const ARTIST_DEFAULT_YEARS = {
  'bijelo dugme': 1979, 'azra': 1981, 'indexi': 1974, 'riblja corba': 1982, 'riblja čorba': 1982,
  'parni valjak': 1984, 'crvena jabuka': 1987, 'bajaga': 1985, 'plavi orkestar': 1986,
  'zabranjeno pusenje': 1984, 'zabranjeno pušenje': 1984, 'ekv': 1986, 'ekatarina velika': 1986,
  'prljavo kazaliste': 1985, 'prljavo kazalište': 1985, 'divlje jagode': 1983, 'smak': 1977,
  'dino merlin': 1993, 'halid beslic': 1990, 'halid bešlić': 1990, 'haris dzinovic': 1991, 'haris džinović': 1991,
  'oliver dragojevic': 1985, 'oliver dragojević': 1985, 'gibonni': 1999, 'zdravko colic': 1980, 'zdravko čolić': 1980,
  'kemal monteno': 1978, 'arsen dedic': 1975, 'arsen dedić': 1975, 'toma zdravkovic': 1981, 'toma zdravković': 1981,
  'saban saulic': 1984, 'šaban šaulić': 1984, 'sinan sakic': 1988, 'sinan sakić': 1988, 'miroslav ilic': 1983, 'miroslav ilić': 1983,
  'toše proeski': 2004, 'tose proeski': 2004, 'zeljko joksimovic': 2004, 'željko joksimović': 2004,
  'sasa matic': 2003, 'saša matić': 2003, 'aca lukas': 1999, 'ceca': 1996, 'lepa brena': 1985,
  'severina': 2002, 'jelena rozga': 2011, 'petar graso': 2000, 'petar grašo': 2000,
  'voyage': 2021, 'nucci': 2021, 'breskvica': 2022, 'senidah': 2019, 'rasta': 2017, 'jala brat': 2018, 'buba corelli': 2018
};

async function runEnricherCycle() {
  const genresInDb = await Genre.find({}).lean();
  const genreMap = {};
  for (const g of genresInDb) {
    genreMap[g.name.toLowerCase()] = g._id;
  }

  const BATCH = 300;
  const totalCount = await Song.countDocuments({ deletedAt: null });
  let yearsAdded = 0;
  let genresAssigned = 0;

  for (let skip = 0; skip < totalCount; skip += BATCH) {
    const songs = await Song.find({ deletedAt: null })
      .select('_id title year genres artist')
      .skip(skip)
      .limit(BATCH)
      .populate('artist', 'name')
      .lean();

    if (!songs || songs.length === 0) break;
    const bulkUpdates = [];

    for (const s of songs) {
      const artistName = (s.artist?.name || '').toLowerCase().trim();
      const updateDoc = {};
      let needsUpdate = false;

      // 1. Assign Year if missing
      if (!s.year || s.year < 1930 || s.year > 2026) {
        let assignedYear = null;
        for (const [key, yr] of Object.entries(ARTIST_DEFAULT_YEARS)) {
          if (artistName.includes(key)) {
            assignedYear = yr;
            break;
          }
        }
        if (!assignedYear) assignedYear = 2000;
        updateDoc.year = assignedYear;
        needsUpdate = true;
        yearsAdded++;
      }

      // 2. Assign Genres if missing
      if (!s.genres || s.genres.length === 0) {
        const genreNames = classifyGenresForArtist(s.artist?.name || '', s.title);
        const genreIds = [];
        for (const gn of genreNames) {
          const lower = gn.toLowerCase();
          for (const [dbName, dbId] of Object.entries(genreMap)) {
            if (lower.includes(dbName) || dbName.includes(lower)) {
              genreIds.push(dbId);
              break;
            }
          }
        }
        if (genreIds.length > 0) {
          updateDoc.genres = genreIds;
          needsUpdate = true;
          genresAssigned++;
        }
      }

      if (needsUpdate) {
        bulkUpdates.push({
          updateOne: {
            filter: { _id: s._id },
            update: { $set: updateDoc }
          }
        });
      }
    }

    if (bulkUpdates.length > 0) {
      await Song.bulkWrite(bulkUpdates, { ordered: false });
    }
  }

  if (yearsAdded > 0 || genresAssigned > 0) {
    console.log(`📅 [Year & Genre Enricher] Cycle finished (Years: ${yearsAdded}, Genres: ${genresAssigned}).`);
  }
}

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`🚀 [Year & Genre Enricher] Online on Atlas.`);
  while (true) {
    try {
      await runEnricherCycle();
    } catch (err) {
      console.error('[Year & Genre Enricher Error]', err.message);
    }
    await delay(SLEEP_MS);
  }
}

start();
