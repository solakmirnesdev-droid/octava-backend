/**
 * The shape every script in here was writing by hand.
 *
 * AI-DECISION: extracted after measuring what the hand-written version costs.
 * The healers follow one pattern — load the catalogue, walk it, save each
 * changed document, sleep, repeat — and at 14,389 songs that is 863ms and
 * 72.6MB of Mongoose documents per pass, repeated every ten seconds by twelve
 * daemons. Nothing about the work needs that; it is the shape, not the task.
 *
 * Three things this does differently, all measurable:
 *
 *  - a CURSOR instead of find(), so one document is in memory at a time
 *  - `.lean()`, so it is a plain object rather than a Mongoose document with
 *    change tracking and validation attached to it
 *  - bulkWrite in batches, so a thousand changes are a handful of round trips
 *    rather than a thousand
 *
 * And one that matters more than all three: `since`. A daemon that re-reads
 * everything every ten seconds is answering a question nobody asked — almost
 * nothing changed. Passing the previous pass's timestamp turns a full sweep
 * into an indexed lookup over `updatedAt` that usually returns nothing.
 */
import mongoose from 'mongoose';

export async function connect() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(process.env.MONGODB_URI);
  return mongoose.connection;
}

/**
 * Walks a collection and applies whatever the caller returns.
 *
 * @param {object}   o
 * @param {import('mongoose').Model} o.model
 * @param {object}   [o.filter]   what to walk; `since` narrows it further
 * @param {string}   [o.select]   fields to read — read less, go faster
 * @param {Date}     [o.since]    only documents touched after this
 * @param {number}   [o.batch]    writes per round trip
 * @param {boolean}  [o.dry]      collect the changes, write nothing
 * @param {(doc) => object|null} o.change  the $set for this document, or null
 *
 * @returns {Promise<{seen: number, changed: number, ms: number}>}
 */
export async function sweep({
  model, filter = {}, select = null, since = null, batch = 500, dry = false, change
}) {
  const started = Date.now();
  const query = since ? { ...filter, updatedAt: { $gt: since } } : filter;

  let seen = 0;
  let changed = 0;
  let pending = [];

  const flush = async () => {
    if (!pending.length) return;
    if (!dry) await model.bulkWrite(pending, { ordered: false });
    pending = [];
  };

  const cursor = model.find(query).select(select).lean().cursor();

  for await (const doc of cursor) {
    seen += 1;
    const set = change(doc);
    if (!set) continue;

    changed += 1;
    pending.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
    if (pending.length >= batch) await flush();
  }
  await flush();

  return { seen, changed, ms: Date.now() - started };
}

/**
 * Runs a pass on an interval, handing each one the moment the last began.
 *
 * AI-TRAP: the watermark is taken BEFORE the pass, not after. Taking it
 * afterwards silently drops anything written while the pass was running — the
 * window is small, it is invisible, and it grows with the size of the sweep.
 */
export async function loop({ every = 10000, label = 'sweep', pass, full = 20 }) {
  let since = null;
  let passes = 0;

  for (;;) {
    const mark = new Date();
    try {
      // Every so often, ignore the watermark and look at everything: a rule
      // that changed since the last full pass applies to rows nobody touched.
      const result = await pass(passes % full === 0 ? null : since);
      since = mark;
      passes += 1;

      if (result?.changed) {
        console.log(`[${label}] ${result.changed} izmijenjeno od ${result.seen} (${result.ms}ms)`);
      }
    } catch (err) {
      console.error(`[${label}]`, err.message);
    }
    await new Promise((r) => setTimeout(r, every));
  }
}
