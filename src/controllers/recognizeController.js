import AudioPrint from '../models/AudioPrint.js';
import Song from '../models/Song.js';
import AuditLog from '../models/AuditLog.js';
import {
  toIndex, unpackHashes, alignPacked, best,
  ENTRY_BYTES, FINGERPRINT_VERSION, FRAMES_PER_SECOND
} from '../utils/fingerprint.js';

/**
 * Recognising a song from a few seconds of microphone audio.
 *
 * The browser does the signal processing — decode, downsample, constellation —
 * and posts only packed hash pairs. Nothing here ever sees audio, which is why
 * indexing a library costs no storage worth naming and raises no question about
 * what is being held.
 */

/**
 * The prints, held as the buffers they were stored as.
 *
 * AI-DECISION: cached rather than read per request, because matching walks
 * every print and reading 41MB from Mongo for each recognition would make the
 * database the bottleneck for a feature whose whole appeal is answering in
 * under a second. Held as buffers, not as indexes: see alignPacked for the
 * measurement behind that choice.
 *
 * AI-TRAP: every write path below must call `forget()`. A stale cache does not
 * error — it silently keeps matching against the print a song used to have.
 */
let cache = null;

/**
 * AI-TRAP: a lean() read hands back the driver's Binary wrapper, not a Node
 * Buffer, and Buffer.concat refuses it. Worse than the refusal is what happens
 * when it does not refuse: reaching for `.buffer` works on a Binary, because
 * that property is the finished Buffer — but on a real Buffer `.buffer` is the
 * shared pool it was allocated from, megabytes wide and at some offset, so the
 * same expression silently reads whatever else the pool is holding. Normalise
 * once, here, and pass the Buffer itself everywhere below.
 */
const asBuffer = (value) =>
  Buffer.isBuffer(value) ? value : Buffer.from(value.buffer ?? value.value?.() ?? value);

async function prints() {
  if (cache) return cache;

  const rows = await AudioPrint.current().select('+hashes song hashCount seconds').lean();
  cache = rows
    .filter((r) => r.hashes?.length)
    .map((r) => ({ ...r, hashes: asBuffer(r.hashes) }));
  return cache;
}

function forget() {
  cache = null;
}

/** POST /api/recognize — body is packed hash pairs, the reply is a song or null. */
export async function match(req, res, next) {
  try {
    const body = req.body;
    if (!body?.length || body.length % ENTRY_BYTES !== 0) {
      return res.status(400).json({ message: 'Otisak nije ispravan.' });
    }

    const query = unpackHashes(body);
    const index = toIndex(query);
    const library = await prints();

    if (!library.length) {
      return res.json({ match: null, reason: 'empty', message: 'Nijedna pjesma još nije indeksirana.' });
    }

    const scored = library.map((row) => ({
      song: row.song,
      ...alignPacked(index, row.hashes)
    }));

    const winner = best(scored, query.length);
    if (!winner) {
      return res.json({ match: null, reason: 'unsure', searched: library.length });
    }

    const song = await Song.findById(winner.song)
      .populate('artist', 'name slug')
      .select('title slug artist status');

    // A print outliving its song is not an error, but it is not an answer
    // either — and reporting the id alone would render as a broken link.
    if (!song) return res.json({ match: null, reason: 'unsure', searched: library.length });

    res.json({
      match: {
        _id: song._id,
        title: song.title,
        slug: song.slug,
        artist: song.artist,
        // Where in the recording the clip came from. Honest about repeats: a
        // chorus heard twice aligns to whichever pass scored higher, so this
        // locates the music, not the moment.
        atSecond: Math.max(0, Math.round(winner.offset / FRAMES_PER_SECOND)),
        score: winner.score,
        rate: Number(winner.rate.toFixed(4))
      },
      searched: library.length
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/recognize/:songId — store or replace one song's print. */
export async function store(req, res, next) {
  try {
    const body = req.body;
    if (!body?.length || body.length % ENTRY_BYTES !== 0) {
      return res.status(400).json({ message: 'Otisak nije ispravan.' });
    }

    const song = await Song.findById(req.params.songId).select('title');
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const seconds = Number(req.query.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return res.status(400).json({ message: 'Trajanje snimka je obavezno.' });
    }

    const doc = await AudioPrint.findOneAndUpdate(
      { song: song._id },
      {
        hashes: Buffer.from(body),
        hashCount: body.length / ENTRY_BYTES,
        seconds: Math.round(seconds),
        version: FINGERPRINT_VERSION,
        createdBy: req.staff?._id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    forget();

    await AuditLog.record({
      req,
      action: 'print.store',
      entity: 'song',
      entityId: song._id,
      entityLabel: song.title,
      meta: { hashCount: doc.hashCount, seconds: doc.seconds, version: doc.version }
    });

    res.json({ song: song._id, hashCount: doc.hashCount, seconds: doc.seconds, version: doc.version });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/recognize/:songId */
export async function remove(req, res, next) {
  try {
    const gone = await AudioPrint.findOneAndDelete({ song: req.params.songId });
    if (!gone) return res.status(404).json({ message: 'Otisak nije pronađen.' });

    forget();

    const song = await Song.findById(req.params.songId).select('title');
    await AuditLog.record({
      req,
      action: 'print.remove',
      entity: 'song',
      entityId: gone.song,
      entityLabel: song?.title || '',
      meta: { hashCount: gone.hashCount }
    });

    res.json({ removed: true });
  } catch (err) {
    next(err);
  }
}

/** GET /api/recognize — what is indexed, without the bytes. */
export async function list(_req, res, next) {
  try {
    const rows = await AudioPrint.find()
      .populate({ path: 'song', select: 'title slug', populate: { path: 'artist', select: 'name' } })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      version: FINGERPRINT_VERSION,
      prints: rows.map((r) => ({
        song: r.song,
        hashCount: r.hashCount,
        seconds: r.seconds,
        bytes: r.hashCount * ENTRY_BYTES,
        // Anything from an older algorithm is dead weight and has to be shown
        // as such, or it reads as a song that simply never matches.
        stale: r.version !== FINGERPRINT_VERSION,
        updatedAt: r.updatedAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/recognize/offline — the prints a phone caches to match without a network.
 *
 * Scoped to an explicit list rather than shipping everything: a gig is thirty
 * songs, and thirty prints are twelve megabytes where the whole library is
 * forty. The reply is one concatenated body with a JSON manifest ahead of it,
 * so the client makes one request instead of one per song on a venue's wifi.
 */
export async function offline(req, res, next) {
  try {
    const ids = String(req.query.songs || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return res.status(400).json({ message: 'Nijedna pjesma nije zatražena.' });
    if (ids.length > 200) return res.status(400).json({ message: 'Najviše 200 pjesama odjednom.' });

    const rows = await AudioPrint.current({ song: { $in: ids } })
      .select('+hashes song seconds').lean();

    const manifest = [];
    const bodies = [];
    let at = 0;

    for (const row of rows) {
      const hashes = asBuffer(row.hashes);
      manifest.push({ song: String(row.song), offset: at, bytes: hashes.length, seconds: row.seconds });
      at += hashes.length;
      bodies.push(hashes);
    }

    const header = Buffer.from(JSON.stringify({ version: FINGERPRINT_VERSION, prints: manifest }), 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32LE(header.length, 0);

    res.type('application/octet-stream');
    res.send(Buffer.concat([length, header, ...bodies]));
  } catch (err) {
    next(err);
  }
}
