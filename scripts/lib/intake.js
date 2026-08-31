import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isChord } from '../../src/utils/chords.js';

/**
 * The rules every importer and seeder obeys, in one place.
 *
 * AI-DECISION: shared rather than repeated. Six scripts write to the catalogue
 * and none of them had a dry run; the same rule copied six times is a rule that
 * will be wrong in one of them, and the one it is wrong in is the one nobody
 * checks. What went in through those scripts is on record: 594 songs with Latin
 * filler for words and ten fabricated chord progressions between them, and
 * 1,387 carrying invented view counts.
 *
 * Sourcing is not this module's business — what may be imported is Mirnes's
 * call. This is about the mechanics: not writing until asked, not publishing
 * unread, not inventing, and leaving enough behind to undo a bad run.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * One id per process, stamped on every row a run writes.
 *
 * This is what makes a bad import undoable as a unit. A tag says where a song
 * came from; it cannot say which of forty runs from that source put it there.
 */
export const RUN_ID = randomUUID().slice(0, 8);

/**
 * Nothing writes unless it is asked to.
 *
 * AI-TRAP: the default is the safe one on purpose. A script whose default is to
 * write is one keystroke from a catalogue-wide change, and the person running
 * it usually wanted to see what it would do first.
 */
export function flags(argv = process.argv) {
  return {
    apply: argv.includes('--apply'),
    /** `--limit=50` while working out whether a source is worth trusting. */
    limit: Number((argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity
  };
}

/**
 * Where imported material lands: out of sight, and marked as unread.
 *
 * AI-DECISION: `draft`, never `published`. Both scrapers wrote straight to the
 * public site, so anything they got wrong was live before a person had read a
 * word of it — which is exactly how the lorem ipsum sheets ended up in front of
 * readers. A human moving it to published is the whole point of the step.
 */
export function landing(tags = []) {
  return {
    status: 'draft',
    tags: [...new Set([...tags, 'uvoz', 'neprovjereno'])]
  };
}

/** Where a row came from, and in which run, so one run can be undone alone. */
export function stamp(source) {
  return { imported: { source, at: new Date(), run: RUN_ID } };
}

/**
 * Refuses a chord list that is not in the sheet it claims to describe.
 *
 * AI-TRAP: this is the guard the catalogue most needed and did not have. A
 * progression that was guessed rather than transcribed looks exactly like one
 * somebody checked — there is no way to tell them apart afterwards, which is
 * why 594 songs shipped sharing ten chord charts between them. A chord may only
 * be claimed if it actually appears in the content.
 *
 * Returns the chords that are genuinely present. Throws when the list contains
 * something the sheet does not.
 */
export function verifiedChords(content, claimed = []) {
  const present = new Set(
    (String(content || '').match(/\[([^\]]*)\]/g) || [])
      .map((b) => b.slice(1, -1))
      .filter(isChord)
  );

  const invented = claimed.filter((c) => !present.has(c));
  if (invented.length) {
    throw new Error(
      `Akordi kojih nema u tekstu: ${invented.join(', ')}. `
      + 'Uvezen naslov ide s praznim aranžmanom i tagom bez-akorda, ne s pogodjenom progresijom.'
    );
  }

  return [...present];
}

/**
 * An empty arrangement, for a title whose chords are not known.
 *
 * The alternative is a guess, and a guess is worse than a gap: a gap can be
 * found with a filter and filled, an invented progression cannot be found at all.
 */
export const emptyArrangement = (originalKey = 'Am') => ({
  label: 'Osnovna verzija',
  content: 'Tekst još uvijek nije ažuriran.',
  originalKey,
  capo: 0,
  chords: [],
  isPrimary: true
});

/**
 * A copy on disk before anything destructive.
 *
 * AI-TRAP: songs and artists carry no history, so a merge or an overwrite
 * cannot be undone from the database. `continuous_quality_healer` merges
 * duplicate artists — it moves their songs and soft-deletes one of them — which
 * is the single hardest thing here to put back by hand.
 */
export function snapshot(name, rows) {
  if (!rows?.length) return null;
  const stamped = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(here, '..', `${name}-${stamped}-${RUN_ID}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 1));
  return file;
}

/** The same closing summary from every script, so runs can be compared. */
export function report({ apply, source, seen = 0, written = 0, skipped = 0, failed = 0 }) {
  console.log('');
  console.log(`izvor      : ${source}`);
  console.log(`run        : ${RUN_ID}`);
  console.log(`pregledano : ${seen}`);
  console.log(`${apply ? 'upisano   ' : 'bilo bi upisano'} : ${written}`);
  console.log(`preskočeno : ${skipped}`);
  if (failed) console.log(`neuspjelo  : ${failed}`);
  if (!apply) {
    console.log('');
    console.log('PROBNI PROLAZ — ništa nije upisano. Dodaj --apply da se stvarno upiše.');
  }
}
