import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Artist from '../src/models/Artist.js';
import Song from '../src/models/Song.js';

async function deepArtistAudit() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('=== COMPREHENSIVE GLOBAL ARTIST AUDIT ===\n');

  const allArtists = await Artist.find({ deletedAt: null }).sort({ songCount: 1 });
  console.log(`Total active artists: ${allArtists.length}`);

  const singleSongArtists = allArtists.filter(a => (a.songCount || 0) <= 1);
  console.log(`Artists with <= 1 song: ${singleSongArtists.length}`);

  // 1. Check for garbage / placeholder / dummy artist names
  const junkRegex = /^(?:test|demo|nepoznat|unknown|izvodjac|izvođač|razni|various|admin|null|undefined|xxx|123|abc|asdf|chord|akordi|pesmarica|tacnaharmonija|tabovi|[0-9]{1,4})$/i;
  const junkArtists = allArtists.filter(a => junkRegex.test(a.name.trim()));
  console.log(`\n1. Junk/Placeholder Artists (${junkArtists.length}):`);
  junkArtists.forEach(a => console.log(`  - "${a.name}" (ID: ${a._id}, songs: ${a.songCount})`));

  // 2. Inverted Artists Check
  const famousArtists = [
    'Miligram', 'Dino Merlin', 'Oliver Dragojević', 'Bijelo Dugme', 'Halid Bešlić',
    'Zdravko Čolić', 'Toma Zdravković', 'Šaban Šaulić', 'Ceca', 'Aca Lukas',
    'Aco Pejović', 'Crvena Jabuka', 'Parni Valjak', 'Prljavo Kazalište', 'Gibonni',
    'Severina', 'Magazin', 'Riblja Čorba', 'Bajaga', 'Plavi Orkestar', 'Haris Džinović',
    'Šerif Konjević', 'Hanka Paldum', 'Enes Begović', 'Safet Isović', 'Kemal Monteno',
    'Toše Proeski', 'Vlatko Stefanovski', 'Indexi', 'Zabranjeno Pušenje', 'Divlje Jagode',
    'Lepa Brena', 'Miroslav Ilić', 'Sinan Sakić', 'Džej Ramadanovski', 'Željko Joksimović',
    'Željko Samardžić', 'Darko Lazić', 'Saša Matić', 'Dejan Matić', 'Al Dino', "Al'Dino"
  ];

  const invertedFound = [];
  for (const a of singleSongArtists) {
    const song = await Song.findOne({ artist: a._id, deletedAt: null });
    if (song) {
      const sTitleClean = song.title.toLowerCase().trim();
      const matchedFamous = famousArtists.find(f => {
        const fLow = f.toLowerCase();
        return sTitleClean === fLow || sTitleClean.startsWith(fLow);
      });

      if (matchedFamous) {
        invertedFound.push({ artistDoc: a, songDoc: song, realArtist: matchedFamous, realTitle: a.name });
      }
    }
  }

  console.log(`\n2. Inverted Song/Artist Pairs Found (${invertedFound.length}):`);
  invertedFound.forEach(inv => {
    console.log(`  - Inverted: Artist="${inv.artistDoc.name}" | Song="${inv.songDoc.title}" => SHOULD BE: Artist="${inv.realArtist}" | Song="${inv.realTitle}"`);
  });

  // 3. Foreign / Western Artists Check
  const knownForeign = [
    '3 Doors Down', '4 Non Blondes', 'AC/DC', 'Adele', 'Aerosmith', 'Alanis Morissette',
    'Avril Lavigne', 'Backstreet Boys', 'Beatles', 'The Beatles', 'Billie Eilish',
    'Bob Dylan', 'Bob Marley', 'Bon Jovi', 'Bryan Adams', 'Coldplay', 'Cranberries',
    'The Cranberries', 'Deep Purple', 'Dire Straits', 'Doors', 'The Doors', 'Dua Lipa',
    'Ed Sheeran', 'Elton John', 'Elvis Presley', 'Eminem', 'Eric Clapton', 'Evanescence',
    'Fleetwood Mac', 'Foo Fighters', 'Green Day', 'Guns N Roses', "Guns N' Roses",
    'Iron Maiden', 'James Blunt', 'John Lennon', 'Judas Priest', 'Lady Gaga', 'Led Zeppelin',
    'Linkin Park', 'Madonna', 'Metallica', 'Michael Jackson', 'Muse', 'Nirvana', 'Oasis',
    'OneRepublic', 'Ozzy Osbourne', 'Panic At The Disco', 'Pearl Jam', 'Pink Floyd',
    'Queen', 'Radiohead', 'Rammstein', 'Red Hot Chili Peppers', 'R.E.M.', 'Rihanna',
    'Rolling Stones', 'The Rolling Stones', 'Roxette', 'Scorpions', 'Simon and Garfunkel',
    'Simple Plan', 'Slipknot', 'Sting', 'System of a Down', 'Taylor Swift', 'The Police',
    'Toto', 'Tracy Chapman', 'Twenty One Pilots', 'U2', 'Wham', 'Whitney Houston',
    'Roxette', 'Europe', 'Avicii', 'Eros Ramazzotti', 'Toto Cutugno'
  ];

  const foreignInDb = allArtists.filter(a => knownForeign.some(f => a.name.toLowerCase() === f.toLowerCase()));
  console.log(`\n3. Foreign / Western Artists in DB (${foreignInDb.length}):`);
  foreignInDb.forEach(a => console.log(`  - "${a.name}" (${a.songCount} songs) [${a.country}] -> ${a.origin}`));

  // 4. Artists with 0 songs
  const zeroSongArtists = allArtists.filter(a => (a.songCount || 0) === 0);
  console.log(`\n4. Artists with 0 songs (${zeroSongArtists.length}):`);
  zeroSongArtists.slice(0, 20).forEach(a => console.log(`  - "${a.name}" (ID: ${a._id})`));

  await mongoose.disconnect();
}
deepArtistAudit().catch(console.error);
