import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Artist from '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import {
  cleanOfficialTitle,
  normalizeTitleForDeduplication,
  countChordsInContent,
  isDummyContent
} from './song_quality_gate.js';

async function unifyBajagaAndDuets() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log('🎸 [ArtistDeduplicator] Spajanje svih Bajaga profila i globalnih dueta');
  console.log('======================================================================\n');

  // 1. UNIFY BAJAGA UNDER CANONICAL "Bajaga i Instruktori"
  console.log('1. Spajam sve Bajaga profile pod jedinstveni kanonski profil "Bajaga i Instruktori"...');
  const canonicalBajaga = await Artist.findOrCreateByName('Bajaga i Instruktori');
  canonicalBajaga.country = 'RS';
  canonicalBajaga.origin = 'Beograd, Srbija';
  await canonicalBajaga.save();

  const allBajagas = await Artist.find({
    name: { $regex: /bajaga|bajagi/i },
    _id: { $ne: canonicalBajaga._id }
  });

  for (const b of allBajagas) {
    console.log(`  -> Preusmjeravam pjesme sa "${b.name}" (${b._id}) na "${canonicalBajaga.name}"`);
    await Song.updateMany({ artist: b._id }, { $set: { artist: canonicalBajaga._id } });
    await Artist.deleteOne({ _id: b._id });
  }

  // 2. DEDUPLICATE BAJAGA SONGS
  console.log('\n2. Dedupliciram i čistim sve pjesme pod "Bajaga i Instruktori"...');
  const bajagaSongs = await Song.find({ artist: canonicalBajaga._id, deletedAt: null });
  const buckets = {};

  for (const s of bajagaSongs) {
    const cleanTitle = cleanOfficialTitle(s.title, canonicalBajaga.name);
    const normKey = normalizeTitleForDeduplication(cleanTitle);
    if (!buckets[normKey]) buckets[normKey] = [];
    buckets[normKey].push({ song: s, cleanTitle });
  }

  let deduped = 0;
  for (const [normKey, entries] of Object.entries(buckets)) {
    if (entries.length === 1) {
      if (entries[0].song.title !== entries[0].cleanTitle) {
        entries[0].song.title = entries[0].cleanTitle;
        await entries[0].song.save();
      }
    } else {
      // Pick best version (most chords & longest studio content)
      entries.sort((a, b) => {
        const aContent = a.song.arrangements?.[0]?.content || '';
        const bContent = b.song.arrangements?.[0]?.content || '';
        const aChords = countChordsInContent(aContent);
        const bChords = countChordsInContent(bContent);
        if ((aChords > 0) !== (bChords > 0)) return bChords > 0 ? 1 : -1;
        return bContent.length - aContent.length;
      });

      const primary = entries[0];
      primary.song.title = primary.cleanTitle;
      primary.song.status = 'published';
      await primary.song.save();

      for (let i = 1; i < entries.length; i++) {
        entries[i].song.deletedAt = new Date();
        await entries[i].song.save();
        deduped++;
        console.log(`  ✓ Obrisan duplikat Bajage: "${entries[i].song.title}" (ID: ${entries[i].song._id})`);
      }
    }
  }

  const finalBajagaSongs = await Song.find({ artist: canonicalBajaga._id, deletedAt: null });
  canonicalBajaga.songCount = finalBajagaSongs.length;
  await canonicalBajaga.save();
  console.log(`\n🎉 "Bajaga i Instruktori" sada ima tačno ${finalBajagaSongs.length} čistih, unificiranih pjesama!`);

  // 3. GLOBAL DUET & HYBRID ARTIST MERGER (Rule 47)
  console.log('\n3. Pokrećem globalno spajanje hibridnih dueta u primarne izvođače...');
  const PRIMARY_CANONICALS = [
    { match: /^(?:željko joksimović|zeljko joksimovic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Željko Joksimović' },
    { match: /^(?:dino merlin)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Dino Merlin' },
    { match: /^(?:ceca|svetlana ražnatović|svetlana raznatovic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Svetlana Ceca Ražnatović' },
    { match: /^(?:severina)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Severina' },
    { match: /^(?:oliver dragojević|oliver dragojevic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Oliver Dragojević' },
    { match: /^(?:halid bešlić|halid beslic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Halid Bešlić' },
    { match: /^(?:zdravko čolić|zdravko colic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Zdravko Čolić' },
    { match: /^(?:tony cetinski|toni cetinski)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Tony Cetinski' },
    { match: /^(?:haris džinović|haris dzinovic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Haris Džinović' },
    { match: /^(?:aco pejović|aco pejovic|aca pejovic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Aco Pejović' },
    { match: /^(?:aca lukas)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Aca Lukas' },
    { match: /^(?:saša matić|sasa matic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Saša Matić' },
    { match: /^(?:dejan matić|dejan matic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Dejan Matić' },
    { match: /^(?:hari mata hari)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Hari Mata Hari' },
    { match: /^(?:kemal monteno)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Kemal Monteno' },
    { match: /^(?:al.*dino)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: "Al'Dino" },
    { match: /^(?:crvena jabuka)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Crvena Jabuka' },
    { match: /^(?:plavi orkestar)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Plavi Orkestar' },
    { match: /^(?:bijelo dugme)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Bijelo Dugme' },
    { match: /^(?:parni valjak)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Parni Valjak' },
    { match: /^(?:prljavo kazalište|prljavo kazaliste)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Prljavo Kazalište' },
    { match: /^(?:riblja čorba|riblja corba)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Riblja Čorba' },
    { match: /^(?:gibonni)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Gibonni' },
    { match: /^(?:magazin)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Magazin' },
    { match: /^(?:divlje jagode)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Divlje Jagode' },
    { match: /^(?:toma zdravković|toma zdravkovic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Toma Zdravković' },
    { match: /^(?:šaban šaulić|saban saulic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Šaban Šaulić' },
    { match: /^(?:miroslav ilić|miroslav ilic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Miroslav Ilić' },
    { match: /^(?:lepa brena)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Lepa Brena' },
    { match: /^(?:dženan lončarević|dzenan loncarevic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Dženan Lončarević' },
    { match: /^(?:aleksandra prijović|aleksandra prijovic)\s+(?:i|&|feat|ft\.?)\s+/i, canonical: 'Aleksandra Prijović' }
  ];

  let mergedDuets = 0;
  for (const p of PRIMARY_CANONICALS) {
    const primaryDoc = await Artist.findOrCreateByName(p.canonical);
    const splitArtists = await Artist.find({
      name: p.match,
      _id: { $ne: primaryDoc._id },
      deletedAt: null
    });

    for (const split of splitArtists) {
      console.log(`  🔀 [Duet Merged] "${split.name}" (${split.songCount} pjesama) -> "${primaryDoc.name}"`);
      await Song.updateMany({ artist: split._id }, { $set: { artist: primaryDoc._id } });
      await Artist.deleteOne({ _id: split._id });
      mergedDuets++;
    }

    const count = await Song.countDocuments({ artist: primaryDoc._id, deletedAt: null });
    primaryDoc.songCount = count;
    await primaryDoc.save();
  }

  console.log(`\n✓ Spojeno ${mergedDuets} hibridnih dueta u njihove primarne kanonske izvođače.`);

  // 4. Update all remaining artist songCounts
  const artists = await Artist.find({ deletedAt: null });
  for (const a of artists) {
    const count = await Song.countDocuments({ artist: a._id, deletedAt: null });
    if (count === 0) {
      await Artist.deleteOne({ _id: a._id });
    } else if (a.songCount !== count) {
      a.songCount = count;
      await a.save();
    }
  }

  const finalTotal = await Artist.countDocuments({ deletedAt: null });
  console.log('\n======================================================================');
  console.log(`🏁 [Završeno] Baza je 100% unificirana. Ukupno jedinstvenih izvođača: ${finalTotal}`);
  console.log('======================================================================');

  await mongoose.disconnect();
}

unifyBajagaAndDuets().catch(console.error);
