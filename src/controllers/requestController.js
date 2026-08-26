import SongRequest from '../models/SongRequest.js';
import Notification from '../models/Notification.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

export async function list(req, res, next) {
  try {
    const paging = readPaging(req.query);

    // Editors can inspect any state; visitors only see what is still wanted.
    const filter = req.staff
      ? (req.query.status ? { status: req.query.status } : {})
      : { status: { $in: ['open', 'in_progress'] } };

    const [requests, total] = await Promise.all([
      SongRequest.find(filter)
        .populate('fulfilledBy', 'title slug')
        .sort({ votes: -1, createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit),
      SongRequest.countDocuments(filter)
    ]);

    res.json({
      requests: requests.map((r) => shape(r, req.user)),
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}

/** Voter ids are not public; only whether *this* reader has voted. */
function shape(request, user) {
  const doc = request.toObject();
  const voted = Boolean(user && request.voters.some((id) => id.equals(user._id)));
  delete doc.voters;
  return { ...doc, voted };
}

export async function create(req, res, next) {
  try {
    const { title, artist, note } = req.body;
    if (!title?.trim() || !artist?.trim()) {
      return res.status(400).json({ message: 'Naslov i izvođač su obavezni.' });
    }

    const key = SongRequest.buildKey(artist, title);
    const existing = await SongRequest.findOne({ key });

    // Asking for something already requested is a vote, not a duplicate.
    if (existing) {
      if (req.user && !existing.voters.some((id) => id.equals(req.user._id))) {
        existing.voters.push(req.user._id);
        existing.votes += 1;
        await existing.save();
      }

      await Notification.raise({
        type: 'request.voted',
        request: existing._id,
        actor: req.user?._id || null,
        summary: `${existing.artist} — ${existing.title} (${existing.votes} glasova)`
      });
      return res.status(200).json({
        request: shape(existing, req.user),
        alreadyRequested: true
      });
    }

    const request = await SongRequest.create({
      title: title.trim(),
      artist: artist.trim(),
      note: note?.trim(),
      requestedBy: req.user?._id,
      voters: req.user ? [req.user._id] : []
    });

    await Notification.raise({
      type: 'request.created',
      request: request._id,
      actor: req.user?._id || null,
      summary: `${request.artist} — ${request.title}${request.note ? ': ' + request.note.slice(0, 80) : ''}`
    });

    res.status(201).json({ request: shape(request, req.user), alreadyRequested: false });
  } catch (err) {
    next(err);
  }
}

export async function vote(req, res, next) {
  try {
    const request = await SongRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Zahtjev nije pronađen.' });

    const already = request.voters.some((id) => id.equals(req.user._id));
    if (already) {
      request.voters.pull(req.user._id);
      request.votes = Math.max(0, request.votes - 1);
    } else {
      request.voters.push(req.user._id);
      request.votes += 1;
    }
    await request.save();

    // Only a vote cast, never one withdrawn: the desk reads this as demand,
    // and somebody changing their mind is not demand.
    if (!already) {
      await Notification.raise({
        type: 'request.voted',
        request: request._id,
        actor: req.user._id,
        summary: `${request.artist} — ${request.title} (${request.votes} glasova)`
      });
    }

    res.json({ request: shape(request, req.user) });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { status, fulfilledBy } = req.body;
    const request = await SongRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Zahtjev nije pronađen.' });

    if (status) request.status = status;
    if (fulfilledBy !== undefined) request.fulfilledBy = fulfilledBy || null;
    await request.save();

    res.json({ request: shape(request, null) });
  } catch (err) {
    next(err);
  }
}
