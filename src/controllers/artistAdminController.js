import mongoose from 'mongoose';
import AuditLog, { diff } from '../models/AuditLog.js';
import Artist from '../models/Artist.js';
import Song from '../models/Song.js';
import Genre from '../models/Genre.js';

/**
 * Creating and editing artists, including their portrait.
 *
 * Until now an artist only ever came into being as a side effect of adding a
 * song, which meant nobody could give one a picture, a country or a biography.
 */

/*
 * AI-DECISION: raised from 10 KB to 100 KB. The pictures now come from Wikimedia
 * Commons at a size worth looking at, and 10 KB forced a portrait down to
 * something blurry. The bytes live inside the document, so this is a database
 * cost, not a disk one: 137 artists at this ceiling is about 14 MB, which the
 * nightly backup carries without noticing.
 */
export const MAX_IMAGE_BYTES = 100 * 1024;

/**
 * A WebP file starts with "RIFF", four bytes of length, then "WEBP".
 *
 * Checked against the bytes rather than the Content-Type header, because the
 * header is whatever the client claims. A renamed JPEG announcing itself as
 * WebP would otherwise be stored and then fail to render for every visitor.
 */
function isWebp(buf) {
  return Buffer.isBuffer(buf)
    && buf.length > 12
    && buf.toString('ascii', 0, 4) === 'RIFF'
    && buf.toString('ascii', 8, 12) === 'WEBP';
}

const byIdOrSlug = (v) =>
  mongoose.isValidObjectId(v) ? { _id: v } : { slug: v };

async function resolveGenres(slugs) {
  if (!Array.isArray(slugs) || !slugs.length) return [];
  const found = await Genre.find({ slug: { $in: slugs } }).select('_id');
  return found.map((g) => g._id);
}

/* ------------------------------------------------------------------ writing */

export async function create(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Ime izvođača je obavezno.' });

    const exists = await Artist.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });
    if (exists) return res.status(409).json({ message: 'Izvođač s tim imenom već postoji.' });

    const artist = await Artist.create({
      name,
      bio: String(req.body.bio || '').slice(0, 2000) || undefined,
      country: req.body.country ? String(req.body.country).toUpperCase() : undefined,
      genres: await resolveGenres(req.body.genres)
    });

    await AuditLog.record({
      req, action: 'create', entity: 'artist',
      entityId: artist._id, entityLabel: artist.name
    });

res.status(201).json({ artist: { ...artist.toCard(), bio: artist.bio } });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(err.errors)[0]?.message || 'Neispravni podaci.' });
    }
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const artist = await Artist.findOne(byIdOrSlug(req.params.identifier));
    if (!artist) return res.status(404).json({ message: 'Izvođač nije pronađen.' });

    const AUDITED = ['name', 'country', 'genres', 'origin', 'activeFrom', 'activeTo', 'website'];
    const before = Object.fromEntries(AUDITED.map((f) => [f, artist[f]]));

    if (typeof req.body.name === 'string' && req.body.name.trim()) artist.name = req.body.name.trim();
    if (typeof req.body.bio === 'string') artist.bio = req.body.bio.slice(0, 2000);
    if (req.body.country !== undefined) {
      artist.country = req.body.country ? String(req.body.country).toUpperCase() : undefined;
    }
    if (typeof req.body.origin === 'string') artist.origin = req.body.origin.trim().slice(0, 80);
    if (typeof req.body.website === 'string') artist.website = req.body.website.trim().slice(0, 200);
    // An empty string clears a year; absent leaves it alone.
    for (const field of ['activeFrom', 'activeTo']) {
      if (req.body[field] !== undefined) {
        artist[field] = req.body[field] === '' || req.body[field] === null
          ? undefined
          : Number(req.body[field]);
      }
    }
    if (req.body.genres !== undefined) artist.genres = await resolveGenres(req.body.genres);

    await artist.save();

    const changes = diff(before, Object.fromEntries(AUDITED.map((f) => [f, artist[f]])), AUDITED);
    if (changes.length) {
      await AuditLog.record({
        req, action: 'update', entity: 'artist',
        entityId: artist._id, entityLabel: artist.name, changes
      });
    }

    res.json({ artist: { ...artist.toCard(), bio: artist.bio } });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(err.errors)[0]?.message || 'Neispravni podaci.' });
    }
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const artist = await Artist.findOne(byIdOrSlug(req.params.identifier));
    if (!artist) return res.status(404).json({ message: 'Izvođač nije pronađen.' });

    const songs = await Song.countDocuments({ artist: artist._id });

    /*
     * Deleting an artist with songs would orphan every one of them, so it is
     * still refused — unless the caller has said, in the request, that the
     * songs go too.
     *
     * AI-DECISION: opt-in rather than a cascade by default. The refusal is what
     * stands between a mistyped id and a hundred songs off the site, and it
     * costs a caller who genuinely means it one query parameter. The count goes
     * back with the refusal so the interface can say the number out loud
     * instead of making somebody go and look it up.
     */
    const withSongs = req.query.withSongs === '1' || req.query.withSongs === 'true';
    if (songs && !withSongs) {
      return res.status(409).json({
        message: `Izvođač ima ${songs} pjesama. Prebaci ih ili obriši prije brisanja izvođača.`,
        songs
      });
    }

    /*
     * One timestamp for the artist and every song that went with them.
     *
     * AI-TRAP: this is what makes restoring exact. Songs already in the trash
     * before this delete keep their own, older stamp — the scoped updateMany
     * below only touches living rows — so restoring the artist brings back what
     * this act took and leaves everything else where it was. Without a shared
     * instant there is nothing to tell the two apart.
     */
    const when = new Date();

    let buried = 0;
    if (songs) {
      const result = await Song.updateMany(
        { artist: artist._id },
        { deletedAt: when, deletedBy: req.staff._id }
      );
      buried = result.modifiedCount;
    }

    artist.deletedAt = when;
    artist.deletedBy = req.staff._id;
    artist.songCount = 0;
    await artist.save();

    await AuditLog.record({
      req, action: 'delete', entity: 'artist',
      entityId: artist._id, entityLabel: artist.name,
      meta: buried ? { songs: buried } : undefined
    });

    res.json({ ok: true, songs: buried });
  } catch (err) { next(err); }
}

/**
 * Deleted artists, newest first.
 *
 * AI-DECISION: artists were the last thing in the tool that a delete destroyed
 * outright. Songs have had a bin and a way back for a while, and the asymmetry
 * was not a decision anybody made — it was simply never revisited. A soft delete
 * with nowhere to see it would be worse than a hard one, so this ships with the
 * bin rather than after it.
 */
export async function listTrash(req, res, next) {
  try {
    const artists = await Artist.find({ deletedAt: { $ne: null } })
      .populate('deletedBy', 'name')
      .sort({ deletedAt: -1 })
      .limit(100);

    res.json({ artists: artists.map((a) => ({ ...a.toCard(), deletedAt: a.deletedAt, deletedBy: a.deletedBy })) });
  } catch (err) { next(err); }
}

export async function restore(req, res, next) {
  try {
    const artist = await Artist.findOne(byIdOrSlug(req.params.identifier)).setOptions({ withDeleted: true });
    if (!artist) return res.status(404).json({ message: 'Izvođač nije pronađen.' });
    if (!artist.deletedAt) return res.status(409).json({ message: 'Izvođač nije obrisan.' });

    // Read before it is cleared: it is the key to the songs that fell with them.
    const when = artist.deletedAt;

    artist.deletedAt = null;
    artist.deletedBy = undefined;

    /*
     * Songs come back with the artist, and only the ones that went down with
     * them. Matching on the exact instant leaves anything deleted separately —
     * before or since — in the trash where somebody deliberately put it.
     */
    let revived = 0;
    if (when) {
      const result = await Song.updateMany(
        { artist: artist._id, deletedAt: when },
        { deletedAt: null, deletedBy: undefined }
      );
      revived = result.modifiedCount;
    }

    artist.songCount = await Song.countDocuments({ artist: artist._id });
    await artist.save();

    await AuditLog.record({
      req, action: 'restore', entity: 'artist',
      entityId: artist._id, entityLabel: artist.name,
      meta: revived ? { songs: revived } : undefined
    });

    res.json({ artist: artist.toCard(), songs: revived });
  } catch (err) { next(err); }
}

export async function purge(req, res, next) {
  try {
    const artist = await Artist.findOne(byIdOrSlug(req.params.identifier)).setOptions({ withDeleted: true });
    if (!artist) return res.status(404).json({ message: 'Izvođač nije pronađen.' });
    if (!artist.deletedAt) {
      return res.status(409).json({ message: 'Prvo obriši izvođača, pa ga onda možeš trajno ukloniti.' });
    }

    // Checked again rather than trusted: a song can be moved onto this artist
    // between the delete and the purge, and that would orphan it for good.
    const songs = await Song.countDocuments({ artist: artist._id });
    if (songs) {
      return res.status(409).json({
        message: `Izvođač ima ${songs} pjesama. Prebaci ih prije trajnog uklanjanja.`
      });
    }

    const label = artist.name;
    await artist.deleteOne();

    // The name is the only thing left once the document is gone, which is why
    // the log copies it in rather than referencing it.
    await AuditLog.record({
      req, action: 'purge', entity: 'artist',
      entityId: artist._id, entityLabel: label
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/* ------------------------------------------------------------------- image */

export async function uploadImage(req, res, next) {
  try {
    const artist = await Artist.findOne(byIdOrSlug(req.params.identifier));
    if (!artist) return res.status(404).json({ message: 'Izvođač nije pronađen.' });

    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) {
      return res.status(400).json({ message: 'Nedostaje slika.' });
    }
    if (buf.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({
        message: `Slika je ${(buf.length / 1024).toFixed(1)} KB; najviše je ${MAX_IMAGE_BYTES / 1024} KB.`
      });
    }
    if (!isWebp(buf)) {
      return res.status(415).json({ message: 'Slika mora biti u WebP formatu.' });
    }

    artist.image = buf;
    artist.imageType = 'image/webp';
    artist.imageBytes = buf.length;
    artist.imageUpdatedAt = new Date();
    await artist.save();

    await AuditLog.record({
      req, action: 'setImage', entity: 'artist',
      entityId: artist._id, entityLabel: artist.name, meta: { bytes: buf.length }
    });

    res.json({ ok: true, bytes: buf.length });
  } catch (err) { next(err); }
}

export async function deleteImage(req, res, next) {
  try {
    const artist = await Artist.findOne(byIdOrSlug(req.params.identifier));
    if (!artist) return res.status(404).json({ message: 'Izvođač nije pronađen.' });

    artist.image = undefined;
    artist.imageType = undefined;
    artist.imageBytes = 0;
    artist.imageUpdatedAt = null;
    await artist.save();

    await AuditLog.record({
      req, action: 'clearImage', entity: 'artist',
      entityId: artist._id, entityLabel: artist.name
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** Public. Cached hard, and revalidated by the update time rather than by guess. */
export async function serveImage(req, res, next) {
  try {
    const artist = await Artist.findOne(byIdOrSlug(req.params.identifier))
      .select('+image imageType imageBytes imageUpdatedAt');

    if (!artist?.image?.length) return res.status(404).end();

    const tag = `"${artist._id}-${artist.imageUpdatedAt?.getTime() || 0}"`;
    if (req.headers['if-none-match'] === tag) return res.status(304).end();

    res.set({
      'Content-Type': artist.imageType || 'image/webp',
      'Content-Length': artist.image.length,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
      ETag: tag
    });
    res.end(artist.image);
  } catch (err) { next(err); }
}
