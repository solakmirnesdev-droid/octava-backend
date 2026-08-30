import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import '../src/models/Artist.js';
import Artist from '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import { applyQualityGate } from './song_quality_gate.js';

const studioCarsija = `
[Intro / Uvod]:
[Am] [G] [F] [G] [Am]
[F] [G] [Em] [F] [G] [E] [Am]

[Strofa 1]
[Am]Opet [G]ću noćas [Am]sanjati [G] [Am]
[F]staru kuću [G]i avliju, [F] [G] [Am]
[F]opet će duša [G]sletjeti [F] [G] [Am]
[Em]pravo pred njenu [F]kapiju. [Em] [F]

[Strofa 2]
[G]Sanjaću dan da [Am]se ostvari san, [G] [Am]
[Dm]neću se [Em]buditi, [F] [Em] [F]
[G]i pašće kamen [E]sa srca mog [G] [E]
[E]jer ću se [Am]vratiti. [E] [Am]

[Refren]
[Dm]Lijepo je doć' [G]u svoju čaršiju, [Dm] [G]
[F]lijepo je imat' [Am]svoju avliju, [F] [Am]
[G]malu, ali [F]ipak dragu, [G] [F] [Dm] [G]
[E]i majku na kućnom [Am]pragu da te dočeka. [E] [Am]
[Dm]Lijepo je doć' [G]u svoju čaršiju, [Dm] [G]
[F]k'o pobjednik [Am]se vratiti, [F] [Am]
[C]s ljudima znati [G]kafu popiti, [C] [G] [F]
[Dm]i bol i radost [G]podijeliti, [Dm] [G] [Am]
[Am]ne možeš [G]sam umrijeti. [Am] [G] [Am]

[Prelaz / Solo]:
[Dm] [G] [Am] [F] [E7] [Am]
[Dm] [G] [E] [Am]

[Strofa 3]
[Dm]Ovdje su djedovi [G]mi stari [Dm] [G]
[Am]sjeme pos[F]adili, [F] [E7] [Am]
[Dm]amanet najljepši [G]mi dali [Dm] [G] [E]
[Am]da ovdje ostarim [G]u Bosni...

[Refren]
[Dm]Lijepo je doć' [G]u svoju čaršiju, [Dm] [G]
[F]lijepo je imat' [Am]svoju avliju, [F] [Am]
[G]malu, ali [F]ipak dragu, [G] [F] [Dm] [G]
[E]i majku na kućnom [Am]pragu da te dočeka. [E] [Am]
[Dm]Lijepo je doć' [G]u svoju čaršiju, [Dm] [G]
[F]k'o pobjednik [Am]se vratiti, [F] [Am]
[C]s ljudima znati [G]kafu popiti, [C] [G] [F]
[Dm]i bol i radost [G]podijeliti, [Dm] [G] [Am]
[Am]ne možeš [G]sam umrijeti. [Am] [G] [Am]

[Outro / Finale]:
[Dm] [G] [Am] [F] [E7] [Am]
`;

async function fixAlDinoAndCarsija() {
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Unify all Al Dino / Aldino artist profiles into canonical "Al'Dino"
  const canonicalAlDino = await Artist.findOrCreateByName("Al'Dino");
  canonicalAlDino.country = "BA";
  canonicalAlDino.origin = "Jajce, Bosna i Hercegovina";
  await canonicalAlDino.save();

  const otherAlDinos = await Artist.find({
    name: { $in: ["Al Dino", "Aldino", "Al Dino i Mostar Sevdah", "Al Dino i Goca Trzan", "Goca Trzan i Aldino", "Al Dino i Mostar Sevdah Reunion"] },
    _id: { $ne: canonicalAlDino._id }
  });

  for (const a of otherAlDinos) {
    console.log(`Reassigning songs from "${a.name}" (${a._id}) -> "Al'Dino"`);
    await Song.updateMany({ artist: a._id }, { $set: { artist: canonicalAlDino._id } });
    await Artist.deleteOne({ _id: a._id });
  }

  // 2. Set clean studio "Čaršija" under Al'Dino
  let carsija = await Song.findOne({ artist: canonicalAlDino._id, title: /carsij|čaršij/i, deletedAt: null });
  if (!carsija) {
    carsija = await Song.findOne({ title: /carsij|čaršij/i, deletedAt: null });
  }

  if (carsija) {
    carsija.title = "Čaršija";
    carsija.artist = canonicalAlDino._id;
    carsija.arrangements[0].content = applyQualityGate(studioCarsija, "Am");
    carsija.arrangements[0].originalKey = "Am";
    carsija.arrangements[0].difficulty = "easy";
    await carsija.save();
    console.log(`Updated canonical song "Čaršija" under Al'Dino (ID: ${carsija._id})`);
  }

  // 3. Delete fake cover "Avlija" under Dženan Lončarević
  const fakeAvlija = await Song.findOne({ title: "Avlija", deletedAt: null }).populate("artist", "name");
  if (fakeAvlija && fakeAvlija.artist?.name?.includes("Dženan")) {
    console.log(`Soft-deleting fake cover "Avlija" under Dženan Lončarević (ID: ${fakeAvlija._id})`);
    fakeAvlija.deletedAt = new Date();
    await fakeAvlija.save();
  }

  // 4. Update song counts
  const count = await Song.countDocuments({ artist: canonicalAlDino._id, deletedAt: null });
  canonicalAlDino.songCount = count;
  await canonicalAlDino.save();

  console.log(`\nAl'Dino now has ${count} songs in catalog.`);

  await mongoose.disconnect();
}

fixAlDinoAndCarsija().catch(console.error);
