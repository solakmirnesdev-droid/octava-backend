import { convertToChordPro, guessKey } from '../utils/importer.js';

const MAX_INPUT = 40000;

/**
 * Converts pasted "chords above lyrics" text without saving anything.
 *
 * Deliberately a preview: the worker sees the result and corrects it before it
 * becomes a song, since positional alignment in the source is only ever
 * approximate.
 */
export async function preview(req, res, next) {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ message: 'Pošalji tekst za konverziju.' });
    }
    if (text.length > MAX_INPUT) {
      return res.status(413).json({ message: 'Tekst je predugačak.' });
    }

    const result = convertToChordPro(text);

    res.json({
      content: result.content,
      chords: result.chords,
      originalKey: guessKey(result.content),
      warnings: result.warnings
    });
  } catch (err) {
    next(err);
  }
}
