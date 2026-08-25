import Song from '../models/Song.js';
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

export async function addFavorite(req, res, next) {
  try {
    // $addToSet rather than push, so a double-tap cannot duplicate the entry.
    const result = await req.user.updateOne({ $addToSet: { favorites: req.params.songId } });

    // Only move the counter when the set actually changed, or a double-tap
    // would inflate it.
    if (result.modifiedCount) {
      await Song.updateOne({ _id: req.params.songId }, { $inc: { favoriteCount: 1 } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function removeFavorite(req, res, next) {
  try {
    const result = await req.user.updateOne({ $pull: { favorites: req.params.songId } });

    if (result.modifiedCount) {
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
