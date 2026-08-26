import mongoose from 'mongoose';
import Song from '../models/Song.js';
import Rating from '../models/Rating.js';

/**
 * Versions of one song: an easy open-chord take, a full barre take, a capo
 * variant, or simply somebody else's transcription of the same thing.
 *
 * Ratings hang off the arrangement rather than the song, so these are not just
 * alternative text — each carries its own accuracy score, and that is the
 * point. Adding a second version is how a wrong chart stops being the only
 * chart.
 */

const byIdOrSlug = (identifier) =>
  mongoose.isValidObjectId(identifier) ? { _id: identifier } : { slug: identifier };

async function loadSong(identifier) {
  return Song.findOne(byIdOrSlug(identifier));
}

/** Everything a writer may set. Ratings and primary are never taken from input. */
function readInput(body) {
  const out = {};
  if (typeof body.label === 'string') out.label = body.label.trim().slice(0, 80);
  if (typeof body.content === 'string') out.content = body.content;
  if (typeof body.originalKey === 'string') out.originalKey = body.originalKey.trim().slice(0, 8);
  if (body.capo !== undefined) out.capo = Math.min(Math.max(Number(body.capo) || 0, 0), 12);
  if (['easy', 'medium', 'hard'].includes(body.difficulty)) out.difficulty = body.difficulty;
  return out;
}

export async function add(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const input = readInput(req.body);
    if (!input.content || !input.originalKey) {
      return res.status(400).json({ message: 'Tekst i tonalitet su obavezni.' });
    }

    // A ceiling, not a rule anyone will hit: six versions of one song is
    // already more than a reader will compare, and it keeps a script from
    // growing a document without bound.
    if (song.arrangements.length >= 6) {
      return res.status(409).json({ message: 'Pjesma već ima najviše verzija (6).' });
    }

    song.arrangements.push({
      ...input,
      label: input.label || `Verzija ${song.arrangements.length + 1}`,
      // The first one ever added is primary; later ones never take over by
      // themselves, because that would silently change what every visitor sees.
      isPrimary: song.arrangements.length === 0,
      createdBy: req.staff._id
    });
    song.updatedBy = req.staff._id;
    await song.save();

    res.status(201).json({ song: song.toPublic() });
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const arrangement = song.arrangements.id(req.params.arrangementId);
    if (!arrangement) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    Object.assign(arrangement, readInput(req.body));
    song.updatedBy = req.staff._id;
    await song.save();

    res.json({ song: song.toPublic() });
  } catch (err) { next(err); }
}

export async function setPrimary(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const target = song.arrangements.id(req.params.arrangementId);
    if (!target) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    // Exactly one, always: the virtual falls back to arrangements[0] when none
    // is flagged, which quietly makes insertion order the decision.
    song.arrangements.forEach((a) => { a.isPrimary = String(a._id) === String(target._id); });
    song.updatedBy = req.staff._id;
    await song.save();

    res.json({ song: song.toPublic() });
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const target = song.arrangements.id(req.params.arrangementId);
    if (!target) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    // A song with no arrangement has no chords, which is not a song any more.
    if (song.arrangements.length <= 1) {
      return res.status(409).json({ message: 'Posljednja verzija se ne može obrisati.' });
    }

    const wasPrimary = target.isPrimary;
    target.deleteOne();

    // Promote rather than leave the flag unset: without one the primary virtual
    // silently falls back to whichever happens to be first.
    if (wasPrimary && song.arrangements.length) song.arrangements[0].isPrimary = true;

    song.updatedBy = req.staff._id;
    await song.save();

    // The votes belonged to that version and mean nothing without it.
    await Rating.deleteMany({ arrangement: req.params.arrangementId });

    res.json({ song: song.toPublic() });
  } catch (err) { next(err); }
}
