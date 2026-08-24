/**
 * Seeds the performer directory.
 *
 *   node scripts/seedArtists.js
 *
 * Names only. Performer names and the fact that a performer exists are not
 * copyrightable, so this list is safe to ship; song content is a separate
 * question and is never seeded here.
 *
 * Safe to re-run: existing performers are left alone rather than duplicated.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Artist from '../src/models/Artist.js';

const ARTISTS = [
  // Savremena scena
  'Aco Pejović', 'Aca Lukas', 'Saša Kovačević', 'Sergej Ćetković',
  'Nikola Rokvić', 'Aleksandra Prijović', 'Emina Jahović', 'Seka Aleksić',
  'Milica Pavlović', 'Jelena Rozga', 'Petar Grašo', 'Nina Badrić',
  'Tony Cetinski', 'Massimo Savić', 'Gibonni', 'Željko Samardžić',

  // Estrada i narodna
  'Halid Bešlić', 'Šaban Šaulić', 'Mile Kitić', 'Toma Zdravković',
  'Lepa Brena', 'Svetlana Ražnatović', 'Šerif Konjević', 'Hanka Paldum',
  'Safet Isović', 'Zaim Imamović', 'Nada Obrić', 'Šemsa Suljaković',

  // Pop i kantautori
  'Dino Merlin', 'Zdravko Čolić', 'Đorđe Balašević', 'Oliver Dragojević',
  'Toše Proeski', 'Doris Dragović', 'Severina', 'Danijela Martinović',

  // Ex-Yu rock
  'Bijelo Dugme', 'Riblja Čorba', 'Parni Valjak', 'Azra',
  'Ekatarina Velika', 'Prljavo Kazalište', 'Plavi Orkestar', 'Crvena Jabuka',
  'Hari Mata Hari', 'Zabranjeno Pušenje', 'Bajaga i Instruktori', 'Van Gogh',
  'Galija', 'Divlje Jagode', 'Leb i Sol', 'Idoli',
  'Električni Orgazam', 'Partibrejkers', 'Atomsko Sklonište', 'YU Grupa',
  'Neverne Bebe', 'Amadeus Band', 'Magazin', 'Colonia'
];

try {
  await connectDB();

  let created = 0;
  let skipped = 0;

  for (const name of ARTISTS) {
    // Case-insensitive exact match, so a re-run never makes a near-duplicate.
    const existing = await Artist.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });

    if (existing) { skipped++; continue; }

    const artist = await Artist.create({ name });
    console.log('  ' + name.padEnd(26) + '/izvodjac/' + artist.slug);
    created++;
  }

  console.log();
  console.log('Created: ' + created + ', already present: ' + skipped);
  console.log('Total performers: ' + (await Artist.countDocuments()));
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
