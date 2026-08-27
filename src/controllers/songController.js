import mongoose from 'mongoose';
import Song from '../models/Song.js';
import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';
import AuditLog, { diff } from '../models/AuditLog.js';
import Rating from '../models/Rating.js';
import Review from '../models/Review.js';
import { readPaging, pageMeta } from '../utils/pagination.js';
import { slugify } from '../utils/slug.js';
import { youtubeId } from '../utils/youtube.js';

/**
 * Fields whose change is worth a line in the audit log.
 *
 * Deliberately not every field: the chord text has its own trail in
 * Song.history, and recording counters and timestamps would bury the edits a
 * person actually made under noise nobody reads.
 */
const AUDITED = ['title', 'artist', 'status', 'genres', 'tags', 'youtubeId'];

const snapshot = (song) => Object.fromEntries(AUDITED.map((f) => [f, song[f]]));

/** Keeps the artist and genre counters honest as a song enters or leaves view. */
async function shiftCounters(song, by) {
  await Artist.updateOne({ _id: song.artist }, { $inc: { songCount: by } });
  await Genre.updateMany({ _id: { $in: song.genres } }, { $inc: { songCount: by } });
}

/** Escapes user input before it is used inside a RegExp. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Resolves genre slugs or ids to ObjectIds, dropping anything unrecognised. */
async function resolveGenres(input) {
  if (!input?.length) return [];
  const values = Array.isArray(input) ? input : [input];

  const ids = values.filter((v) => mongoose.isValidObjectId(v));
  const slugs = values.filter((v) => !mongoose.isValidObjectId(v));

  const found = await Genre.find({
    $or: [{ _id: { $in: ids } }, { slug: { $in: slugs } }]
  }).select('_id');

  return found.map((g) => g._id);
}

/** Workers address songs by id from the editor; visitors use the slug. */
function byIdOrSlug(identifier) {
  return mongoose.isValidObjectId(identifier)
    ? { _id: identifier }
    : { slug: identifier };
}

/** Drafts are visible to editors only. */
function visibilityFilter(staff) {
  return staff ? {} : { status: 'published' };
}

export async function list(req, res, next) {
  try {
    const paging = readPaging(req.query);
    const filter = { ...visibilityFilter(req.staff) };

    // Editors can ask for one state explicitly. Checked against the enum
    // rather than passed through, so the query cannot be steered by the
    // caller. Visitors are already limited to published by visibilityFilter,
    // so a request for drafts narrows to nothing rather than leaking them.
    if (req.query.status && ['published', 'draft'].includes(req.query.status)) {
      filter.status = req.staff
        ? req.query.status
        : (req.query.status === 'published' ? 'published' : '__none__');
    }

    /*
     * Tags mark how a song got here and what it still needs — `uvoz` for an
     * automated import, `bez-akorda` for one with a real title and no chords yet,
     * `neprovjereno` for one MusicBrainz could not confirm. Without a filter those
     * marks are invisible and nobody ever works through them.
     */
    if (req.query.tag) filter.tags = String(req.query.tag).toLowerCase();

    if (req.query.genre) {
      const genre = await Genre.findOne({ slug: req.query.genre });
      if (!genre) return res.json({ songs: [], meta: pageMeta(0, paging) });
      filter.genres = genre._id;
    }

    const sort = req.query.sort === 'popular'
      ? { views: -1, createdAt: -1 }
      : req.query.sort === 'title' ? { title: 1 } : { createdAt: -1 };

    const [songs, total] = await Promise.all([
      Song.find(filter)
        .populate('artist', 'name slug')
        .populate('genres', 'name slug')
        .sort(sort)
        .skip(paging.skip)
        .limit(paging.limit),
      Song.countDocuments(filter)
    ]);

    res.json({ songs: songs.map((s) => s.toPublic()), meta: pageMeta(total, paging) });
  } catch (err) {
    next(err);
  }
}

export async function search(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const paging = readPaging(req.query);

    if (!q) {
      return res.json({ songs: [], artists: [], genres: [], meta: pageMeta(0, paging) });
    }

    // Fold the query the same way the stored copies were folded, so "noc",
    // "noć" and "NOĆ" all reach the same songs.
    const folded = slugify(q).replace(/-/g, ' ');
    if (!folded) return res.json({ songs: [], artists: [], genres: [], meta: pageMeta(0, paging) });

    const pattern = new RegExp(escapeRegex(folded), 'i');

    // One query cannot answer "did they mean a song, a performer, or a rubric",
    // so all three are searched and returned separately for the UI to group.
    // Only the songs are paged; the other two are navigation hints and stay
    // short whatever page the reader is on.
    const [artists, genres] = await Promise.all([
      // country and imageBytes are what toCard turns into the flag and the
      // hasImage flag; selecting only name/slug/songCount silently produced
      // results with neither.
      Artist.find({ searchName: pattern })
        .select('name slug songCount country imageBytes').limit(10),
      Genre.find({ name: new RegExp(escapeRegex(q), 'i') }).select('name slug').limit(10)
    ]);

    const filter = {
      ...visibilityFilter(req.staff),
      $or: [
        { searchTitle: pattern },
        { artist: { $in: artists.map((a) => a._id) } }
      ]
    };

    const [songs, total] = await Promise.all([
      Song.find(filter)
        .populate('artist', 'name slug')
        .populate('genres', 'name slug')
        .sort({ views: -1 })
        .skip(paging.skip)
        .limit(paging.limit),
      Song.countDocuments(filter)
    ]);

    res.json({
      songs: songs.map((s) => s.toPublic()),
      // toCard turns country into a flag and imageBytes into a plain boolean;
      // the raw documents carried neither.
      artists: artists.map((a) => a.toCard()),
      genres,
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const song = await Song.findOne({
      ...byIdOrSlug(req.params.identifier),
      ...visibilityFilter(req.staff)
    })
      .populate('artist', 'name slug')
      .populate('genres', 'name slug');

    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    // Fire-and-forget: a failed counter must never fail the page.
    Song.updateOne({ _id: song._id }, { $inc: { views: 1 } }).catch(() => {});

    res.json({ song: song.toPublic(req.query.arrangement) });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { title, artist, content, originalKey, capo, difficulty, tags, genres, status, label, youtube } = req.body;

    if (!title || !artist || !content || !originalKey) {
      return res.status(400).json({ message: 'Naslov, izvođač, tekst i tonalitet su obavezni.' });
    }

    const artistDoc = await Artist.findOrCreateByName(artist);
    if (!artistDoc) return res.status(400).json({ message: 'Izvođač je obavezan.' });

    const genreIds = await resolveGenres(genres);

    const song = await Song.create({
      title,
      artist: artistDoc._id,
      genres: genreIds,
      tags,
      status: status === 'published' ? 'published' : 'draft',
      // Rejected input leaves the field unset rather than storing junk.
      youtubeId: youtubeId(youtube) || undefined,
      createdBy: req.staff._id,
      updatedBy: req.staff._id,
      arrangements: [{
        label: label || 'Osnovna verzija',
        content,
        originalKey,
        capo: capo || 0,
        difficulty: difficulty || 'medium',
        isPrimary: true,
        createdBy: req.staff._id
      }]
    });

    await Artist.updateOne(
      { _id: artistDoc._id },
      { $inc: { songCount: 1 }, $addToSet: { genres: { $each: genreIds } } }
    );
    await Genre.updateMany({ _id: { $in: genreIds } }, { $inc: { songCount: 1 } });

    await song.populate('artist', 'name slug');
    await song.populate('genres', 'name slug');

    await AuditLog.record({
      req, action: 'create', entity: 'song',
      entityId: song._id, entityLabel: song.title
    });

    res.status(201).json({ song: song.toPublic() });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const song = await Song.findOne(byIdOrSlug(req.params.identifier));
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const before = snapshot(song);

    const { title, artist, content, originalKey, capo, difficulty, tags, genres, status, arrangementId, youtube } = req.body;

    if (title) song.title = title;
    if (tags) song.tags = tags;

    if (genres) {
      const next = await resolveGenres(genres);
      const before = song.genres.map(String);
      const after = next.map(String);

      // Keep the per-genre counters honest across a re-categorisation.
      await Genre.updateMany(
        { _id: { $in: before.filter((id) => !after.includes(id)) } },
        { $inc: { songCount: -1 } }
      );
      await Genre.updateMany(
        { _id: { $in: after.filter((id) => !before.includes(id)) } },
        { $inc: { songCount: 1 } }
      );

      song.genres = next;
      await Artist.updateOne({ _id: song.artist }, { $addToSet: { genres: { $each: next } } });
    }
    if (status) song.status = status === 'published' ? 'published' : 'draft';
    /**
     * undefined leaves it alone; an empty string clears it.
     *
     * The distinction matters: a form that always sends the field would wipe
     * the video on every unrelated save if absence and emptiness were treated
     * the same.
     */
    if (youtube !== undefined) {
      const id = youtubeId(youtube);
      if (id === null) {
        return res.status(400).json({ message: 'Neispravan YouTube link.' });
      }
      song.youtubeId = id || undefined;
    }

    if (artist) {
      const artistDoc = await Artist.findOrCreateByName(artist);
      if (artistDoc && !artistDoc._id.equals(song.artist)) {
        await Artist.updateOne({ _id: song.artist }, { $inc: { songCount: -1 } });
        await Artist.updateOne({ _id: artistDoc._id }, { $inc: { songCount: 1 } });
        song.artist = artistDoc._id;
      }
    }

    const target = arrangementId ? song.arrangements.id(arrangementId) : song.primary;
    if (target) {
      // Snapshot the previous text before overwriting, so an accidental
      // paste-over can be recovered.
      if (content && content !== target.content) {
        song.history.push({ content: target.content, editedBy: req.staff._id });
        target.content = content;
      }
      if (originalKey) target.originalKey = originalKey;
      if (capo !== undefined) target.capo = capo;
      if (difficulty) target.difficulty = difficulty;
    }

    song.updatedBy = req.staff._id;
    await song.save();
    await song.populate('artist', 'name slug');
    await song.populate('genres', 'name slug');

    const changes = diff(before, snapshot(song), AUDITED);
    if (changes.length) {
      await AuditLog.record({
        req, action: 'update', entity: 'song',
        entityId: song._id, entityLabel: song.title, changes
      });
    }

    res.json({ song: song.toPublic() });
  } catch (err) {
    next(err);
  }
}

/**
 * Moves a song to the trash.
 *
 * AI-DECISION: this used to destroy the document, taking its arrangements,
 * ratings and reviews with it and leaving nothing to appeal to. Now it sets a
 * date; `purge` is the separate, deliberate act that actually removes it.
 * See AI-NOTES.md §5.
 */
export async function remove(req, res, next) {
  try {
    const song = await Song.findOne(byIdOrSlug(req.params.identifier));
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    await shiftCounters(song, -1);

    song.deletedAt = new Date();
    song.deletedBy = req.staff._id;
    await song.save();

    await AuditLog.record({
      req, action: 'delete', entity: 'song',
      entityId: song._id, entityLabel: song.title
    });

    res.json({ ok: true, deletedAt: song.deletedAt });
  } catch (err) {
    next(err);
  }
}

/** Everything in the trash, newest first. */
export async function listTrash(req, res, next) {
  try {
    const paging = readPaging(req.query);

    const [songs, total] = await Promise.all([
      Song.find({ deletedAt: { $ne: null } })
        .setOptions({ withDeleted: true })
        .select('title slug artist deletedAt deletedBy status views')
        .populate('artist', 'name slug')
        .populate('deletedBy', 'name email')
        .sort({ deletedAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit),
      Song.countDocuments({ deletedAt: { $ne: null } }).setOptions({ withDeleted: true })
    ]);

    res.json({ songs, meta: pageMeta(total, paging) });
  } catch (err) {
    next(err);
  }
}

/** Puts a song back where it was. */
export async function restore(req, res, next) {
  try {
    const song = await Song.findOne(byIdOrSlug(req.params.identifier)).setOptions({ withDeleted: true });
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });
    if (!song.deletedAt) return res.status(409).json({ message: 'Pjesma nije obrisana.' });

    await shiftCounters(song, 1);

    song.deletedAt = null;
    song.deletedBy = undefined;
    await song.save();

    await AuditLog.record({
      req, action: 'restore', entity: 'song',
      entityId: song._id, entityLabel: song.title
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Destroys a song for good, along with what hung off it.
 *
 * Only reachable for something already in the trash, so nobody can skip the
 * recoverable step by calling a different endpoint.
 */
export async function purge(req, res, next) {
  try {
    const song = await Song.findOne(byIdOrSlug(req.params.identifier)).setOptions({ withDeleted: true });
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });
    if (!song.deletedAt) {
      return res.status(409).json({ message: 'Prvo obriši pjesmu, pa je onda možeš trajno ukloniti.' });
    }

    await Rating.deleteMany({ song: song._id });
    await Review.deleteMany({ song: song._id });
    await song.deleteOne();

    // The label is the only thing left once the document is gone, which is
    // exactly why the log copies it in rather than referencing it.
    await AuditLog.record({
      req, action: 'purge', entity: 'song',
      entityId: song._id, entityLabel: song.title
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * One change across many songs.
 *
 * Recategorising a catalogue of this size one record at a time is what drove
 * people to run scripts against the database instead, which is the thing the
 * audit log cannot see.
 */
const BULK_ACTIONS = ['status', 'addGenre', 'removeGenre', 'addTag', 'removeTag', 'delete'];
const BULK_LIMIT = 500;

export async function bulk(req, res, next) {
  try {
    const { ids, action, value } = req.body || {};

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'Nijedna pjesma nije izabrana.' });
    }
    if (ids.length > BULK_LIMIT) {
      return res.status(400).json({ message: `Najviše ${BULK_LIMIT} pjesama odjednom.` });
    }
    if (!BULK_ACTIONS.includes(action)) {
      return res.status(400).json({ message: 'Nepoznata radnja.' });
    }

    const valid = ids.filter((id) => mongoose.isValidObjectId(id));
    const songs = await Song.find({ _id: { $in: valid } });
    if (!songs.length) return res.status(404).json({ message: 'Nijedna pjesma nije pronađena.' });

    let touched = 0;
    let label = '';

    if (action === 'status') {
      const status = value === 'published' ? 'published' : 'draft';
      label = status;
      const result = await Song.updateMany(
        { _id: { $in: songs.map((s) => s._id) }, status: { $ne: status } },
        { $set: { status, updatedBy: req.staff._id } }
      );
      touched = result.modifiedCount;
    } else if (action === 'delete') {
      const now = new Date();
      for (const song of songs) {
        await shiftCounters(song, -1);
        song.deletedAt = now;
        song.deletedBy = req.staff._id;
        await song.save();
        touched++;
      }
    } else if (action === 'addTag' || action === 'removeTag') {
      const tag = String(value || '').trim().toLowerCase();
      if (!tag) return res.status(400).json({ message: 'Tag je prazan.' });
      label = tag;

      const op = action === 'addTag' ? { $addToSet: { tags: tag } } : { $pull: { tags: tag } };
      const result = await Song.updateMany({ _id: { $in: songs.map((s) => s._id) } }, op);
      touched = result.modifiedCount;
    } else {
      const [genre] = await resolveGenres([value]);
      if (!genre) return res.status(400).json({ message: 'Žanr nije pronađen.' });

      const doc = await Genre.findById(genre).select('name');
      label = doc?.name || String(genre);

      // Counters are shifted by how many songs actually changed, so running the
      // same bulk edit twice does not inflate them.
      const adding = action === 'addGenre';
      const affected = songs.filter((s) => s.genres.map(String).includes(String(genre)) !== adding);

      if (affected.length) {
        await Song.updateMany(
          { _id: { $in: affected.map((s) => s._id) } },
          adding ? { $addToSet: { genres: genre } } : { $pull: { genres: genre } }
        );
        await Genre.updateOne({ _id: genre }, { $inc: { songCount: adding ? affected.length : -affected.length } });
      }
      touched = affected.length;
    }

    await AuditLog.record({
      req, action: 'bulk', entity: 'song',
      entityLabel: `${touched} pjesama`,
      meta: { operation: action, value: label || value, requested: songs.length, touched }
    });

    res.json({ ok: true, touched, requested: songs.length });
  } catch (err) {
    next(err);
  }
}

/**
 * What else to play after this one.
 *
 * Ordered by how close the connection is: the same artist first, then the same
 * genre, then whatever is popular. "Same artist" is the only one a guitarist
 * would call obviously related, so it leads; the fallbacks exist so the section
 * is never empty, which on a song with one genre and a one-song artist it
 * otherwise would be.
 *
 * Views break ties throughout — among equally related songs, the one other
 * people actually opened is the better suggestion.
 */
export async function related(req, res, next) {
  try {
    const song = await Song.findOne({ ...byIdOrSlug(req.params.identifier), status: 'published' })
      .select('_id artist genres');
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const limit = Math.min(Number(req.query.limit) || 6, 12);
    const base = { status: 'published', _id: { $ne: song._id } };
    const fields = 'title slug views';
    const populate = { path: 'artist', select: 'name slug' };

    const picked = [];
    const seen = new Set([String(song._id)]);

    /** Adds only what is not already in the list, up to the limit. */
    const take = (rows) => {
      for (const row of rows) {
        if (picked.length >= limit) return;
        if (seen.has(String(row._id))) continue;
        seen.add(String(row._id));
        picked.push(row);
      }
    };

    const sameArtist = await Song.find({ ...base, artist: song.artist })
      .select(fields).populate(populate).sort({ views: -1 }).limit(limit);
    take(sameArtist);

    if (picked.length < limit && song.genres?.length) {
      const sameGenre = await Song.find({ ...base, genres: { $in: song.genres } })
        .select(fields).populate(populate).sort({ views: -1 }).limit(limit * 2);
      take(sameGenre);
    }

    if (picked.length < limit) {
      const popular = await Song.find(base)
        .select(fields).populate(populate).sort({ views: -1 }).limit(limit * 2);
      take(popular);
    }

    res.json({
      items: picked.map((s) => ({
        _id: s._id, title: s.title, slug: s.slug, views: s.views,
        artist: s.artist ? { name: s.artist.name, slug: s.artist.slug } : null
      }))
    });
  } catch (err) { next(err); }
}
