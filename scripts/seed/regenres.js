/**
 * Re-applies genre classification to songs already in place.
 *
 * Separate from rebuild.js because that one only assigns genres at creation
 * time, and the classification lists grew after the catalogue was seeded — the
 * second wave had landed as generic pop, which put Indexi and Smak in the same
 * rubric as chart singles.
 *
 * Public-domain songs are left alone: their rubrics were set by hand.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';

const ROCK = new Set(['Bijelo Dugme', 'Azra', 'Riblja Čorba', 'Ekatarina Velika', 'Idoli',
  'Električni Orgazam', 'Parni Valjak', 'Prljavo Kazalište', 'Divlje Jagode', 'Atomsko Sklonište',
  'YU Grupa', 'Galija', 'Leb i Sol', 'Van Gogh', 'Partibrejkers', 'Zabranjeno Pušenje',
  'Plavi Orkestar', 'Indexi', 'Bombaj Štampa', 'Regina', 'Vatreni Poljubac', 'Haustor', 'Film',
  'Aerodrom', 'Smak', 'Piloti', 'Kerber', 'Osvajači', 'Boa', 'Dorian Gray', 'Letu Štuke',
  'Dubioza Kolektiv', 'Zoster', 'Sikter', 'Josipa Lisac', 'Mladen Vojičić Tifa']);

const FOLK = new Set(['Lepa Brena', 'Šaban Šaulić', 'Toma Zdravković', 'Mile Kitić',
  'Svetlana Ražnatović', 'Seka Aleksić', 'Aca Lukas', 'Šerif Konjević', 'Šemsa Suljaković',
  'Milica Pavlović', 'Dragana Mirković', 'Sinan Sakić', 'Vesna Zmijanac', 'Zorica Brunclik',
  'Snežana Đurišić', 'Merima Njegomir', 'Predrag Gojković Cune', 'Halid Muslimović',
  'Enes Begović', 'Đorđe Marjanović', 'Miki Jevremović']);

const SEVDAH = new Set(['Safet Isović', 'Zaim Imamović', 'Hanka Paldum', 'Kemal Monteno',
  'Nedžad Salković', 'Himzo Polovina', 'Nada Mamula', 'Beba Selimović', 'Meho Puzić']);

const PRIMORJE = new Set(['Oliver Dragojević', 'Mišo Kovač', 'Arsen Dedić', 'Ibrica Jusić',
  'Tereza Kesovija', 'Klapa Cambi', 'Vinko Coce', 'Gibonni', 'Đani Stipaničev']);

const pick = (name) =>
  SEVDAH.has(name) ? ['sevdalinka', 'domaca']
  : PRIMORJE.has(name) ? ['starogradska', 'domaca']
  : ROCK.has(name) ? ['rock', 'ex-yu']
  : FOLK.has(name) ? ['narodna', 'domaca']
  : ['pop', 'domaca'];

await mongoose.connect(process.env.MONGODB_URI);

const bySlug = Object.fromEntries((await Genre.find()).map((g) => [g.slug, g._id]));
let touched = 0;

for (const artist of await Artist.find()) {
  const slugs = pick(artist.name);
  const ids = slugs.map((s) => bySlug[s]).filter(Boolean);
  const res = await Song.updateMany(
    { artist: artist._id, tags: 'demo' },
    { genres: ids }
  );
  touched += res.modifiedCount;
}

for (const g of await Genre.find()) {
  await Genre.updateOne({ _id: g._id }, { songCount: await Song.countDocuments({ genres: g._id }) });
}

console.log(`  prerazvrstano: ${touched} pjesama`);
await mongoose.disconnect();
