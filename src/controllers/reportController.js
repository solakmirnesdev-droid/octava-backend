import mongoose from 'mongoose';
import SongReport from '../models/SongReport.js';
import Notification from '../models/Notification.js';
import Song from '../models/Song.js';

/**
 * Reports that a chart is wrong, and the desk's queue for them.
 *
 * Reading is staff-only: a public list of "songs someone says are broken" is a
 * list of pages not to trust, which is not what a reader needs on the way to
 * playing something.
 */

const byIdOrSlug = (identifier) =>
  mongoose.isValidObjectId(identifier) ? { _id: identifier } : { slug: identifier };

const KINDS = ['chords', 'lyrics', 'key', 'duplicate', 'other'];

export async function create(req, res, next) {
  try {
    const kind = String(req.body.kind || '');
    if (!KINDS.includes(kind)) {
      return res.status(400).json({ message: 'Nepoznata vrsta prijave.' });
    }

    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
    // 'other' says nothing on its own; the note is the whole report.
    if (kind === 'other' && !note) {
      return res.status(400).json({ message: 'Uz „ostalo" je opis obavezan.' });
    }

    const song = await Song.findOne({ ...byIdOrSlug(req.params.identifier), status: 'published' })
      .select('_id title');
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const report = await SongReport.create({
      song: song._id,
      arrangement: mongoose.isValidObjectId(req.body.arrangementId) ? req.body.arrangementId : null,
      user: req.user._id,
      kind,
      note
    });

    await Notification.raise({
      type: 'report.created',
      song: song._id,
      report: report._id,
      actor: req.user._id,
      summary: `${song.title} — ${kind}${note ? ': ' + note.slice(0, 100) : ''}`
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Već si prijavio ovu pjesmu; prijava još čeka.' });
    }
    next(err);
  }
}

/* -------------------------------------------------------------- dashboard */

export async function list(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const filter = ['open', 'resolved', 'rejected'].includes(req.query.status)
      ? { status: req.query.status }
      : { status: 'open' };

    const [items, total, open] = await Promise.all([
      SongReport.find(filter)
        .populate('song', 'title slug')
        .populate('user', 'username email')
        .populate('resolvedBy', 'name')
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      SongReport.countDocuments(filter),
      SongReport.countDocuments({ status: 'open' })
    ]);

    res.json({ items, total, open, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) { next(err); }
}

export async function resolve(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Prijava nije pronađena.' });
    }
    const status = req.body.status === 'rejected' ? 'rejected' : 'resolved';

    const report = await SongReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Prijava nije pronađena.' });

    report.status = status;
    report.resolvedBy = req.staff._id;
    report.resolvedAt = new Date();
    report.resolution = typeof req.body.resolution === 'string'
      ? req.body.resolution.trim().slice(0, 500) : '';
    await report.save();

    res.json({ ok: true, status });
  } catch (err) { next(err); }
}
