import Genre from '../models/Genre.js';
import Song from '../models/Song.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

export async function list(_req, res, next) {
  try {
    const genres = await Genre.find().sort({ kind: 1, order: 1, name: 1 });

    // Grouped so the UI can render "Regija" and "Žanr" as separate rows
    // without needing to know the vocabulary in advance.
    const grouped = genres.reduce((acc, g) => {
      (acc[g.kind] ||= []).push(g);
      return acc;
    }, {});

    res.json({ genres, grouped });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const genre = await Genre.findOne({ slug: req.params.slug });
    if (!genre) return res.status(404).json({ message: 'Rubrika nije pronađena.' });

    const paging = readPaging(req.query);
    const filter = {
      genres: genre._id,
      ...(req.user && req.user.role !== 'user' ? {} : { status: 'published' })
    };

    const sort = req.query.sort === 'popular'
      ? { views: -1, title: 1 }
      : req.query.sort === 'title' ? { title: 1 } : { createdAt: -1 };

    const [songs, total] = await Promise.all([
      Song.find(filter)
        .populate('artist', 'name slug')
        .sort(sort)
        .skip(paging.skip)
        .limit(paging.limit),
      Song.countDocuments(filter)
    ]);

    res.json({
      genre,
      songs: songs.map((s) => s.toPublic()),
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}
