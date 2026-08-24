import Song from '../models/Song.js';

export async function listFavorites(req, res, next) {
  try {
    const songs = await Song.find({ _id: { $in: req.user.favorites }, status: 'published' })
      .populate('artist', 'name slug');

    res.json({ songs: songs.map((s) => s.toPublic()) });
  } catch (err) {
    next(err);
  }
}

export async function addFavorite(req, res, next) {
  try {
    // $addToSet rather than push, so a double-tap cannot duplicate the entry.
    await req.user.updateOne({ $addToSet: { favorites: req.params.songId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function removeFavorite(req, res, next) {
  try {
    await req.user.updateOne({ $pull: { favorites: req.params.songId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
