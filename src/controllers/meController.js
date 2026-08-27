import mongoose from 'mongoose';
import Song from '../models/Song.js';
import Artist from '../models/Artist.js';
import User from '../models/User.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

export async function listFavorites(req, res, next) {
  try {
    const paging = readPaging(req.query);
    const filter = { _id: { $in: req.user.favorites }, status: 'published' };

    const [songs, total] = await Promise.all([
      Song.find(filter)
        .populate('artist', 'name slug')
        .sort({ title: 1 })
        .skip(paging.skip)
        .limit(paging.limit),
      Song.countDocuments(filter)
    ]);

    res.json({ songs: songs.map((s) => s.toPublic()), meta: pageMeta(total, paging) });
  } catch (err) {
    next(err);
  }
}

/**
 * AI-TRAP: the "already saved?" test belongs in the filter, not in the result.
 *
 * This used to run $addToSet and then trust `modifiedCount` to say whether
 * anything changed. It never says no: the schema carries timestamps, so every
 * update writes `updatedAt` and Mongo reports the document as modified even
 * when the array is untouched. A double-tap therefore inflated favoriteCount
 * while the array stayed correct — a counter drifting away from the thing it
 * counts, with nothing in the data to show where it went wrong.
 *
 * Excluding the id in the filter makes the write itself conditional, so
 * matchedCount answers the question honestly and does it atomically.
 */
export async function addFavorite(req, res, next) {
  try {
    const result = await User.updateOne(
      { _id: req.user._id, favorites: { $ne: req.params.songId } },
      { $addToSet: { favorites: req.params.songId } }
    );

    if (result.matchedCount) {
      await Song.updateOne({ _id: req.params.songId }, { $inc: { favoriteCount: 1 } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function removeFavorite(req, res, next) {
  try {
    // Same shape as adding: the filter decides, not the result.
    const result = await User.updateOne(
      { _id: req.user._id, favorites: req.params.songId },
      { $pull: { favorites: req.params.songId } }
    );

    if (result.matchedCount) {
      // Guarded, so a stale request cannot drive the count below zero.
      await Song.updateOne(
        { _id: req.params.songId, favoriteCount: { $gt: 0 } },
        { $inc: { favoriteCount: -1 } }
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/* ------------------------------------------------------------------ artists */

/**
 * Saved artists.
 *
 * AI-NOTE: mirrors the song functions above deliberately rather than being
 * generalised with them. The two differ in what they populate and how they
 * sort, and a shared helper taking a model plus three options would be longer
 * than the duplication and harder to read at the call site.
 */
export async function listFavoriteArtists(req, res, next) {
  try {
    const paging = readPaging(req.query);
    const filter = { _id: { $in: req.user.favoriteArtists } };

    const [artists, total] = await Promise.all([
      Artist.find(filter).sort({ name: 1 }).skip(paging.skip).limit(paging.limit),
      Artist.countDocuments(filter)
    ]);

    res.json({ artists: artists.map((a) => a.toCard()), meta: pageMeta(total, paging) });
  } catch (err) {
    next(err);
  }
}

export async function addFavoriteArtist(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.artistId)) {
      return res.status(404).json({ message: 'Izvođač nije pronađen.' });
    }
    if (!(await Artist.exists({ _id: req.params.artistId }))) {
      return res.status(404).json({ message: 'Izvođač nije pronađen.' });
    }

    // The filter carries the "not already saved" test — see addFavorite above
    // for why the result cannot be trusted to say so.
    const result = await User.updateOne(
      { _id: req.user._id, favoriteArtists: { $ne: req.params.artistId } },
      { $addToSet: { favoriteArtists: req.params.artistId } }
    );

    if (result.matchedCount) {
      await Artist.updateOne({ _id: req.params.artistId }, { $inc: { favoriteCount: 1 } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function removeFavoriteArtist(req, res, next) {
  try {
    const result = await User.updateOne(
      { _id: req.user._id, favoriteArtists: req.params.artistId },
      { $pull: { favoriteArtists: req.params.artistId } }
    );

    if (result.matchedCount) {
      // Guarded, so a stale request cannot drive the count below zero.
      await Artist.updateOne(
        { _id: req.params.artistId, favoriteCount: { $gt: 0 } },
        { $inc: { favoriteCount: -1 } }
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
