import Rating from '../models/Rating.js';
import Review from '../models/Review.js';
import ReviewComment from '../models/ReviewComment.js';
import SongReport from '../models/SongReport.js';
import Notification from '../models/Notification.js';
import AudioPrint from '../models/AudioPrint.js';

/**
 * Everything that points at a song and means nothing once it is gone.
 *
 * AI-DECISION: one function, used by both paths that destroy songs. It exists
 * because they were two copies of the same intent and had already drifted:
 * purging one song deleted its ratings and reviews, emptying the trash deleted
 * those plus its comments, reports, notifications and fingerprint. Same act,
 * two different amounts of wreckage left behind — and the narrower one was the
 * one people actually use.
 *
 * AI-TRAP: this is not hypothetical tidiness. Five notifications in the
 * development database already pointed at songs that no longer existed, which
 * renders in somebody's inbox as a line about a song that opens nothing. Any
 * new collection with a `song` reference belongs in this list, and nothing will
 * remind you — the failure is a dead link, not an error.
 */
export async function detachSongs(songIds) {
  if (!songIds?.length) {
    return { ratings: 0, reviews: 0, comments: 0, reports: 0, notifications: 0, prints: 0 };
  }

  const scope = { song: { $in: songIds } };

  const [ratings, reviews, comments, reports, notifications, prints] = await Promise.all([
    Rating.deleteMany(scope),
    Review.deleteMany(scope),
    ReviewComment.deleteMany(scope),
    SongReport.deleteMany(scope),
    // Deleted rather than unlinked: one pointing at a song nobody can open any
    // more is a dead line in a reader's inbox.
    Notification.deleteMany(scope),
    AudioPrint.deleteMany(scope)
  ]);

  return {
    ratings: ratings.deletedCount,
    reviews: reviews.deletedCount,
    comments: comments.deletedCount,
    reports: reports.deletedCount,
    notifications: notifications.deletedCount,
    prints: prints.deletedCount
  };
}
