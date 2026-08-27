/**
 * Rebuilds the demo catalogue from the MusicBrainz titles.
 *
 * Replaces titles written from memory — which put "Kafana na Balkanu" under the
 * wrong performer, among others — with ones pulled from an open database and
 * filtered to this region.
 *
 * Names and titles are facts and are used as they are. The words under the
 * chords stay lorem ipsum and the progressions stay generated: neither the
 * lyrics nor a real transcription of any song is ours to publish.
 *
 * Public-domain songs are left alone; they carry real texts and real chords.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import { foldTitle } from '../../src/utils/foldTitle.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';
import Staff from '../../src/models/Staff.js';

const LOREM = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '
  + 'incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud '
  + 'exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure '
  + 'in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint '
  + 'occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'
).split(' ');

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
const DIFFICULTY = ['easy', 'medium', 'hard'];

/** Stable per song, so a re-run produces the identical catalogue. */
function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function buildContent(seedText) {
  const seed = hash(seedText);
  const prog = PROGRESSIONS[seed % PROGRESSIONS.length];
  let w = seed % LOREM.length;
  const next = () => LOREM[w++ % LOREM.length];

  const line = (n) => {
    const parts = [];
    for (let c = 0; c < n; c++) {
      const chord = prog.chords[(seed + c + parts.length) % prog.chords.length];
      parts.push(`[${chord}]${next()} ${next()}`);
    }
    return parts.join(' ');
  };
  const verse = () => [line(2), line(2), line(2), line(1)].join('\n');
  const bar = prog.chords.map((c) => `[${c}]`).join('  ');

  return ['[Uvod]', bar, '', '[Strofa 1]', verse(), '', '[Refren]', verse(), '',
    '[Strofa 2]', verse(), '', '[Refren]', verse(), '', '[Kraj]', bar].join('\n');
}

const ROCK = new Set(['Bijelo Dugme','Azra','Riblja Čorba','Ekatarina Velika','Idoli','Električni Orgazam',
  'Parni Valjak','Prljavo Kazalište','Divlje Jagode','Atomsko Sklonište','YU Grupa','Galija','Leb i Sol',
  'Van Gogh','Partibrejkers','Zabranjeno Pušenje','Plavi Orkestar','Indexi','Bombaj Štampa','Regina',
  'Vatreni Poljubac','Haustor','Film','Aerodrom','Smak','Piloti','Kerber','Osvajači','Boa','Dorian Gray',
  'Letu Štuke','Dubioza Kolektiv','Zoster','Sikter','Josipa Lisac','Mladen Vojičić Tifa',
  'Let 3','Psihomodo Pop','Alen Islamović','Rambo Amadeus']);

const FOLK = new Set(['Lepa Brena','Šaban Šaulić','Toma Zdravković','Mile Kitić','Svetlana Ražnatović',
  'Seka Aleksić','Aca Lukas','Šerif Konjević','Šemsa Suljaković','Milica Pavlović','Dragana Mirković',
  'Sinan Sakić','Vesna Zmijanac','Zorica Brunclik','Snežana Đurišić','Merima Njegomir',
  'Predrag Gojković Cune','Halid Muslimović','Enes Begović','Đorđe Marjanović','Miki Jevremović',
  'Ceca','Bata Illic','Ivica Šerfezi']);

const SEVDAH = new Set(['Safet Isović','Zaim Imamović','Hanka Paldum','Kemal Monteno','Nedžad Salković',
  'Himzo Polovina','Nada Mamula','Beba Selimović','Meho Puzić','Jadranka Stojaković','Goran Bregović']);

const PRIMORJE = new Set(['Oliver Dragojević','Mišo Kovač','Arsen Dedić','Ibrica Jusić','Tereza Kesovija',
  'Klapa Cambi','Vinko Coce','Gibonni','Đani Stipaničev']);

const pickGenres = (n) =>
  SEVDAH.has(n) ? ['sevdalinka','domaca']
  : PRIMORJE.has(n) ? ['starogradska','domaca']
  : ROCK.has(n) ? ['rock','ex-yu']
  : FOLK.has(n) ? ['narodna','domaca']
  : ['pop','domaca'];

await mongoose.connect(process.env.MONGODB_URI);

const editor = await Staff.findOne({ role: 'superadmin' }) || await Staff.findOne();
if (!editor) { console.error('  Nema naloga osoblja.'); process.exit(1); }

const removed = await Song.deleteMany({ tags: 'demo' });
console.log(`  obrisano starih demo pjesama: ${removed.deletedCount}`);

const data = JSON.parse(await fs.readFile(new URL('./titles.json', import.meta.url), 'utf8'));
const bySlug = Object.fromEntries((await Genre.find()).map((g) => [g.slug, g._id]));

let created = 0;
let skipped = 0;

for (const [artistName, entry] of Object.entries(data.result)) {
  const artist = await Artist.findOrCreateByName(artistName);
  const genres = pickGenres(artistName).map((s) => bySlug[s]).filter(Boolean);

  // AI-TRAP: this used to match on the exact title, which let "Bele ruze" and
  // "Bele ruže" both through as separate songs. Compare on the folded form, and
  // remember what this run itself adds. A real text is still never overwritten.
  const seen = new Set(
    (await Song.find({ artist: artist._id }, { title: 1 })).map((s) => foldTitle(s.title))
  );

  for (const title of entry.titles) {
    const key = foldTitle(title);
    if (!key || seen.has(key)) { skipped++; continue; }
    seen.add(key);

    const seed = hash(title + artistName);
    const prog = PROGRESSIONS[seed % PROGRESSIONS.length];

    await Song.create({
      title,
      artist: artist._id,
      genres,
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
const empty = await Artist.deleteMany({ songCount: 0 });

console.log(`  napravljeno: ${created}   preskoceno (vec postoji): ${skipped}`);
console.log(`  uklonjeno izvodjaca bez pjesama: ${empty.deletedCount}`);
await mongoose.disconnect();
