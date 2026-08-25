/**
 * Generates a catalogue for testing search, filtering and pagination.
 *
 *   node scripts/seedDummySongs.js [count]
 *
 * Everything is synthesised from word banks: titles and verses are assembled at
 * run time, so the corpus is large and varied without containing anyone's
 * lyrics. The point is realistic *shape* — enough titles to make search
 * meaningful, enough spread across performers and rubrics to exercise the
 * filters — not realistic words.
 *
 * Seeded, so a re-run produces the same catalogue rather than a second one.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import Genre from '../src/models/Genre.js';
import Staff from '../src/models/Staff.js';

/** Deterministic PRNG, so repeated runs line up. */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rand = makeRandom(20260825);
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;

const NOUNS = [
  'noć', 'zora', 'srce', 'put', 'rijeka', 'grad', 'sjena', 'vjetar', 'more',
  'pjesma', 'san', 'dan', 'zvijezda', 'kiša', 'ljeto', 'jesen', 'cesta',
  'kuća', 'prozor', 'vrijeme', 'tišina', 'obala', 'most', 'pismo', 'ime',
  'ogledalo', 'trag', 'korak', 'oblak', 'plamen', 'vrt', 'sat', 'ključ'
];

const ADJECTIVES = [
  'tiha', 'daleka', 'zadnja', 'prva', 'bijela', 'duga', 'topla', 'hladna',
  'stara', 'nova', 'mirna', 'prazna', 'kratka', 'jasna', 'mokra', 'sporo'
];

const VERBS = ['padne', 'svane', 'prođe', 'stane', 'krene', 'utihne', 'zaboravi', 'ostane'];
const PREPOSITIONS = ['bez', 'za', 'kroz', 'iznad', 'poslije', 'umjesto'];

const TITLE_SHAPES = [
  () => `${cap(pick(ADJECTIVES))} ${pick(NOUNS)}`,
  () => `${cap(pick(NOUNS))} ${pick(PREPOSITIONS)} ${pick(NOUNS)}`,
  () => `Kad ${pick(VERBS)} ${pick(NOUNS)}`,
  () => `${cap(pick(NOUNS))} i ${pick(NOUNS)}`,
  () => `Jos jedna ${pick(NOUNS)}`,
  () => `${cap(pick(NOUNS))} koja ${pick(VERBS)}`,
  () => `Ne ${pick(VERBS)} ${pick(NOUNS)}`
];

const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/** Progressions that actually turn up in this repertoire, in our notation. */
const PROGRESSIONS = [
  ['Am', 'F', 'C', 'G'],
  ['Am', 'Dm', 'E', 'Am'],
  ['C', 'G', 'Am', 'F'],
  ['Hm', 'G', 'D', 'A'],
  ['Em', 'C', 'G', 'D'],
  ['Dm', 'A#', 'F', 'C'],
  ['G', 'D', 'Em', 'C'],
  ['F#m', 'D', 'A', 'E'],
  ['Cm', 'G#', 'D#', 'A#']
];

const SECTIONS = ['Uvod', 'Strofa 1', 'Refren', 'Strofa 2', 'Refren', 'Solo', 'Kraj'];

function makeLine(chords) {
  // Four to seven filler words with a chord change every couple of words.
  const words = Math.floor(rand() * 4) + 4;
  let line = '';

  for (let i = 0; i < words; i++) {
    if (i === 0 || (i % 2 === 0 && chance(0.6))) line += `[${pick(chords)}]`;
    line += pick(NOUNS) + (i < words - 1 ? ' ' : '');
  }
  return line;
}

function makeContent(chords) {
  const out = [];

  for (const section of SECTIONS) {
    out.push(`[${section}]`);

    if (section === 'Uvod' || section === 'Solo') {
      out.push(chords.map((c) => `[${c}]`).join('  '));
    } else {
      const lines = section.startsWith('Refren') ? 3 : 4;
      for (let i = 0; i < lines; i++) out.push(makeLine(chords));
    }
    out.push('');
  }
  return out.join('\n').trim();
}

const COUNT = Number(process.argv[2]) || 1000;

try {
  await connectDB();

  const [artists, genres, editor] = await Promise.all([
    Artist.find().select('_id name'),
    Genre.find().select('_id slug kind'),
    Staff.findOne({ role: { $in: ['worker', 'admin'] } })
  ]);

  if (!artists.length) {
    console.error('No performers found. Run scripts/seedArtists.js first.');
    process.exit(1);
  }
  if (!editor) {
    console.error('No editorial account found. Run scripts/createAdmin.js first.');
    process.exit(1);
  }

  const regions = genres.filter((g) => g.kind === 'region');
  const styles = genres.filter((g) => g.kind === 'style');

  const existing = await Song.countDocuments({ tags: 'dummy' });
  if (existing) {
    console.log(`${existing} generated songs already present. Remove them first:`);
    console.log('  mongosh octava --eval \'db.songs.deleteMany({tags: "dummy"})\'');
    process.exit(0);
  }

  const docs = [];
  const usedTitles = new Set();

  for (let i = 0; i < COUNT; i++) {
    // The word banks generate far fewer combinations than the requested count,
    // so duplicates are expected. Numbering them off a counter (rather than a
    // hash of the set size) is what guarantees each suffix is used once.
    const base = pick(TITLE_SHAPES)();
    let title = base;
    let attempt = 1;
    while (usedTitles.has(title)) title = `${base} ${++attempt}`;
    usedTitles.add(title);

    const chords = pick(PROGRESSIONS);
    const artist = pick(artists);

    docs.push({
      title,
      slug: '', // filled below; pre-save hooks do not run on insertMany
      artist: artist._id,
      genres: [pick(regions)._id, pick(styles)._id, ...(chance(0.3) ? [pick(styles)._id] : [])],
      tags: ['dummy'],
      status: chance(0.9) ? 'published' : 'draft',
      views: Math.floor(rand() * 5000),
      createdBy: editor._id,
      updatedBy: editor._id,
      arrangements: [{
        label: 'Osnovna verzija',
        content: makeContent(chords),
        originalKey: chords[0],
        capo: chance(0.35) ? Math.floor(rand() * 5) + 1 : 0,
        difficulty: pick(['easy', 'medium', 'hard']),
        chords,
        isPrimary: true,
        createdBy: editor._id
      }]
    });
  }

  // Slugs are normally set by a pre-validate hook, which insertMany skips.
  const { slugify } = await import('../src/utils/slug.js');
  const seenSlugs = new Set(await Song.distinct('slug'));

  for (const doc of docs) {
    const base = slugify(doc.title) || 'pjesma';
    let slug = base;
    let n = 1;
    while (seenSlugs.has(slug)) slug = `${base}-${++n}`;
    seenSlugs.add(slug);
    doc.slug = slug;
  }

  // Assert rather than discover it as a duplicate-key error halfway through a
  // partial insert, which leaves the collection in a state needing manual cleanup.
  const slugs = new Set(docs.map((d) => d.slug));
  if (slugs.size !== docs.length) {
    console.error(`Slug collision: ${docs.length} songs produced only ${slugs.size} distinct slugs.`);
    process.exit(1);
  }

  console.log(`Inserting ${docs.length} songs...`);
  await Song.insertMany(docs, { ordered: false });

  // Counters are maintained by the controllers, so recompute them here.
  console.log('Recomputing counters...');
  for (const artist of artists) {
    await Artist.updateOne({ _id: artist._id }, { songCount: await Song.countDocuments({ artist: artist._id }) });
  }
  for (const genre of genres) {
    await Genre.updateOne({ _id: genre._id }, { songCount: await Song.countDocuments({ genres: genre._id }) });
  }

  console.log('');
  console.log('Songs total:     ' + await Song.countDocuments());
  console.log('Published:       ' + await Song.countDocuments({ status: 'published' }));
  console.log('Drafts:          ' + await Song.countDocuments({ status: 'draft' }));
  console.log('Performers used: ' + (await Song.distinct('artist')).length);
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
