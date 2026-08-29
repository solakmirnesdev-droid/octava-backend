import mongoose from 'mongoose';
import Song from '../models/Song.js';
import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';
import AuditLog from '../models/AuditLog.js';
import { detachSongs } from '../utils/songCleanup.js';

/**
 * Emptying the trash: the most destructive act the tool offers.
 *
 * AI-DECISION: one endpoint for both tabs rather than one per tab, and songs
 * are always purged before artists. artistAdminController's purge guards
 * against orphaning by counting an artist's songs — but `Song.countDocuments`
 * is scoped to living rows, so an artist whose entire catalogue sits in the
 * trash counts zero and purges cleanly, leaving those songs pointing at nothing
 * for good. Ordering is the fix, and ordering is not something a client should
 * be trusted to get right on a button that cannot be undone.
 */

/** GET /api/trash/count — what emptying would destroy, for the dialog. */
export async function count(_req, res, next) {
  try {
    const songs = await Song.countDocuments({ deletedAt: { $ne: null } });
    const artists = await Artist.countDocuments({ deletedAt: { $ne: null } })
      .setOptions({ withDeleted: true });

    res.json({ songs, artists, total: songs + artists });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/trash — purge everything currently in it. */
export async function empty(req, res, next) {
  try {
    const songs = await Song.find({ deletedAt: { $ne: null } })
      .setOptions({ withDeleted: true })
      .select('_id title');

    const songIds = songs.map((s) => s._id);
    const removed = songIds.length ? await detachSongs(songIds) : null;

    if (songIds.length) {
      // deleteMany is not among the soft-delete scoped hooks, so this is a real
      // delete of exactly the ids gathered above and nothing else.
      await Song.deleteMany({ _id: { $in: songIds } });
    }

    const artists = await Artist.find({ deletedAt: { $ne: null } })
      .setOptions({ withDeleted: true })
      .select('_id name');

    /*
     * Re-checked after the songs are gone, not assumed. A living song can be
     * moved onto a deleted artist at any moment, and purging that artist would
     * orphan it — the same guard the single-artist purge makes, kept here
     * rather than dropped because this path handles many at once.
     */
    const purgeable = [];
    const kept = [];
    for (const artist of artists) {
      const left = await Song.countDocuments({ artist: artist._id })
        .setOptions({ withDeleted: true });
      if (left) kept.push({ name: artist.name, songs: left });
      else purgeable.push(artist);
    }

    if (purgeable.length) {
      await Artist.deleteMany({ _id: { $in: purgeable.map((a) => a._id) } });
    }

    // Counters exclude deleted rows already, so purging cannot change them —
    // but they are cheap to recompute and expensive to notice when wrong.
    for (const g of await Genre.find()) {
      await Genre.updateOne({ _id: g._id }, { songCount: await Song.countDocuments({ genres: g._id }) });
    }

    /*
     * One entry, not three hundred. The log is read by a person looking for
     * what happened, and a flood of identical rows buries every other act of
     * the same day — the titles go into meta instead, capped.
     */
    await AuditLog.record({
      req,
      action: 'purge',
      entity: 'trash',
      entityId: new mongoose.Types.ObjectId(),
      entityLabel: `${songs.length} pjesama, ${purgeable.length} izvodjaca`,
      meta: {
        songs: songs.length,
        artists: purgeable.length,
        kept: kept.length ? kept : undefined,
        ...removed,
        titles: songs.slice(0, 50).map((s) => s.title)
      }
    });

    res.json({
      songs: songs.length,
      artists: purgeable.length,
      kept,
      removed: removed || {}
    });
  } catch (err) {
    next(err);
  }
}
