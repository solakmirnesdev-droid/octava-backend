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

  console.error(err);
  res.status(500).json({ message: 'Greška na serveru.' });
}

export function notFound(_req, res) {
  res.status(404).json({ message: 'Ruta nije pronađena.' });
}
