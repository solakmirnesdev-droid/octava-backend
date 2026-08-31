/**
 * Splits the catalogue into N disjoint lanes, so several agents can polish it
 * at once without ever meeting on the same song.
 *
 * AI-DECISION: lanes are contiguous _id ranges cut at measured quantiles, not
 * halves and not a hash. Three reasons, in order:
 *
 *   1. Disjoint by construction. The obvious scheme — worker A from the top to
 *      the middle, worker B from the bottom to the middle — sounds like four
 *      lanes and is two, each covered twice by a pair of workers racing each
 *      other on every write.
 *   2. It rides the _id index. A range filter is a seek; a hash or a modulo is
 *      a collection scan, because no index can answer it.
 *   3. The cuts are measured, not assumed. ObjectIds carry a timestamp, so
 *      they bunch wherever an import ran hot. Splitting the _id SPACE evenly
 *      gives wildly uneven lanes; splitting at quantiles gives even ones.
 *
 * AI-NOTE: this is for AGENT work — a person or a model editing lyrics. The
 * mechanical repairs in katalog.js do not need it: the whole catalogue passes
 * in about half a second, and parallelising that would add failure modes to
 * save nothing. See AI-NOTES.md, "Paralelno poliranje".
 */

/**
 * Cut a filter into `n` lanes of near-equal size.
 * Returns filters you can hand straight to find(), each one indexed.
 */
export async function dionice(model, filter, n) {
  if (n < 1) throw new Error('broj dionica mora biti bar 1');
  if (n === 1) return [{ ...filter }];

  const ukupno = await model.countDocuments(filter);
  const poDionici = Math.floor(ukupno / n);
  if (poDionici === 0) return [{ ...filter }];

  /*
   * Walk to each cut point with skip/limit on _id alone. It is a covered query
   * — the index answers it without touching a document — so even a large skip
   * stays cheap, and it runs n-1 times, not once per row.
   */
  const rezovi = [];
  for (let i = 1; i < n; i++) {
    const [d] = await model
      .find(filter)
      .select('_id')
      .sort({ _id: 1 })
      .skip(poDionici * i)
      .limit(1)
      .lean();
    if (d) rezovi.push(d._id);
  }

  const lanes = [];
  for (let i = 0; i <= rezovi.length; i++) {
    const uslov = {};
    if (i > 0) uslov.$gte = rezovi[i - 1];
    if (i < rezovi.length) uslov.$lt = rezovi[i];
    lanes.push(Object.keys(uslov).length ? { ...filter, _id: uslov } : { ...filter });
  }
  return lanes;
}

/**
 * Parse "--radnik 2/4" into { i, n }, one-based as a person would say it.
 * Returns null when the flag is absent, which means "the whole catalogue".
 */
export function citajRadnika(argv = process.argv) {
  const k = argv.indexOf('--radnik');
  if (k === -1) return null;
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(argv[k + 1] || '');
  if (!m) throw new Error('--radnik očekuje oblik i/n, npr. --radnik 2/4');
  const i = Number(m[1]);
  const n = Number(m[2]);
  if (i < 1 || i > n) throw new Error(`--radnik ${i}/${n}: redni broj mora biti između 1 i ${n}`);
  return { i, n };
}

/** The one lane this worker owns. */
export async function mojaDionica(model, filter, radnik) {
  if (!radnik) return { ...filter };
  const sve = await dionice(model, filter, radnik.n);
  return sve[radnik.i - 1] ?? { ...filter };
}
