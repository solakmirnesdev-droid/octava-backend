import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';
import Song from '../models/Song.js';
import { readPaging, pageMeta } from '../utils/pagination.js';
import { slugify } from '../utils/slug.js';

/** Escapes user input before it is used inside a RegExp. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function list(req, res, next) {
  try {
    const paging = readPaging(req.query);
    const filter = {};

    if (req.query.genre) {
      const genre = await Genre.findOne({ slug: req.query.genre });
      if (!genre) return res.json({ artists: [], letters: [], meta: pageMeta(0, paging) });
      filter.genres = genre._id;
    }

    if (req.query.q) {
      filter.name = new RegExp(escapeRegex(req.query.q.trim()), 'i');
    }

    // Alphabet navigation matches on the slug, so Č and C land together rather
    // than Č being filed after Z where nobody looks for it.
    if (req.query.letter) {
      const letter = slugify(req.query.letter).charAt(0);
      if (letter) filter.slug = new RegExp('^' + letter, 'i');
    }

    const [artists, total, letters] = await Promise.all([
      Artist.find(filter).populate('genres', 'name slug').sort({ name: 1 })
        .skip(paging.skip).limit(paging.limit),
      Artist.countDocuments(filter),
      // Which initials actually have artists, so the UI can grey out the rest.
      Artist.aggregate([
        { $group: { _id: { $toUpper: { $substrCP: ['$slug', 0, 1] } } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      artists,
      letters: letters.map((l) => l._id).filter((l) => /^[A-Z]$/.test(l)),
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const artist = await Artist.findOne({ slug: req.params.slug })
      .populate('genres', 'name slug');
    if (!artist) return res.status(404).json({ message: 'Izvođač nije pronađen.' });

    const filter = {
      artist: artist._id,
      ...(req.user && req.user.role !== 'user' ? {} : { status: 'published' })
    };

    const songs = await Song.find(filter)
      .populate('artist', 'name slug')
      .populate('genres', 'name slug')
      .sort({ title: 1 });

    res.json({
      artist: { ...artist.toObject(), songs: songs.map((s) => s.toPublic()) }
    });
  } catch (err) {
    next(err);
  }
}
