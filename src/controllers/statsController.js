import Song from '../models/Song.js';
import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';
import User from '../models/User.js';
import Review from '../models/Review.js';
import Rating from '../models/Rating.js';
import SongRequest from '../models/SongRequest.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

/** Totals across the catalogue, for the cards at the top of the dashboard. */
export async function overview(_req, res, next) {
  try {
    const [totals, songs, artists, genres, users] = await Promise.all([
      Song.aggregate([
        // Aggregations bypass the soft-delete query hook; exclude the trash here.
        { $match: Song.livingMatch() },
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

    /*
     * The small numbers, which are the true ones.
     *
     * AI-DECISION: shown beside the traffic figure rather than instead of it.
     * Ninety-six ratings from twenty-one readers is a real thing that happened;
     * 2.8 million views is not, and putting them side by side is what makes
     * that visible without anyone having to know how the catalogue was seeded.
     */
    const [reviews, ratings, requests] = await Promise.all([
      Review.countDocuments(),
      Rating.countDocuments(),
      SongRequest.countDocuments()
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
      saveRate: sums.views ? sums.favorites / sums.views : 0,
      reviews, ratings, requests,
      health: await health(),
      seeded: await seeded()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * What share of the catalogue a guitarist can actually use.
 *
 * AI-DECISION: this is the number the dashboard was missing, and the reason
 * the rest of the page read as flattery. A count of published songs says 1569;
 * all but a couple of dozen of them are a title with either nothing under it or
 * placeholder words, and no card on the screen said so. A songbook's health is
 * not how many rows it has.
 *
 * AI-TRAP: an arrangement's deletedAt is often MISSING, not null. The field was
 * added after most of the catalogue was written, and seeded rows never got it,
 * so `$eq: ['$$a.deletedAt', null]` is false for them inside $filter and drops
 * every arrangement they have. It reported 22 playable songs out of 2878 —
 * plausible enough to have been believed. $ifNull is what makes missing and
 * null the same answer, which is what the soft delete means.
 *
 * AI-TRAP: chords and tags each answer half of it and neither answers it alone.
 * `bez-akorda` songs have no chords at all, but the lorem ones DO — their
 * progressions were generated, so counting chord presence marks them playable.
 * The `demo` tag is the only thing separating generated filler from a chart
 * somebody checked. Both are read here; drop either and the number flatters.
 */
async function health() {
  const [rows] = await Song.aggregate([
    { $match: Song.livingMatch() },
    {
      $project: {
        status: 1,
        tags: 1,
        hasChords: {
          $gt: [
            {
              $size: {
                $reduce: {
                  input: { $filter: { input: '$arrangements', as: 'a', cond: { $eq: [{ $ifNull: ['$$a.deletedAt', null] }, null] } } },
                  initialValue: [],
                  in: { $concatArrays: ['$$value', { $ifNull: ['$$this.chords', []] }] }
                }
              }
            },
            0
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        withChords: { $sum: { $cond: ['$hasChords', 1, 0] } },
        placeholder: { $sum: { $cond: [{ $in: ['demo', '$tags'] }, 1, 0] } },
        needsReview: { $sum: { $cond: [{ $in: ['treba-provjeru', '$tags'] }, 1, 0] } },
        playable: {
          $sum: { $cond: [{ $and: ['$hasChords', { $not: { $in: ['demo', '$tags'] } }] }, 1, 0] }
        }
      }
    }
  ]);

  const h = rows || { total: 0, withChords: 0, placeholder: 0, needsReview: 0, playable: 0 };

  return {
    total: h.total,
    playable: h.playable,
    placeholder: h.placeholder,
    // Everything with no chords under it at all, however it got that way.
    empty: h.total - h.withChords,
    needsReview: h.needsReview,
    share: h.total ? h.playable / h.total : 0
  };
}

/**
 * How much of the traffic figure was invented.
 *
 * AI-TRAP: the seed scripts assign `views: Math.floor(rand() * 5000)`, so the
 * catalogue reports millions of reads that never happened and the most-viewed
 * list is sorted by a random number — every bar the same length, which is what
 * gave it away. Reporting the seeded share lets the page say so out loud
 * instead of dressing it up, and the warning disappears on its own once the
 * placeholder rows are gone.
 */
async function seeded() {
  const [rows] = await Song.aggregate([
    { $match: Song.livingMatch({ tags: 'demo' }) },
    { $group: { _id: null, views: { $sum: '$views' }, songs: { $sum: 1 } } }
  ]);

  return { views: rows?.views || 0, songs: rows?.songs || 0 };
}

/**
 * Where the catalogue is thinnest: artists holding the most songs with no
 * chords under them.
 *
 * This is the page's one actionable list. Everything else describes what has
 * happened; this says what to do next, in the order that clears the most.
 */
export async function gaps(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 15, 50);

    const rows = await Song.aggregate([
      { $match: Song.livingMatch() },
      {
        $project: {
          artist: 1,
          empty: {
            $eq: [
              {
                $size: {
                  $reduce: {
                    input: { $filter: { input: '$arrangements', as: 'a', cond: { $eq: [{ $ifNull: ['$$a.deletedAt', null] }, null] } } },
                    initialValue: [],
                    in: { $concatArrays: ['$$value', { $ifNull: ['$$this.chords', []] }] }
                  }
                }
              },
              0
            ]
          }
        }
      },
      { $group: { _id: '$artist', songs: { $sum: 1 }, empty: { $sum: { $cond: ['$empty', 1, 0] } } } },
      { $match: { empty: { $gt: 0 } } },
      { $sort: { empty: -1, songs: -1 } },
      { $limit: limit }
    ]);

    const withNames = await Artist.populate(rows, { path: '_id', select: 'name slug' });

    res.json({
      artists: withNames
        // An artist deleted between the aggregation and the populate resolves
        // to null, and a row with no name is a row nobody can act on.
        .filter((r) => r._id)
        .map((r) => ({
          _id: r._id._id,
          name: r._id.name,
          slug: r._id.slug,
          songs: r.songs,
          empty: r.empty,
          share: r.songs ? r.empty / r.songs : 0
        }))
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
        { $match: Song.livingMatch({ ...filter, views: { $gte: MIN_VIEWS } }) },
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
