/**
 * Clears the synthetic filler and rebuilds a demo catalogue.
 *
 * Real performer names and real song titles, because those are facts. Lorem
 * ipsum where the lyrics would be, and chord progressions generated from the
 * title rather than transcribed from a recording — see catalogue.js for why.
 *
 * Anything a person made is preserved: the public-domain songs stay, and so do
 * ratings, reviews and reports that point at songs which survive.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';
import Staff from '../../src/models/Staff.js';
import Rating from '../../src/models/Rating.js';
import Review from '../../src/models/Review.js';
import ReviewComment from '../../src/models/ReviewComment.js';
import SongReport from '../../src/models/SongReport.js';
import { CATALOGUE } from './catalogue.js';
import { CATALOGUE_2 } from './catalogue2.js';

/**
 * Merged by concatenating title lists, not by object spread: an artist who
 * appears in both waves would otherwise lose the first wave's songs entirely.
 */
const ALL = {};
for (const source of [CATALOGUE, CATALOGUE_2]) {
  for (const [artist, titles] of Object.entries(source)) {
    ALL[artist] = [...new Set([...(ALL[artist] || []), ...titles])];
  }
}

const LOREM = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '
  + 'incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud '
  + 'exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure '
  + 'in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint '
  + 'occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'
).split(' ');

/** Common progressions, so the demo shows variety without pretending to be a transcription. */
const PROGRESSIONS = [
  { key: 'Am', chords: ['Am', 'F', 'C', 'G'] },
  { key: 'Am', chords: ['Am', 'Dm', 'E', 'Am'] },
  { key: 'C',  chords: ['C', 'G', 'Am', 'F'] },
  { key: 'G',  chords: ['G', 'D', 'Em', 'C'] },
  { key: 'D',  chords: ['D', 'A', 'Hm', 'G'] },
  { key: 'Em', chords: ['Em', 'C', 'G', 'D'] },
  { key: 'Dm', chords: ['Dm', 'Gm', 'A', 'Dm'] },
  { key: 'E',  chords: ['E', 'H', 'C#m', 'A'] },
  { key: 'A',  chords: ['A', 'E', 'F#m', 'D'] },
  { key: 'Hm', chords: ['Hm', 'G', 'D', 'A'] }
];

/** Stable per title, so re-running produces the same catalogue. */
function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function buildContent(title) {
  const seed = hash(title);
  const prog = PROGRESSIONS[seed % PROGRESSIONS.length];
  let word = seed % LOREM.length;
  const nextWord = () => LOREM[word++ % LOREM.length];

  const line = (chordCount) => {
    const parts = [];
    for (let c = 0; c < chordCount; c++) {
      const chord = prog.chords[(seed + c + parts.length) % prog.chords.length];
      const words = [nextWord(), nextWord()].join(' ');
      parts.push(`[${chord}]${words}`);
    }
    return parts.join(' ');
  };

  const verse = () => [line(2), line(2), line(2), line(1)].join('\n');

  return [
    '[Uvod]',
    prog.chords.map((c) => `[${c}]`).join('  '),
    '',
    '[Strofa 1]', verse(), '',
    '[Refren]', verse(), '',
    '[Strofa 2]', verse(), '',
    '[Refren]', verse(), '',
    '[Kraj]',
    prog.chords.map((c) => `[${c}]`).join('  ')
  ].join('\n');
}

const DIFFICULTY = ['easy', 'medium', 'hard'];

await mongoose.connect(process.env.MONGODB_URI);

const editor = await Staff.findOne({ role: 'superadmin' }) || await Staff.findOne();
if (!editor) { console.error('  Nema naloga osoblja.'); process.exit(1); }

/* ------------------------------------------------------------- clearing */

const doomed = await Song.find({ tags: 'dummy' }).select('_id');
const ids = doomed.map((s) => s._id);

const removed = {
  songs: (await Song.deleteMany({ _id: { $in: ids } })).deletedCount,
  ratings: (await Rating.deleteMany({ song: { $in: ids } })).deletedCount,
  reviews: (await Review.deleteMany({ song: { $in: ids } })).deletedCount,
  comments: (await ReviewComment.deleteMany({ song: { $in: ids } })).deletedCount,
  reports: (await SongReport.deleteMany({ song: { $in: ids } })).deletedCount
};

// Placeholder performers invented for testing, unlike the real names.
const testArtists = await Artist.deleteMany({ name: { $in: ['Testni Izvodjac', 'Test pjevac', 'Neko'] } });

console.log(`  obrisano: ${removed.songs} pjesama, ${removed.ratings} ocjena, `
  + `${removed.reviews} recenzija, ${removed.comments} komentara, ${removed.reports} prijava, `
  + `${testArtists.deletedCount} testnih izvodjaca`);

/* ------------------------------------------------------------- building */

const genresBySlug = Object.fromEntries((await Genre.find()).map((g) => [g.slug, g._id]));
const pickGenres = (artist) => {
  const rock = ['Bijelo Dugme', 'Azra', 'Riblja Čorba', 'Ekatarina Velika', 'Idoli', 'Električni Orgazam',
    'Parni Valjak', 'Prljavo Kazalište', 'Divlje Jagode', 'Atomsko Sklonište', 'YU Grupa', 'Galija',
    'Leb i Sol', 'Van Gogh', 'Partibrejkers', 'Zabranjeno Pušenje', 'Plavi Orkestar',
    'Indexi', 'Bombaj Štampa', 'Regina', 'Vatreni Poljubac', 'Haustor', 'Film', 'Aerodrom',
    'Smak', 'Piloti', 'Kerber', 'Osvajači', 'Boa', 'Dorian Gray', 'Letu Štuke',
    'Dubioza Kolektiv', 'Zoster', 'Sikter', 'Josipa Lisac', 'Mladen Vojičić Tifa'];
  const folk = ['Lepa Brena', 'Šaban Šaulić', 'Toma Zdravković', 'Mile Kitić', 'Svetlana Ražnatović',
    'Seka Aleksić', 'Aca Lukas', 'Šerif Konjević', 'Šemsa Suljaković', 'Milica Pavlović',
    'Dragana Mirković', 'Sinan Sakić', 'Vesna Zmijanac', 'Zorica Brunclik', 'Snežana Đurišić',
    'Merima Njegomir', 'Predrag Gojković Cune', 'Halid Muslimović', 'Enes Begović',
    'Đorđe Marjanović', 'Miki Jevremović'];
  const sevdah = ['Safet Isović', 'Zaim Imamović', 'Hanka Paldum', 'Kemal Monteno',
    'Nedžad Salković', 'Himzo Polovina', 'Nada Mamula', 'Beba Selimović', 'Meho Puzić'];

  // Dalmatian singers belong with the coastal repertoire, not with generic pop.
  const primorje = ['Oliver Dragojević', 'Mišo Kovač', 'Arsen Dedić', 'Ibrica Jusić',
    'Tereza Kesovija', 'Klapa Cambi', 'Vinko Coce', 'Gibonni', 'Đani Stipaničev'];
  if (primorje.includes(artist)) return ['starogradska', 'domaca'];

  if (sevdah.includes(artist)) return ['sevdalinka', 'domaca'];
  if (rock.includes(artist)) return ['rock', 'ex-yu'];
  if (folk.includes(artist)) return ['narodna', 'domaca'];
  return ['pop', 'domaca'];
};

let created = 0;
let skipped = 0;

for (const [artistName, titles] of Object.entries(ALL)) {
  const artist = await Artist.findOrCreateByName(artistName);
  const genres = pickGenres(artistName).map((s) => genresBySlug[s]).filter(Boolean);

  for (const title of titles) {
    // Never overwrite a public-domain song that already carries a real text.
    if (await Song.findOne({ title, artist: artist._id })) { skipped++; continue; }

    const seed = hash(title + artistName);
    const prog = PROGRESSIONS[seed % PROGRESSIONS.length];

    await Song.create({
      title,
      artist: artist._id,
      genres,
      // Greppable: everything here has placeholder words, not real lyrics.
      tags: ['demo'],
      status: 'published',
      views: seed % 4000,
      createdBy: editor._id,
      updatedBy: editor._id,
      arrangements: [{
        label: 'Osnovna verzija',
        content: buildContent(title + artistName),
        originalKey: prog.key,
        capo: seed % 5 === 0 ? (seed % 4) + 1 : 0,
        difficulty: DIFFICULTY[seed % DIFFICULTY.length],
        isPrimary: true
      }]
    });
    created++;
  }
}

for (const a of await Artist.find()) {
  await Artist.updateOne({ _id: a._id }, { songCount: await Song.countDocuments({ artist: a._id }) });
}
for (const g of await Genre.find()) {
  await Genre.updateOne({ _id: g._id }, { songCount: await Song.countDocuments({ genres: g._id }) });
}

console.log(`  napravljeno: ${created}  preskoceno (vec postoji): ${skipped}`);
await mongoose.disconnect();
