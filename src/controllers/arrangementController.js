import mongoose from 'mongoose';
import Song from '../models/Song.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Versions of one song: an easy open-chord take, a full barre take, a capo
 * variant, or simply somebody else's transcription of the same thing.
 *
 * Ratings hang off the arrangement rather than the song, so these are not just
 * alternative text — each carries its own accuracy score, and that is the
 * point. Adding a second version is how a wrong chart stops being the only
 * chart.
 *
 * AI-TRAP: every count and every lookup here goes through the living versions,
 * never `song.arrangements` directly. Reading the raw array counts deleted ones
 * against the ceiling, numbers a new label wrongly, and can hand a deleted
 * version back to the site.
 */

const byIdOrSlug = (identifier) =>
  mongoose.isValidObjectId(identifier) ? { _id: identifier } : { slug: identifier };

/** A ceiling, not a rule anyone will hit: six versions is more than a reader
 *  will compare, and it keeps a script from growing a document without bound. */
const MAX_VERSIONS = 6;

async function loadSong(identifier) {
  return Song.findOne(byIdOrSlug(identifier));
}

/** The version asked for, but only if it is still in play. */
function pick(song, id) {
  const found = song.arrangements.id(id);
  return found && !found.deletedAt ? found : null;
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

const record = (req, song, arrangement, action, changes) => AuditLog.record({
  req, action, entity: 'arrangement',
  entityId: arrangement?._id,
  entityLabel: `${song.title} — ${arrangement?.label || '?'}`,
  changes,
  meta: { song: song._id }
});

export async function add(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const input = readInput(req.body);
    if (!input.content || !input.originalKey) {
      return res.status(400).json({ message: 'Tekst i tonalitet su obavezni.' });
    }

    const living = song.livingArrangements;
    if (living.length >= MAX_VERSIONS) {
      return res.status(409).json({ message: `Pjesma već ima najviše verzija (${MAX_VERSIONS}).` });
    }

    song.arrangements.push({
      ...input,
      label: input.label || `Verzija ${living.length + 1}`,
      // The first one ever added is primary; later ones never take over by
      // themselves, because that would silently change what every visitor sees.
      isPrimary: living.length === 0,
      createdBy: req.staff._id
    });
    song.updatedBy = req.staff._id;
    await song.save();

    await record(req, song, song.arrangements[song.arrangements.length - 1], 'create');
    res.status(201).json({ song: song.toPublic() });
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const arrangement = pick(song, req.params.arrangementId);
    if (!arrangement) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    const input = readInput(req.body);
    const changes = ['label', 'originalKey', 'capo', 'difficulty']
      .filter((f) => input[f] !== undefined && String(input[f]) !== String(arrangement[f]))
      .map((f) => ({ field: f, from: arrangement[f], to: input[f] }));

    Object.assign(arrangement, input);
    song.updatedBy = req.staff._id;
    await song.save();

    if (changes.length) await record(req, song, arrangement, 'update', changes);
    res.json({ song: song.toPublic() });
  } catch (err) { next(err); }
}

export async function setPrimary(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const target = pick(song, req.params.arrangementId);
    if (!target) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    // Exactly one, always: the virtual falls back to the first living version
    // when none is flagged, which quietly makes insertion order the decision.
    song.arrangements.forEach((a) => { a.isPrimary = String(a._id) === String(target._id); });
    song.updatedBy = req.staff._id;
    await song.save();

    await record(req, song, target, 'setPrimary');
    res.json({ song: song.toPublic() });
  } catch (err) { next(err); }
}

/**
 * Puts a version aside without destroying it.
 *
 * AI-DECISION: this used to call deleteOne() and then Rating.deleteMany() over
 * its votes. The text can be retyped; the votes cannot — they are other
 * people's judgement of whether the chart was right, gathered over time. See
 * AI-NOTES.md §5.
 */
export async function remove(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const target = pick(song, req.params.arrangementId);
    if (!target) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    // A song with no arrangement has no chords, which is not a song any more.
    if (song.livingArrangements.length <= 1) {
      return res.status(409).json({ message: 'Posljednja verzija se ne može obrisati.' });
    }

    const wasPrimary = target.isPrimary;
    target.deletedAt = new Date();
    target.deletedBy = req.staff._id;
    target.isPrimary = false;

    // Promote rather than leave the flag unset: without one the primary virtual
    // silently falls back to whichever happens to be first.
    const remaining = song.livingArrangements;
    if (wasPrimary && remaining.length) remaining[0].isPrimary = true;

    song.updatedBy = req.staff._id;
    await song.save();

    // The ratings stay. They belong to this version and are what makes it
    // worth getting back.
    await record(req, song, target, 'delete');
    res.json({ song: song.toPublic() });
  } catch (err) { next(err); }
}

/** Brings a version back, if the song has room for it. */
export async function restore(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const target = song.arrangements.id(req.params.arrangementId);
    if (!target) return res.status(404).json({ message: 'Verzija nije pronađena.' });
    if (!target.deletedAt) return res.status(409).json({ message: 'Verzija nije obrisana.' });

    if (song.livingArrangements.length >= MAX_VERSIONS) {
      return res.status(409).json({
        message: `Pjesma već ima najviše verzija (${MAX_VERSIONS}). Obriši jednu prije vraćanja.`
      });
    }

    target.deletedAt = null;
    target.deletedBy = undefined;
    song.updatedBy = req.staff._id;
    await song.save();

    await record(req, song, target, 'restore');
    res.json({ song: song.toPublic() });
  } catch (err) { next(err); }
}

/** The versions of one song that are in the trash, for the dashboard. */
export async function listRemoved(req, res, next) {
  try {
    const song = await loadSong(req.params.identifier);
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const removed = song.arrangements
      .filter((a) => a.deletedAt)
      .map((a) => ({
        _id: a._id, label: a.label, originalKey: a.originalKey,
        deletedAt: a.deletedAt, deletedBy: a.deletedBy,
        ratingCount: a.ratingCount
      }));

    res.json({ arrangements: removed });
  } catch (err) { next(err); }
}
