import Song from '../models/Song.js';
import Artist from '../models/Artist.js';
import Genre from '../models/Genre.js';

/**
 * Everything the site footer needs, in one response.
 *
 * The footer renders on every page, so fetching genres, performers and songs
 * separately would put three round trips on every single render. Combining
 * them costs one, and the result changes on the order of hours rather than
 * seconds — so it is cached in memory rather than recomputed per request.
 */
const CACHE_MS = 15 * 60 * 1000;

let cache = null;
let cachedAt = 0;

const TOP_ARTISTS = 18;
const TOP_SONGS = 12;

async function build() {
  const [genres, artists, songs, songCount, artistCount] = await Promise.all([
    Genre.find().select('name slug kind songCount').sort({ kind: 1, order: 1, name: 1 }),

    // Performers worth linking are the ones with something behind the link.
    Artist.find({ songCount: { $gt: 0 } })
      .select('name slug songCount')
      .sort({ songCount: -1, name: 1 })
      .limit(TOP_ARTISTS),

    Song.find({ status: 'published' })
      .select('title slug artist')
      .populate('artist', 'name slug')
      .sort({ views: -1 })
      .limit(TOP_SONGS),

    Song.countDocuments({ status: 'published' }),
    Artist.countDocuments({ songCount: { $gt: 0 } })
  ]);

  return {
    genres,
    artists,
    songs: songs.map((s) => ({
      title: s.title,
      slug: s.slug,
      artist: s.artist ? { name: s.artist.name, slug: s.artist.slug } : null
    })),
    counts: { songs: songCount, artists: artistCount, genres: genres.length }
  };
}

export async function footer(req, res, next) {
  try {
    if (!cache || Date.now() - cachedAt > CACHE_MS) {
      cache = await build();
      cachedAt = Date.now();
    }

    // Let a CDN or the browser hold it too; a stale footer is harmless.
    res.set('Cache-Control', 'public, max-age=900');
    res.json(cache);
  } catch (err) {
    next(err);
  }
}
