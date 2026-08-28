import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';
import Song from '../models/Song.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

export async function list(_req, res, next) {
  try {
    /**
     * Only rubrics that lead somewhere.
     *
     * AI-DECISION: an empty rubric in the navigation is a promise the site
     * cannot keep — "Strana" sat there with nothing behind it, and every visitor
     * who tried it got an empty page. The row reappears on its own the moment a
     * song is filed under it. See AI-NOTES.md §5.
     */
    const genres = await Genre.find({ songCount: { $gt: 0 } }).sort({ kind: 1, order: 1, name: 1 });

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
      ...(req.staff ? {} : { status: 'published' })
    };

    const sort = req.query.sort === 'popular'
      ? { views: -1, title: 1 }
      : req.query.sort === 'title' ? { title: 1 } : { createdAt: -1 };

    const [songs, total, topArtists, spotlightSongs, relatedGenres, artistCount] = await Promise.all([
      Song.find(filter)
        .populate('artist', 'name slug country imageBytes')
        .sort(sort)
        .skip(paging.skip)
        .limit(paging.limit),
      Song.countDocuments(filter),
      Artist.find({ genres: genre._id })
        .sort({ songCount: -1, name: 1 })
        .limit(6),
      Song.find({ genres: genre._id, status: 'published' })
        .populate('artist', 'name slug country imageBytes')
        .sort({ views: -1 })
        .limit(3),
      Genre.find({ _id: { $ne: genre._id }, songCount: { $gt: 0 } })
        .sort({ order: 1, name: 1 })
        .limit(6),
      Artist.countDocuments({ genres: genre._id })
    ]);

    res.json({
      genre,
      songs: songs.map((s) => s.toPublic()),
      topArtists: topArtists.map((a) => a.toCard()),
      spotlight: spotlightSongs.map((s) => s.toPublic()),
      relatedGenres: relatedGenres.map((g) => ({ _id: g._id, name: g.name, slug: g.slug, songCount: g.songCount })),
      stats: {
        totalSongs: total,
        totalArtists: artistCount
      },
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}
