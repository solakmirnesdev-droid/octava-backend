import mongoose from 'mongoose';
import Rating from '../models/Rating.js';
import Song from '../models/Song.js';

/**
 * Ratings against a single arrangement.
 *
 * The running total on the arrangement is what every list and sort reads, so it
 * is adjusted by the delta rather than recomputed: changing a vote from 2 to 5
 * moves the sum by three and leaves the count alone. Recounting every vote on
 * each submission would put a scan behind an action people repeat casually.
 */

function findByIdOrSlug(identifier) {
  return mongoose.isValidObjectId(identifier) ? { _id: identifier } : { slug: identifier };
}

/** The shape the page needs: the average, how many voted, and your own vote. */
function summarise(arrangement, mine) {
  const count = arrangement.ratingCount || 0;
  return {
    arrangementId: arrangement._id,
    average: count ? Number((arrangement.ratingSum / count).toFixed(2)) : 0,
    count,
    mine: mine ? mine.value : null
  };
}

export async function rate(req, res, next) {
  try {
    const value = Number(req.body.value);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return res.status(400).json({ message: 'Ocjena mora biti cijeli broj od 1 do 5.' });
    }

    const song = await Song.findOne({ ...findByIdOrSlug(req.params.identifier), status: 'published' });
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const arrangement = req.body.arrangementId
      ? song.arrangements.id(req.body.arrangementId)
      : song.primary;
    if (!arrangement) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    const existing = await Rating.findOne({ arrangement: arrangement._id, user: req.user._id });

    if (existing) {
      // Only the difference moves; the number of voters has not changed.
      arrangement.ratingSum += value - existing.value;
      existing.value = value;
      await existing.save();
    } else {
      await Rating.create({
        song: song._id,
        arrangement: arrangement._id,
        user: req.user._id,
        value
      });
      arrangement.ratingSum += value;
      arrangement.ratingCount += 1;
    }

    await song.save();
    res.json({ rating: summarise(arrangement, { value }) });
  } catch (err) {
    // The unique index is the real guard against a double submission.
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Već si ocijenio ovu verziju.' });
    }
    next(err);
  }
}

export async function unrate(req, res, next) {
  try {
    const song = await Song.findOne(findByIdOrSlug(req.params.identifier));
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const arrangement = req.body.arrangementId
      ? song.arrangements.id(req.body.arrangementId)
      : song.primary;
    if (!arrangement) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    const existing = await Rating.findOneAndDelete({
      arrangement: arrangement._id,
      user: req.user._id
    });
    if (!existing) return res.status(404).json({ message: 'Nemaš ocjenu na ovoj verziji.' });

    // Floored, so a lost update can never drive the totals negative.
    arrangement.ratingSum = Math.max(0, arrangement.ratingSum - existing.value);
    arrangement.ratingCount = Math.max(0, arrangement.ratingCount - 1);
    await song.save();

    res.json({ rating: summarise(arrangement, null) });
  } catch (err) {
    next(err);
  }
}

/** Reading is public; only the "mine" field depends on who is asking. */
export async function getRating(req, res, next) {
  try {
    const song = await Song.findOne(findByIdOrSlug(req.params.identifier));
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const arrangement = req.query.arrangementId
      ? song.arrangements.id(req.query.arrangementId)
      : song.primary;
    if (!arrangement) return res.status(404).json({ message: 'Verzija nije pronađena.' });

    const mine = req.user
      ? await Rating.findOne({ arrangement: arrangement._id, user: req.user._id })
      : null;

    res.json({ rating: summarise(arrangement, mine) });
  } catch (err) {
    next(err);
  }
}
