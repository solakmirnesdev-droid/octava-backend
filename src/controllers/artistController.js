import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';
import Song from '../models/Song.js';
import { readPaging, pageMeta } from '../utils/pagination.js';
import { slugify } from '../utils/slug.js';
import { visibilityFilter } from '../utils/visibility.js';

/** Escapes user input before it is used inside a RegExp. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * How many songs of each artist a reader can actually open.
 *
 * AI-TRAP: `Artist.songCount` is not that number. It is a denormalised counter
 * bumped once per song created, drafts included — and this catalogue is mostly
 * drafts, so the list promised "30 songs" for an artist whose page then showed
 * ten. The counter is not wrong for what it counts; it is the wrong thing to
 * show a visitor. Computed here instead of maintained, because a count that is
 * derived cannot drift out of step with the rows it describes.
 */
/** Artists have no draft state; the only thing hidden is a deleted one. */
function visibilityFilterForArtists() {
  return {};
}

async function visibleCounts(ids, staff) {
  const rows = await Song.aggregate([
    { $match: { ...visibilityFilter(staff), artist: { $in: ids } } },
    { $group: { _id: '$artist', n: { $sum: 1 } } }
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

/**
 * The counts a roster screen needs, without downloading the roster.
 *
 * AI-DECISION: one aggregate instead of the dashboard paging through every
 * artist to tally them in the browser. That cost 29 requests and 1.1MB on a
 * catalogue of 2,813, and the browser threw all of it away except three
 * numbers and a list of countries.
 *
 * AI-TRAP: "no country" and "no picture" each have three shapes in this data —
 * absent, null and empty string — because the fields were added at different
 * times and written by different importers. Counting only the absent ones
 * under-reports the pile somebody is trying to work through.
 */
export async function facets(_req, res, next) {
  try {
    /*
     * AI-TRAP: destructure the aggregate's FIRST DOCUMENT, not the first
     * promise. `const [rows] = await Promise.all([...])` binds the result
     * array, which is truthy, so the `||` fallback never fires and every count
     * reads as undefined — and JSON.stringify drops undefined keys silently.
     * The endpoint answered 200 with the countries present and the totals
     * simply absent.
     */
    const [totals = { total: 0, withoutCountry: 0, withoutImage: 0 }] = await Artist.aggregate([
        { $match: { deletedAt: null } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            withoutCountry: {
              $sum: { $cond: [{ $in: [{ $ifNull: ['$country', ''] }, ['', null]] }, 1, 0] }
            },
            withoutImage: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: [{ $ifNull: ['$imageBytes', 0] }, 0] },
                      { $in: [{ $ifNull: ['$imageUrl', ''] }, ['', null]] }
                    ]
                  },
                  1, 0
                ]
              }
            }
          }
        }
    ]);

    const countries = await Artist.aggregate([
      { $match: { deletedAt: null, country: { $nin: [null, ''] } } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      total: totals.total,
      withoutCountry: totals.withoutCountry,
      withoutImage: totals.withoutImage,
      countries: countries.map((c) => ({ code: c._id, count: c.count }))
    });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const paging = readPaging(req.query);
    const filter = {};

    if (req.query.genre) {
      const genre = await Genre.findOne({ slug: req.query.genre });
      if (!genre) return res.json({ artists: [], letters: [], meta: pageMeta(0, paging) });
      filter.genres = genre._id;
    }

    // Stored as an ISO alpha-2 code, or the defunct YU for a Yugoslav-era
    // artist. Upper-cased here so a link carrying ?country=ba still matches.
    if (req.query.country) {
      filter.country = String(req.query.country).toUpperCase().slice(0, 2);
    }

    /*
     * The two gaps worth working through, as filters rather than as a report.
     *
     * AI-DECISION: put on the list people already use instead of a separate
     * screen. The catalogue grew past eight hundred performers and the missing
     * fields are only fixable in the same place they are edited — a report
     * would mean reading a name here and finding it again over there.
     *
     * AI-TRAP: "no picture" is not `imageBytes: 0`. A performer can carry an
     * `imageUrl` pointing somewhere else entirely and render perfectly well,
     * and counting them as unillustrated sends somebody to fix what is not
     * broken. Both have to be absent. Country is stored with
     * `default: undefined`, so absent, null and empty are all the same answer.
     */
    if (req.query.gap === 'country') {
      filter.$or = [{ country: { $exists: false } }, { country: null }, { country: '' }];
    } else if (req.query.gap === 'image') {
      filter.$and = [
        { $or: [{ imageBytes: { $exists: false } }, { imageBytes: 0 }] },
        { $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }] }
      ];
    }

    if (req.query.q) {
      const folded = slugify(req.query.q).replace(/-/g, ' ');
      if (folded) filter.searchName = new RegExp(escapeRegex(folded), 'i');
    }

    /*
     * Alphabet navigation matches the first letter of ANY word in the name.
     *
     * AI-DECISION: surname as well as first name. People look for Zdravko Čolić
     * under Č as readily as under Z, and a strip that only knows the first letter
     * of the full string sends half of them to an empty page. Bands are unchanged
     * — "Bijelo Dugme" simply answers to B and to D.
     *
     * Matched against searchName, which is already folded, so Č and C land
     * together rather than Č being filed after Z where nobody looks for it.
     */
    if (req.query.letter) {
      const letter = slugify(req.query.letter).charAt(0);
      if (letter) filter.searchName = new RegExp('(^|\\s)' + letter, 'i');
    }

    const [artists, total, letters, countries] = await Promise.all([
      Artist.find(filter).populate('genres', 'name slug').sort({ name: 1 })
        .skip(paging.skip).limit(paging.limit),
      Artist.countDocuments(filter),
      // Which initials actually have artists, so the UI can grey out the rest.
      Artist.aggregate([
        // AI-TRAP: aggregations do not run the scoping hook, so a deleted
        // artist keeps their initial lit up in the alphabet strip and their
        // country in the facet below unless it is filtered here by hand.
        { $match: Artist.livingMatch() },
        // Every word's initial, not just the first: the strip has to offer the
        // same letters the filter above will actually answer to.
        { $project: { words: { $split: ['$searchName', ' '] } } },
        { $unwind: '$words' },
        { $match: { words: { $ne: '' } } },
        { $group: { _id: { $toUpper: { $substrCP: ['$words', 0, 1] } } } },
        { $sort: { _id: 1 } }
      ]),
      /*
       * Which countries actually have artists, with counts.
       *
       * Deliberately unfiltered, exactly as `letters` is: a facet that empties
       * as you use it strands the reader on a page with nothing to click but
       * back. Artists with no country set — 14 of them — are left out rather
       * than gathered into an "unknown" pill; they are reachable with no filter
       * on, which is where somebody who is not filtering already is.
       */
      Artist.aggregate([
        { $match: Artist.livingMatch({ country: { $nin: [null, ''] } }) },
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }
      ])
    ]);

    const artistIds = artists.map((a) => a._id);
    const ratings = await Song.aggregate([
      { $match: { artist: { $in: artistIds }, status: 'published' } },
      { $unwind: '$arrangements' },
      {
        $group: {
          _id: '$artist',
          sum: { $sum: '$arrangements.ratingSum' },
          count: { $sum: '$arrangements.ratingCount' }
        }
      }
    ]);
    const ratingMap = Object.fromEntries(
      ratings.map((r) => [String(r._id), { rating: r.count ? r.sum / r.count : 0, ratingCount: r.count }])
    );

    const visible = await visibleCounts(artists.map((a) => a._id), req.staff);

    res.json({
      /**
       * toCard rather than the raw documents: it adds the flag and a plain
       * hasImage flag, and it stops searchName, imageBytes and __v from
       * travelling to every client that lists artists.
       */
      artists: artists.map((a) => ({
        ...a.toCard(),
        // What the reader can open, not what the counter was told to remember.
        songCount: visible.get(String(a._id)) || 0,
        genres: a.genres,
        bio: a.bio,
        rating: ratingMap[String(a._id)]?.rating || 0,
        ratingCount: ratingMap[String(a._id)]?.ratingCount || 0
      })),
      letters: letters.map((l) => l._id).filter((l) => /^[A-Z]$/.test(l)),
      countries: countries.map((c) => ({ code: c._id, count: c.count })),
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Every artist's name and slug, grouped under each letter they answer to.
 *
 * AI-DECISION: one small payload rather than a request per hover. The whole
 * catalogue of names is 137 rows and a few kilobytes; fetching per letter would
 * put a network round trip behind a mouse movement, which is the one place a
 * delay is unmissable. It is also why this returns names and slugs and nothing
 * else — the moment it carries counts or images it stops being cheap.
 *
 * An artist appears under every distinct initial in their name, matching what
 * the letter filter answers to: Zdravko Čolić is under Z and under C.
 */
export async function letterIndex(req, res, next) {
  try {
    const artists = await Artist.find(visibilityFilterForArtists(req.staff))
      .select('name slug searchName')
      .sort({ name: 1 });

    const letters = {};
    for (const a of artists) {
      const initials = new Set(
        String(a.searchName || '')
          .split(' ')
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase())
          .filter((c) => /^[A-Z]$/.test(c))
      );
      for (const c of initials) {
        (letters[c] ||= []).push({ name: a.name, slug: a.slug });
      }
    }

    res.json({ letters });
  } catch (err) { next(err); }
}

export async function getOne(req, res, next) {
  try {
    const artist = await Artist.findOne({ slug: req.params.slug })
      .populate('genres', 'name slug');
    if (!artist) return res.status(404).json({ message: 'Izvođač nije pronađen.' });

    const paging = readPaging(req.query);
    const filter = {
      artist: artist._id,
      ...(req.staff ? {} : { status: 'published' })
    };

    const [songs, total] = await Promise.all([
      Song.find(filter)
        .populate('artist', 'name slug')
        .populate('genres', 'name slug')
        .sort({ title: 1 })
        .skip(paging.skip)
        .limit(paging.limit),
      Song.countDocuments(filter)
    ]);

    res.json({
      artist: {
        ...artist.toCard(),
        // Same correction as the list: toCard() carries the denormalised counter,
        // which includes drafts. `total` is already the number of songs this
        // caller can open, so the header cannot promise more than the page below
        // it delivers.
        songCount: total,
        bio: artist.bio,
        website: artist.website || null,
        genres: artist.genres,
        songs: songs.map((s) => s.toPublic())
      },
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}
