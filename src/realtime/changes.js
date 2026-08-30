import { pushToStaff } from './chat.js';

/**
 * Telling the dashboard that something it is showing has changed.
 *
 * AI-DECISION: announced from the models rather than from each handler. There
 * are roughly twenty-five places that write a song or an artist — six
 * controllers, a bulk edit, an importer, and a handful of scripts — and a rule
 * that has to be remembered in twenty-five places is a rule that will be missed
 * in one. A screen that refreshes for every edit except one is worse than a
 * screen that never refreshes, because nobody knows which one it is.
 *
 * The event carries what changed, not the change itself. Patching a list from
 * a payload means reimplementing every filter, sort and page boundary on the
 * client and getting them subtly wrong — a song that no longer matches the
 * active filter, a row that should have moved to the next page. Re-asking the
 * API is one request and is always right.
 */

/**
 * Writes arrive in bursts: a bulk edit touches five hundred songs, and the
 * script that rewrote the demo sheets touched five hundred and ninety-four. One
 * frame per document would be five hundred and ninety-four frames to every
 * connected desk, all of them saying the same thing.
 *
 * AI-TRAP: this window is on the SERVER and the client debounces as well. Both
 * are needed — the server stops the flood leaving the process, the client stops
 * two unrelated entities changing a second apart from causing two reloads.
 */
const WINDOW_MS = 300;

const pending = new Set();
let timer = null;

function flush() {
  timer = null;
  if (!pending.size) return;

  const entities = [...pending];
  pending.clear();
  pushToStaff('data:changed', { entities, at: Date.now() });
}

/**
 * Note that an entity changed. Cheap and safe to call from anywhere, including
 * a hook that fires inside a loop.
 *
 * @param {string} entity  'songs' | 'artists' | 'moderation' | ...
 */
export function announce(entity) {
  if (!entity) return;
  pending.add(entity);
  if (timer) return;
  timer = setTimeout(flush, WINDOW_MS);
  // A pending announcement must never be the reason a script or a test run
  // hangs on exit with nothing left to do.
  timer.unref?.();
}
