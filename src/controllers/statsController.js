import Song from '../models/Song.js';
import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';
import User from '../models/User.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

/** Totals across the catalogue, for the cards at the top of the dashboard. */
export async function overview(_req, res, next) {
  try {
    const [totals, songs, artists, genres, users] = await Promise.all([
      Song.aggregate([
        {
          $group: {
            _id: null,
            views: { $sum: '$views' },
            favorites: { $sum: '$favoriteCount' },
            published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
            drafts: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } }
          }
        }
      ]),
      Song.countDocuments(),
      Artist.countDocuments({ songCount: { $gt: 0 } }),
      Genre.countDocuments(),
      User.countDocuments()
    ]);

    const sums = totals[0] || { views: 0, favorites: 0, published: 0, drafts: 0 };

    res.json({
      songs, artists, genres, users,
      published: sums.published,
      drafts: sums.drafts,
      views: sums.views,
      favorites: sums.favorites,
      // How often a view turns into a save. The single number that says
      // whether a chart is worth reading rather than just being found.
      saveRate: sums.views ? sums.favorites / sums.views : 0
    });
  } catch (err) {
    next(err);
  }
}

const SORTS = {
  views: { views: -1, favoriteCount: -1 },
  favorites: { favoriteCount: -1, views: -1 },
  // Songs people keep, relative to how often they are found. Surfaces good
  // charts that simply are not being seen yet.
  rate: null,
  recent: { createdAt: -1 }
};

export async function songs(req, res, next) {
  try {
    const paging = readPaging(req.query);
    const key = SORTS[req.query.sort] !== undefined ? req.query.sort : 'views';

    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    let list;
    let total;

    if (key === 'rate') {
      // Ratio has to be computed to be sorted on, so this path aggregates.
      // A floor on views keeps a single view with a single save off the top.
      const MIN_VIEWS = 20;
      const pipeline = [
        { $match: { ...filter, views: { $gte: MIN_VIEWS } } },
        { $addFields: { rate: { $divide: ['$favoriteCount', '$views'] } } },
        { $sort: { rate: -1, views: -1 } }
      ];

      const [rows, counted] = await Promise.all([
        Song.aggregate([...pipeline, { $skip: paging.skip }, { $limit: paging.limit }]),
        Song.countDocuments({ ...filter, views: { $gte: MIN_VIEWS } })
      ]);

      list = await Song.populate(rows, { path: 'artist', select: 'name slug' });
      total = counted;
    } else {
      [list, total] = await Promise.all([
        Song.find(filter)
          .select('title slug artist views favoriteCount status createdAt')
          .populate('artist', 'name slug')
          .sort(SORTS[key])
          .skip(paging.skip)
          .limit(paging.limit),
        Song.countDocuments(filter)
      ]);
    }

    res.json({
      songs: list.map((s) => ({
        _id: s._id,
        title: s.title,
        slug: s.slug,
        artist: s.artist ? { name: s.artist.name, slug: s.artist.slug } : null,
        views: s.views || 0,
        favorites: s.favoriteCount || 0,
        saveRate: s.views ? (s.favoriteCount || 0) / s.views : 0,
        status: s.status
      })),
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}
