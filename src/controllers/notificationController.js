import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

/**
 * The dashboard's activity feed.
 *
 * Read state lives in `readBy` on the shared row rather than in per-member
 * copies, so one event is one row no matter how big the desk gets. The cost is
 * that "unread" is an array membership test, which is why readBy is indexed.
 */

export async function list(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const filter = req.query.unread === 'true' ? { readBy: { $ne: req.staff._id } } : {};

    const [rows, total, unread] = await Promise.all([
      Notification.find(filter)
        .populate('song', 'title slug')
        .populate('actor', 'username')
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ readBy: { $ne: req.staff._id } })
    ]);

    res.json({
      items: rows.map((n) => ({
        _id: n._id,
        type: n.type,
        summary: n.summary,
        song: n.song,
        review: n.review,
        comment: n.comment,
        request: n.request,
        actor: n.actor?.username || null,
        /*
         * The desk member behind a desk event, and their rank.
         *
         * AI-NOTE: read off the row rather than populated. They are copied in
         * at write time so the line still reads correctly after the account is
         * gone - see Notification.js.
         */
        actorName: n.actorName || null,
        actorRole: n.actorRole || null,
        createdAt: n.createdAt,
        read: n.readBy.some((id) => String(id) === String(req.staff._id))
      })),
      total, page, unread,
      pages: Math.max(Math.ceil(total / limit), 1)
    });
  } catch (err) { next(err); }
}

export async function unreadCount(req, res, next) {
  try {
    res.json({ unread: await Notification.countDocuments({ readBy: { $ne: req.staff._id } }) });
  } catch (err) { next(err); }
}

export async function markRead(req, res, next) {
  try {
    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.filter((id) => mongoose.isValidObjectId(id))
      : null;

    // $addToSet, not $push: marking the same row read twice is a normal thing
    // for two open tabs to do, and must not grow the array.
    const filter = ids ? { _id: { $in: ids } } : {};
    const result = await Notification.updateMany(filter, { $addToSet: { readBy: req.staff._id } });

    res.json({ ok: true, updated: result.modifiedCount });
  } catch (err) { next(err); }
}
