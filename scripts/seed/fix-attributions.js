/**
 * Removes wrong attributions from the demo catalogue.
 *
 * The titles were written from memory, and memory misfiled a number of them.
 * Each entry below is a title paired with the performer it does NOT belong to;
 * the correct performer keeps it.
 *
 * Only the cases worth being confident about are listed. Titles left alone
 * include ones legitimately carried by several performers — traditional songs,
 * sevdalinke, duets, and the Jala/Buba pairing.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';

/** [title, performer it was wrongly filed under] */
const WRONG = [
  ['Kafana na Balkanu', 'Aco Pejović'],          // Aca Lukas
  ['Ne lomite mi bagrenje', 'Hari Mata Hari'],   // Đorđe Balašević
  ['Loše vino', 'Bijelo Dugme'],                 // Zdravko Čolić
  ['Bacila je sve niz rijeku', 'Vatreni Poljubac'], // Indexi
  ['Kad zamirišu jorgovani', 'Vesna Zmijanac'],  // Dino Merlin
  ['Sve još miriše na nju', 'Massimo'],          // Parni Valjak
  ['Ti si mi u krvi', 'Tony Cetinski'],          // Zdravko Čolić
  ['Ti si mi u krvi', 'Miki Jevremović'],        // Zdravko Čolić
  ['Marina', 'Azra'],                            // Prljavo Kazalište
  ['Marina', 'Đorđe Balašević'],                 // Prljavo Kazalište
  ['Dođi da ostarimo zajedno', 'Halid Muslimović'], // Šaban Šaulić
  ['Nisam ti rekao', 'Sergej Ćetković'],         // Van Gogh
  ['Nekako s proljeća', 'Massimo Savić'],        // Crvena Jabuka
  ['Kad bi bio bijelo dugme', 'Đani Stipaničev'],// Bijelo Dugme
  ['Volio bih da si tu', 'Vatreni Poljubac'],    // Crvena Jabuka
  ['Jesen u meni', 'Šerif Konjević'],            // Parni Valjak
  ['Šampanjac', 'Dragana Mirković'],             // Mile Kitić
  ['Lejla', 'Željko Joksimović'],                // wrote it; Hari Mata Hari performed it
  ['Nemoj da me zaboraviš', 'Emina Jahović'],    // Toše Proeski
  ['Neka mi ne svane', 'Tony Cetinski'],         // Van Gogh
  ['Neka mi ne svane', 'Danijela Martinović'],   // Van Gogh
  ['Devojko mala', 'Đorđe Marjanović'],          // Idoli
  ['Ne dirajte mi ravnicu', 'Vinko Coce'],       // Zvonko Bogdan
  ['Ostavljam ti trag', 'Divlje Jagode'],        // uncertain; drop rather than assert
  ['Kad si sam', 'Danijela Martinović'],
  ['Kad si sam', 'Galija'],
  ['Kad si sam', 'Piloti'],
  ['Ako te pitaju', 'Massimo Savić'],
  ['Ako te pitaju', 'Ivana Selakov'],
  ['Bez tebe', 'Sikter'],
  ['Bez tebe', 'Tropico Band'],
  ['Nedelja', 'Miligram'],
  ['Nedelja', 'Vesna Zmijanac'],
  ['Nedostaješ mi', 'Đani Stipaničev'],
  ['Sve je isto samo njega nema', 'Enes Begović'],
  ['Zbog tebe', 'Antonija Šola'],
  ['Ostani', 'Zdravko Škender'],
  ['Ana', 'Neverne Bebe'],
  ['Sjaj u tami', 'Dorian Gray'],
  ['Balkan', 'Seka Aleksić']
];

await mongoose.connect(process.env.MONGODB_URI);

let removed = 0;
const missing = [];

for (const [title, artistName] of WRONG) {
  const artist = await Artist.findOne({ name: artistName });
  if (!artist) { missing.push(`${artistName} (nema izvodjaca)`); continue; }

  // Never touch a song carrying a real text.
  const res = await Song.deleteOne({ title, artist: artist._id, tags: 'demo' });
  if (res.deletedCount) removed++;
  else missing.push(`${title} — ${artistName}`);
}

for (const a of await Artist.find()) {
  await Artist.updateOne({ _id: a._id }, { songCount: await Song.countDocuments({ artist: a._id }) });
}
for (const g of await Genre.find()) {
  await Genre.updateOne({ _id: g._id }, { songCount: await Song.countDocuments({ genres: g._id }) });
}

// Artists left with nothing are noise in the browse list.
const empty = await Artist.deleteMany({ songCount: 0 });

console.log(`  uklonjeno pogresnih pripisivanja: ${removed}`);
if (missing.length) console.log(`  nije nadjeno (${missing.length}): ${missing.slice(0, 6).join(', ')}`);
console.log(`  obrisano izvodjaca bez pjesama: ${empty.deletedCount}`);
await mongoose.disconnect();
