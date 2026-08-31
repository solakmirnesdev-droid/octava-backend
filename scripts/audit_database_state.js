import mongoose from 'mongoose';
import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import Genre from '../src/models/Genre.js';
import { isDummyContent } from './song_quality_gate.js';

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/octava');

const totalSongs = await Song.countDocuments({ deletedAt: null });
const totalArtists = await Artist.countDocuments({ deletedAt: null });
const totalGenres = await Genre.countDocuments({ deletedAt: null });

const published = await Song.countDocuments({ deletedAt: null, status: 'published' });
const drafts = await Song.countDocuments({ deletedAt: null, status: 'draft' });

const allSongs = await Song.find({ deletedAt: null }).populate('artist').lean();

let withChords = 0;
let dummyCount = 0;
let missingKey = 0;
let withKey = 0;
let cyrillicFound = 0;
let flatChordsFound = 0;
let missingSections = 0;
let shortLyrics = 0;
let duplicateFingerprints = {};
let duplicatesFound = 0;

for (const s of allSongs) {
  const arr = s.arrangements?.[0];
  const content = arr?.content || '';
  const chords = arr?.chords || [];
  
  if (isDummyContent(content)) {
    dummyCount++;
  }
  
  if (chords.length > 0) {
    withChords++;
  }
  
  if (arr?.originalKey && arr.originalKey.trim()) {
    withKey++;
  } else {
    missingKey++;
  }
  
  if (/[а-яА-ЯёЁ]/.test(s.title) || /[а-яА-ЯёЁ]/.test(content)) {
    cyrillicFound++;
  }
  
  // Check for flat chords e.g. Bb, Eb, Ab, Db, Gb
  if (/\[[A-G]b[^\]]*\]/.test(content)) {
    flatChordsFound++;
  }
  
  // Check if has section headers like [Strofa, [Refren
  if (!/\[(Strofa|Refren|Intro|Uvod|Solo|Outro|Pred-refren)/i.test(content)) {
    missingSections++;
  }
  
  if (content.length < 120) {
    shortLyrics++;
  }
  
  // Deduplication key
  const artistName = (s.artist?.name || '').toLowerCase().trim();
  const titleKey = s.title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `${artistName}:::${titleKey}`;
  if (duplicateFingerprints[key]) {
    duplicatesFound++;
  } else {
    duplicateFingerprints[key] = true;
  }
}

const artistsWithoutImage = await Artist.countDocuments({
  deletedAt: null,
  $or: [{ image: null }, { image: '' }, { image: { $exists: false } }]
});

const artistsWithoutCountry = await Artist.countDocuments({
  deletedAt: null,
  $or: [{ country: null }, { country: '' }, { country: { $exists: false } }]
});

console.log('=====================================================');
console.log('📊 OCTAVA DATABASE AUDIT REPORT — LIVE VERIFICATION');
console.log('=====================================================');
console.log(`🎵 Ukupno pjesama u bazi:          ${totalSongs}`);
console.log(`   - Objavljeno (published):       ${published}`);
console.log(`   - U pripremi (draft):           ${drafts}`);
console.log(`   - Sa unesenim akordima:         ${withChords} (${((withChords/totalSongs)*100).toFixed(1)}%)`);
console.log(`   - Sa placeholder/dummy tekstom: ${dummyCount} (${((dummyCount/totalSongs)*100).toFixed(1)}%)`);
console.log(`   - Sa unesenim originalKey:      ${withKey}`);
console.log(`   - Nedostaje originalKey:        ${missingKey}`);
console.log(`   - Sadrži snizilice (Bb, Eb...): ${flatChordsFound}`);
console.log(`   - Sadrži ćirilicu (treba Gaica):${cyrillicFound}`);
console.log(`   - Bez standardnih zaglavlja:    ${missingSections}`);
console.log(`   - Prekratak tekst (<120 karak): ${shortLyrics}`);
console.log(`   - Potencijalni duplikati:       ${duplicatesFound}`);
console.log('-----------------------------------------------------');
console.log(`🎤 Ukupno izvođača u bazi:        ${totalArtists}`);
console.log(`   - Nedostaje profilna slika:     ${artistsWithoutImage}`);
console.log(`   - Nedostaje država/porijeklo:   ${artistsWithoutCountry}`);
console.log(`🎼 Ukupno žanrova:                 ${totalGenres}`);
console.log('=====================================================');

await mongoose.disconnect();
