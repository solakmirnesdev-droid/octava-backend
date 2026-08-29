/**
 * Loads Mirnes's own songs from authored.js.
 *
 *   node scripts/seed/load-authored.js          # dry run, writes nothing
 *   node scripts/seed/load-authored.js --write  # actually writes
 *
 * Dry by default. Every other seed script in here writes on sight, and this one
 * edits rows that already exist and already have a real performer's name on
 * them — that is the case where seeing the plan first is worth a flag.
 *
 * Idempotent: a second run updates in place rather than adding a second copy,
 * so a text can be corrected and reloaded.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';
import Staff from '../../src/models/Staff.js';
import { slugify } from '../../src/utils/slug.js';
import { AUTHORED } from './authored.js';

/** Who wrote these, when an entry does not say otherwise. */
const DEFAULT_AUTHOR = 'Mirnes Solak';

const WRITE = process.argv.includes('--write');

await mongoose.connect(process.env.MONGODB_URI);

const editor = await Staff.findOne({ role: 'superadmin' }) || await Staff.findOne();
if (!editor) {
  console.error('  Nema nijednog naloga osoblja — pjesme moraju imati autora unosa.');
  process.exit(1);
}

let created = 0;
let updated = 0;
let replaced = 0;

for (const entry of AUTHORED) {
  const author = entry.author || DEFAULT_AUTHOR;

  /*
   * Tagged unless the entry says the performer wrote it. The default is the
   * cautious direction on purpose: a row that misattributes and is not marked
   * is indistinguishable from a checked one, which is the failure the whole
   * verification pass in AI-NOTES.md §5 exists to prevent.
   */
  const tags = ['autorsko'];
  if (author !== entry.artist) tags.push('demo-atribucija');

  const artist = await Artist.findOrCreateByName(entry.artist);
  const genres = entry.genres?.length
    ? await Genre.find({ slug: { $in: entry.genres } }).select('_id')
    : null;

  const arrangement = {
    label: entry.label || 'Osnovna verzija',
    content: entry.content,
    originalKey: entry.originalKey,
    capo: entry.capo || 0,
    difficulty: entry.difficulty || 'medium',
    isPrimary: true
  };

  // Reusing a demo row keeps its place in the catalogue; otherwise the song is
  // its own entry, found by the slug his title produces.
  const existing = entry.replacesSlug
    ? await Song.findOne({ slug: entry.replacesSlug })
    : await Song.findOne({ slug: slugify(entry.title) });

  if (entry.replacesSlug && !existing) {
    console.error(`  ! nema pjesme sa slugom "${entry.replacesSlug}" — preskacem "${entry.title}"`);
    continue;
  }

  if (existing) {
    const wasDemo = existing.tags.includes('demo');
    const oldTitle = existing.title;

    /*
     * The arrangement id is carried over so nothing pointing at it dangles, but
     * its votes are not: they were cast on the text that used to be here, and
     * that text is gone. A rating kept across a full content replacement is a
     * reader's judgement of a chart they never saw.
     */
    existing.arrangements = [{
      ...arrangement,
      _id: existing.arrangements[0]?._id,
      ratingSum: 0,
      ratingCount: 0
    }];
    if (!entry.keepTitle) existing.title = entry.title;
    if (genres) existing.genres = genres.map((g) => g._id);
    existing.artist = artist._id;
    existing.tags = tags;
    existing.status = entry.status || 'draft';
    existing.updatedBy = editor._id;

    if (WRITE) await existing.save();
    console.log(`  ${wasDemo ? 'zamjena' : 'azuriranje'}: "${oldTitle}" -> "${existing.title}" (${entry.artist})`);
    if (wasDemo) replaced++; else updated++;
    continue;
  }

  if (WRITE) {
    await Song.create({
      title: entry.title,
      artist: artist._id,
      genres: genres ? genres.map((g) => g._id) : [],
      tags,
      status: entry.status || 'draft',
      createdBy: editor._id,
      updatedBy: editor._id,
      arrangements: [arrangement]
    });
  }
  console.log(`  nova: "${entry.title}" (${entry.artist})`);
  created++;
}

if (WRITE && (created || updated || replaced)) {
  // Counts are denormalised, so recompute rather than guess at deltas.
  for (const a of await Artist.find()) {
    await Artist.updateOne({ _id: a._id }, { songCount: await Song.countDocuments({ artist: a._id }) });
  }
  for (const g of await Genre.find()) {
    await Genre.updateOne({ _id: g._id }, { songCount: await Song.countDocuments({ genres: g._id }) });
  }
}

console.log(`\n  novih: ${created}  azuriranih: ${updated}  zamijenjenih demo unosa: ${replaced}`);
if (!WRITE) console.log('  (probni prolaz — nista nije upisano; dodaj --write)');
await mongoose.disconnect();
