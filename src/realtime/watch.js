import Song from '../models/Song.js';
import Artist from '../models/Artist.js';
import { announce } from './changes.js';
import { whoIsOnline } from './chat.js';

/**
 * Noticing writes this process did not make.
 *
 * AI-DECISION: the model hooks in changes.js only fire inside whoever ran the
 * write. A script filling the catalogue — and there are usually several, since
 * Mirnes works with a second agent — is a separate process with no socket in
 * it, so its writes reached the database and nothing else. From the dashboard
 * that looked exactly like the live updates being broken: rows appeared only on
 * a manual refresh, which is the complaint this exists to answer.
 *
 * AI-TRAP: change streams are the right tool and are not available here. They
 * need a replica set, and this mongod is standalone — `hello.setName` is
 * undefined, so `watch()` throws rather than degrading. Polling is the fallback,
 * not the preference; if Mongo ever becomes a replica set, replace this.
 */

/** How often to look. Fast enough to feel live, slow enough to be invisible. */
const EVERY_MS = Number(process.env.WATCH_INTERVAL_MS) || 4000;

const WATCHED = [
  ['songs', Song],
  ['artists', Artist]
];

/** count + newest timestamp: together they catch inserts, updates and deletes. */
async function fingerprint(Model) {
  const [count, newest] = await Promise.all([
    Model.estimatedDocumentCount(),
    Model.findOne({}, { updatedAt: 1 }).sort({ updatedAt: -1 }).lean()
  ]);
  return `${count}:${newest?.updatedAt?.getTime() || 0}`;
}

let timer = null;
const seen = new Map();

export function startWatching() {
  if (timer) return;

  timer = setInterval(async () => {
    /*
     * Nobody is looking, so nothing needs saying. This is what keeps an idle
     * server from running two queries every four seconds all night for an
     * audience of none.
     */
    if (!whoIsOnline().length) return;

    for (const [entity, Model] of WATCHED) {
      try {
        const now = await fingerprint(Model);
        const before = seen.get(entity);
        seen.set(entity, now);

        // The first pass only learns the current state; announcing it would
        // make every desk reload the moment the server came up.
        if (before !== undefined && before !== now) announce(entity);
      } catch (err) {
        // A failed poll is not worth a crash or a log line every four seconds.
        if (process.env.NODE_ENV !== 'production') console.error('[watch]', err.message);
      }
    }
  }, EVERY_MS);

  timer.unref?.();
}

export function stopWatching() {
  clearInterval(timer);
  timer = null;
  seen.clear();
}
