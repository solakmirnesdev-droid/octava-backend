import mongoose from 'mongoose';
import Song from '../models/Song.js';
import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';
import { readPaging, pageMeta } from '../utils/pagination.js';
import { slugify } from '../utils/slug.js';

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
    const { title, artist, content, originalKey, capo, difficulty, tags, genres, status, label } = req.body;

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

    res.status(201).json({ song: song.toPublic() });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const song = await Song.findOne(byIdOrSlug(req.params.identifier));
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const { title, artist, content, originalKey, capo, difficulty, tags, genres, status, arrangementId } = req.body;

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

    res.json({ song: song.toPublic() });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const song = await Song.findOne(byIdOrSlug(req.params.identifier));
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    await Artist.updateOne({ _id: song.artist }, { $inc: { songCount: -1 } });
    await Genre.updateMany({ _id: { $in: song.genres } }, { $inc: { songCount: -1 } });
    await song.deleteOne();

    res.json({ ok: true });
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
