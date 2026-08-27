/**
 * Merges artists that are the same person under two names.
 *
 *   node scripts/seed/merge-artists.js           # report
 *   node scripts/seed/merge-artists.js --apply   # merge
 *
 * AI-DECISION: grouped by MusicBrainz id, not by name. "Ceca" and "Svetlana
 * Ražnatović" are one singer with one catalogue, and no name comparison will
 * ever tell you that — but they share an id. A stage name and a legal name are
 * exactly the case a fold cannot catch.
 *
 * The surviving name is the one MusicBrainz uses, because that is the name the
 * recordings are filed under and the one a reader is likely to search for.
 */
import 'dotenv/config';
import { env } from '../../src/config/env.js';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import { foldTitle } from '../../src/utils/foldTitle.js';
import { toLatin } from '../../src/utils/latinise.js';
import { mb, pause } from '../lib/musicbrainz.js';

const apply = process.argv.includes('--apply');
await mongoose.connect(env.MONGODB_URI);

const groups = new Map();
for (const a of await Artist.find({ mbid: { $ne: null } })) {
  if (!groups.has(a.mbid)) groups.set(a.mbid, []);
  groups.get(a.mbid).push(a);
}

const dupes = [...groups.values()].filter((g) => g.length > 1);
console.log(`  izvodjaca sa istim MusicBrainz id: ${dupes.length} grupa\n`);

let merged = 0;
let movedSongs = 0;
let droppedSongs = 0;

for (const group of dupes) {
  // Most songs first, so the merge moves as little as possible.
  group.sort((a, b) => (b.songCount || 0) - (a.songCount || 0));
  const keep = group[0];
  const rest = group.slice(1);

  /*
   * The surviving name comes from MusicBrainz rather than from whichever row
   * happened to hold more songs. It is the name the recordings are filed under
   * and the one a reader searches for: this singer is "Ceca" on every sleeve
   * she has ever been on, and "Svetlana Ražnatović" on none of them.
   */
  let preferred = keep.name;
  try {
    const record = await mb(`/artist/${keep.mbid}?fmt=json`);
    if (record?.name) preferred = toLatin(record.name);
    await pause(1100);
  } catch {
    // Keeping the existing name is a fine outcome; failing the merge is not.
  }

  const renamed = preferred !== keep.name ? `  → "${preferred}"` : '';
  console.log(`  ${keep.name}  ←  ${rest.map((r) => r.name).join(', ')}${renamed}`);

  if (!apply) continue;
  if (preferred !== keep.name) keep.name = preferred;

  const titles = new Set(
    (await Song.find({ artist: keep._id }, { title: 1 })).map((s) => foldTitle(s.title))
  );

  for (const other of rest) {
    for (const song of await Song.find({ artist: other._id })) {
      const key = foldTitle(song.title);
      if (titles.has(key)) {
        // The same song under both names: one copy is enough, and it goes to
        // the trash rather than being destroyed.
        song.deletedAt = new Date();
        await song.save();
        droppedSongs += 1;
      } else {
        titles.add(key);
        song.artist = keep._id;
        await song.save();
        movedSongs += 1;
      }
    }

    // Anything the survivor is missing is worth carrying over.
    for (const field of ['country', 'origin', 'activeFrom', 'activeTo', 'bio', 'website']) {
      if (!keep[field] && other[field]) keep[field] = other[field];
    }
    if (!keep.imageBytes && other.imageBytes) {
      keep.image = other.image;
      keep.imageType = other.imageType;
      keep.imageBytes = other.imageBytes;
    }

    await Artist.deleteOne({ _id: other._id });
    merged += 1;
  }

  keep.songCount = await Song.countDocuments({ artist: keep._id });
  await keep.save();
}

console.log('');
console.log(`  spojeno izvodjaca ${merged}   premjesteno pjesama ${movedSongs}   dvojnika u korpu ${droppedSongs}`);
if (!apply) console.log('  (ništa nije promijenjeno — pokreni sa --apply)');
await mongoose.disconnect();
