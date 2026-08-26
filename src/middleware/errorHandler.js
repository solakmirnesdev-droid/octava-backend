/** Last stop for anything a route throws. */
export function errorHandler(err, _req, res, _next) {
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)[0]?.message || 'Neispravni podaci.';
    return res.status(400).json({ message });
  }

  // Duplicate key on a unique index (e.g. two accounts on one email).
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Zapis s ovom vrijednošću već postoji.' });
  }

  /**
   * Body parser rejections, translated.
   *
   * express.raw and express.json refuse an oversized or malformed body before
   * any handler runs, so a controller's own size check never gets the chance.
   * Left alone these surface as a bare 500, which tells someone uploading a
   * large picture nothing about what to do differently.
   */
  if (err.type === 'entity.too.large' || err.status === 413) {
    const limit = Number(err.limit);
    return res.status(413).json({
      message: limit
        ? `Datoteka je prevelika. Najviše ${(limit / 1024).toFixed(0)} KB.`
        : 'Datoteka je prevelika.'
    });
  }

  if (err.type === 'entity.parse.failed' || err.type === 'encoding.unsupported') {
    return res.status(400).json({ message: 'Sadržaj zahtjeva nije ispravan.' });
  }

  console.error(err);
  res.status(500).json({ message: 'Greška na serveru.' });
}

export function notFound(_req, res) {
  res.status(404).json({ message: 'Ruta nije pronađena.' });
}
