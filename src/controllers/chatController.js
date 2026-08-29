import mongoose from 'mongoose';
import ChatMessage from '../models/ChatMessage.js';
import Staff from '../models/Staff.js';
import { whoIsOnline } from '../realtime/chat.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

/**
 * The chat's REST half.
 *
 * AI-DECISION: presence and history are read over HTTP even though a socket
 * carries both. The page has to render before the socket finishes its
 * handshake, and a list that appears empty and then fills in a second later
 * reads as a broken chat rather than a connecting one.
 */

/** GET /api/chat/peers — everyone else at the desk, and what they have said. */
export async function peers(req, res, next) {
  try {
    const meId = String(req.staff._id);

    const staff = await Staff.find({ _id: { $ne: req.staff._id }, active: { $ne: false } })
      .select('name email role')
      .sort({ name: 1 })
      .lean();

    const online = new Set(whoIsOnline());

    // One pass for unread, one for the newest line of each thread. Both are
    // grouped rather than run per peer: four accounts today, but a query per
    // row is the shape that stops working at forty.
    const [unread, latest] = await Promise.all([
      ChatMessage.aggregate([
        { $match: { to: req.staff._id, readAt: null } },
        { $group: { _id: '$from', n: { $sum: 1 } } }
      ]),
      ChatMessage.aggregate([
        { $match: { pair: { $in: staff.map((s) => ChatMessage.pairOf(meId, s._id)) } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$pair', body: { $first: '$body' }, at: { $first: '$createdAt' }, from: { $first: '$from' } } }
      ])
    ]);

    const unreadBy = new Map(unread.map((u) => [String(u._id), u.n]));
    const lastByPair = new Map(latest.map((l) => [l._id, l]));

    res.json({
      me: meId,
      peers: staff.map((s) => {
        const last = lastByPair.get(ChatMessage.pairOf(meId, s._id));
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          role: s.role,
          online: online.has(String(s._id)),
          unread: unreadBy.get(String(s._id)) || 0,
          last: last ? { body: last.body, at: last.at, mine: String(last.from) === meId } : null
        };
      })
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/chat/with/:staffId — one thread, oldest last page first. */
export async function thread(req, res, next) {
  try {
    const { staffId } = req.params;
    if (!mongoose.isValidObjectId(staffId)) {
      return res.status(400).json({ message: 'Neispravan sagovornik.' });
    }

    const paging = readPaging(req.query);
    const pair = ChatMessage.pairOf(req.staff._id, staffId);

    /*
     * Newest first out of the database, reversed before sending.
     *
     * AI-TRAP: page one of a conversation is its END, not its beginning. Sorted
     * oldest-first the first page is whatever was said months ago, and the
     * reader has to page to the last one to see what was just written.
     */
    const [rows, total] = await Promise.all([
      ChatMessage.find({ pair })
        .sort({ createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .lean(),
      ChatMessage.countDocuments({ pair })
    ]);

    res.json({ messages: rows.reverse(), meta: pageMeta(total, paging) });
  } catch (err) {
    next(err);
  }
}
