/**
 * Constellation fingerprinting — recognising a recording from a noisy snippet.
 *
 * The same idea Shazam patented, over Mirnes's own repertoire rather than a
 * commercial catalogue: reduce audio to the handful of spectral peaks that
 * survive a bad room, pair them, and store the pairs as integers. Two peaks and
 * the time between them is a far more distinctive event than either peak alone,
 * which is what makes a few seconds enough.
 *
 * AI-DECISION: written here rather than bought. No provider offers ambient
 * recognition free forever — AudD, ACRCloud and Shazam are all commercial, and
 * AcoustID is free but fingerprints whole files rather than microphone
 * snippets. The problem is also far smaller than theirs: a set list is a few
 * hundred recordings, not fifty million, so an inverted index in Mongo answers
 * it. The payoff is that it works with no key, no quota and **no network** —
 * which at a venue matters more than accuracy. See AI-NOTES.md §5.
 *
 * AI-TRAP: this file is byte-identical in octava-app/app/utils/. It has to be.
 * The browser computes the fingerprint and sends only hashes, so a change on
 * one side that is not mirrored does not throw — it silently stops matching,
 * and every recognition quietly returns nothing.
 *
 * Audio in is mono PCM at SAMPLE_RATE, as Float32 in -1..1. The caller
 * downsamples; AudioContext does it for free with an offline context.
 */

/**
 * Bumped whenever anything below changes the numbers a fingerprint produces.
 *
 * AI-TRAP: a stored index is only comparable to a query computed by the same
 * code. Change the rate, the frame, the bands or the packing and every stored
 * print becomes noise — matching does not fail loudly, it just stops finding
 * anything, which reads exactly like "that song is not indexed". The version
 * travels with the stored bytes so the mismatch is detectable instead of
 * mysterious, and a phone holding an offline copy can tell it has gone stale.
 */
export const FINGERPRINT_VERSION = 1;

/** Everything below is tuned to this rate. Changing it invalidates the index. */
export const SAMPLE_RATE = 8000;

/** 128ms per frame: ~7.8Hz per bin, fine enough to separate adjacent semitones. */
const FRAME = 1024;
const HOP = 512;

/**
 * Peaks are picked per band, not globally.
 *
 * AI-TRAP: a plain "strongest six bins in the frame" picks six neighbours of
 * the same bass note, because low frequencies carry most of the energy in
 * nearly all recorded music. Banding forces the constellation to spread across
 * the spectrum, which is the only reason it survives a room that eats treble.
 * Edges are log-spaced for the same reason pitch is.
 */
const BANDS = [2, 10, 20, 40, 80, 160, 320, 512];

/** How many later peaks each anchor pairs with. */
const FAN_OUT = 5;
/** Target zone, in frames: roughly 0.13s to 5.1s ahead of the anchor. */
const MIN_DELTA = 1;
const MAX_DELTA = 40;

/* ------------------------------------------------------------------ *
 * FFT
 * ------------------------------------------------------------------ */

/**
 * In-place iterative radix-2 Cooley-Tukey. Length must be a power of two.
 *
 * Hand-written rather than pulled in: the browser copy has to compute bit-for-
 * bit the same spectrum as this one, and a shared dependency that resolves to
 * two different minor versions is a failure that shows up as "recognition
 * stopped working" months later.
 */
function fft(re, im) {
  const n = re.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);

    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;

      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;

        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;

        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Precomputed Hann window; the leakage a rectangular window leaves invents peaks. */
const WINDOW = new Float64Array(FRAME);
for (let i = 0; i < FRAME; i++) {
  WINDOW[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FRAME - 1));
}

/* ------------------------------------------------------------------ *
 * Peaks
 * ------------------------------------------------------------------ */

/**
 * The strongest bin in each band of each frame, as [frameIndex, bin] pairs.
 *
 * A peak is kept only if it stands above the mean magnitude of its frame, so a
 * silent passage contributes nothing rather than contributing noise.
 */
export function peaks(samples) {
  const found = [];
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const mag = new Float64Array(FRAME / 2);

  const frames = Math.floor((samples.length - FRAME) / HOP) + 1;

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;

    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[start + i] * WINDOW[i];
      im[i] = 0;
    }
    fft(re, im);

    let total = 0;
    for (let i = 0; i < FRAME / 2; i++) {
      mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      total += mag[i];
    }
    const floor = total / (FRAME / 2);
    if (floor === 0) continue;

    for (let b = 0; b < BANDS.length - 1; b++) {
      let bestBin = -1;
      let best = 0;

      for (let i = BANDS[b]; i < BANDS[b + 1]; i++) {
        if (mag[i] > best) { best = mag[i]; bestBin = i; }
      }
      // The threshold is what keeps a quiet band from donating a peak made of
      // noise; without it every frame contributes all seven and the index fills
      // with hashes that match everything.
      if (bestBin !== -1 && best > floor) found.push([f, bestBin]);
    }
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * Hashes
 * ------------------------------------------------------------------ */

/** Packs a peak pair into one integer: 9 bits, 9 bits, 6 bits. */
function pack(bin1, bin2, delta) {
  return ((bin1 & 0x1ff) << 15) | ((bin2 & 0x1ff) << 6) | (delta & 0x3f);
}

/**
 * Every anchor paired with the peaks just after it.
 *
 * Returns `[hash, anchorFrame]` pairs. The anchor time is what makes matching
 * work: a real hit lines up at one constant offset between query and reference,
 * while coincidental hash collisions scatter across every offset there is.
 */
export function fingerprint(samples) {
  const pts = peaks(samples);
  const out = [];

  for (let i = 0; i < pts.length; i++) {
    const [t1, f1] = pts[i];
    let paired = 0;

    for (let j = i + 1; j < pts.length && paired < FAN_OUT; j++) {
      const [t2, f2] = pts[j];
      const delta = t2 - t1;

      if (delta < MIN_DELTA) continue;
      if (delta > MAX_DELTA) break;

      out.push([pack(f1, f2, delta), t1]);
      paired++;
    }
  }
  return out;
}

/**
 * Scores one candidate: how many hashes agree on a single time offset.
 *
 * AI-TRAP: count the tallest offset bin, never the total number of matching
 * hashes. A long recording shares far more hashes with anything at all than a
 * short one does, so a raw count ranks by track length and reliably returns the
 * longest song in the index. Alignment is the signal; overlap is not.
 *
 * @param {Array<[number, number]>} query   hashes from the microphone
 * @param {Map<number, number[]>}   index   hash -> anchor frames in the reference
 */
export function align(query, index) {
  const offsets = new Map();
  let best = 0;
  let bestOffset = 0;

  for (const [hash, queryTime] of query) {
    const times = index.get(hash);
    if (!times) continue;

    for (const refTime of times) {
      const offset = refTime - queryTime;
      const count = (offsets.get(offset) || 0) + 1;
      offsets.set(offset, count);

      if (count > best) { best = count; bestOffset = offset; }
    }
  }
  return { score: best, offset: bestOffset, seconds: bestOffset * HOP / SAMPLE_RATE };
}

/**
 * The same alignment, driven from the other side: the query is indexed and the
 * reference is walked as packed bytes.
 *
 * AI-DECISION: this is the direction matching actually runs, and `align` above
 * is kept as the readable statement of the same arithmetic. Indexing the
 * references costs 2.1MB of heap per four minute song — 214MB for a hundred,
 * measured, and an underestimate because the measurement used looping
 * synthetic audio with only 10k distinct hashes out of 71k pairs. Indexing the
 * *query* instead costs nothing: the references stay the 0.4MB buffers they
 * were stored as, a hundred songs fit in 41MB, and the cost moves to a linear
 * scan that a request can afford. The phone does the same over IndexedDB.
 *
 * @param {Map<number, number[]>} queryIndex hash -> frames, from `toIndex`
 * @param {Uint8Array|Buffer}     bytes      one song's packed print
 */
export function alignPacked(queryIndex, bytes) {
  const view = new DataView(
    bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length
  );
  const entries = Math.floor(view.byteLength / ENTRY_BYTES);
  const offsets = new Map();

  let best = 0;
  let bestOffset = 0;

  for (let i = 0; i < entries; i++) {
    const hash = view.getUint32(i * ENTRY_BYTES, true);
    const times = queryIndex.get(hash);
    if (!times) continue;

    const refTime = view.getUint16(i * ENTRY_BYTES + 4, true);

    for (const queryTime of times) {
      const offset = refTime - queryTime;
      const count = (offsets.get(offset) || 0) + 1;
      offsets.set(offset, count);

      if (count > best) { best = count; bestOffset = offset; }
    }
  }
  return { score: best, offset: bestOffset, seconds: bestOffset * HOP / SAMPLE_RATE };
}

/** Frames per second, for turning an offset into a position in the recording. */
export const FRAMES_PER_SECOND = SAMPLE_RATE / HOP;

/**
 * The two bars a candidate has to clear before it is called a match.
 *
 * AI-TRAP: the first bar is a RATE — aligned hashes divided by the number of
 * hashes in the query — never the raw count. This is the same length bug as the
 * one `align` documents, one level up: a twenty second query accumulates three
 * times the hashes of a six second one, so a raw floor calibrated on a short
 * clip waves through anything long. A piece deliberately unlike the whole index
 * scored 143 on that floor and would have been reported as a hit.
 *
 * Measured over six synthetic recordings, a six second clip against noise:
 *
 *   noise 0     rate 0.87   runner-up ratio 6.6
 *   noise 0.15  rate 0.24   ratio 5.2
 *   noise 0.4   rate 0.18   ratio 4.9
 *   noise 0.8   rate 0.063  ratio 2.3      <- noise three times the music
 *   noise 1.5   rate 0.012  ratio 1.6      <- declined, correctly
 *
 * AI-NOTE: the margin against a *wrong* piece is thinner than these numbers
 * suggest, and the tests cannot close it. Synthetic tones are three sine
 * partials, so two unrelated pieces collide whenever a harmonic lands in the
 * same 7.8Hz bin — an unrelated piece reached 0.047 against a 0.05 floor. Real
 * recordings carry voices, cymbals and room, which is a far denser and more
 * distinctive spectrum. **The false-positive rate has to be measured against
 * the real library before this is trusted at a gig**, and until it has been,
 * treat a match as a suggestion. See AI-NOTES.md §5.
 */
export const MIN_RATE = 0.05;
export const MIN_RATIO = 2.0;

/**
 * Picks a winner from scored candidates, or nothing.
 *
 * Returning null is a real answer and the interface should show it as one.
 * "Nisam siguran" costs a musician one more attempt; a confident wrong title
 * costs them the song they were looking for.
 *
 * @param {Array<{score: number}>} scored     one entry per candidate, any order
 * @param {number}                 queryCount how many hashes the query held
 */
export function best(scored, queryCount) {
  if (!queryCount) return null;

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  if (!top) return null;

  const rate = top.score / queryCount;
  if (rate < MIN_RATE) return null;
  if (second && second.score > 0 && top.score / second.score < MIN_RATIO) return null;

  return { ...top, rate };
}

/* ------------------------------------------------------------------ *
 * Wire format
 * ------------------------------------------------------------------ */

/**
 * Six bytes per pair: the hash as uint32, the anchor frame as uint16.
 *
 * Binary rather than JSON because a four minute song is around 130,000 pairs.
 * As `[[hash, time], ...]` that is roughly 1.5MB of text, over the 256kb body
 * limit the API sets for everything else — and raising that limit globally to
 * carry one endpoint's payload is how a limit stops meaning anything. uint16
 * holds 65535 frames, which is 70 minutes at this hop.
 */
export const ENTRY_BYTES = 6;

export function packHashes(pairs) {
  const bytes = new Uint8Array(pairs.length * ENTRY_BYTES);
  const view = new DataView(bytes.buffer);

  for (let i = 0; i < pairs.length; i++) {
    view.setUint32(i * ENTRY_BYTES, pairs[i][0] >>> 0, true);
    view.setUint16(i * ENTRY_BYTES + 4, pairs[i][1] & 0xffff, true);
  }
  return bytes;
}

export function unpackHashes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = Math.floor(bytes.byteLength / ENTRY_BYTES);
  const out = new Array(count);

  for (let i = 0; i < count; i++) {
    out[i] = [view.getUint32(i * ENTRY_BYTES, true), view.getUint16(i * ENTRY_BYTES + 4, true)];
  }
  return out;
}

/** Hash -> anchor frames, the shape `align` reads. */
export function toIndex(pairs) {
  const map = new Map();

  for (const [hash, time] of pairs) {
    const at = map.get(hash);
    if (at) at.push(time);
    else map.set(hash, [time]);
  }
  return map;
}
