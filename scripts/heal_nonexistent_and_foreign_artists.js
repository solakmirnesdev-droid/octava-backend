import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Artist from '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import { generateStudioAvatar } from './artist_portrait_enricher.js';

const INVERSIONS = [
  { matchArtist: /^No[cć]as Mi Srce Pati$/i, realArtist: 'Toma Zdravković', realTitle: 'Noćas mi srce pati' },
  { matchArtist: /^21 Vjek$/i, realArtist: 'Miligram', realTitle: '21. vijek' },
  { matchArtist: /^Du[sš]o Moja$/i, realArtist: 'Kemal Monteno', realTitle: 'Dušo moja' },
  { matchArtist: /^[sš]to te Ve[cč]eras Nema$/i, realArtist: 'Toma Zdravković', realTitle: 'Što te večeras nema' },
  { matchArtist: /^Dim i Prasina Daljina$/i, realArtist: 'Bajaga', realTitle: 'Daljina, dim i prašina' },
  { matchArtist: /^Dobro Jutro Tugo$/i, realArtist: 'Oliver Dragojević', realTitle: 'Dobro jutro, tugo' },
  { matchArtist: /^Sinoc Nisi Bila Tu$/i, realArtist: 'Zdravko Čolić', realTitle: 'Sinoć nisi bila tu' }
];

const FOREIGN_ARTISTS_MAP = {
  '3 doors down': { c: 'US', o: 'Escatawpa, Mississippi, SAD' },
  '4 non blondes': { c: 'US', o: 'San Francisco, California, SAD' },
  'ac/dc': { c: 'AU', o: 'Sydney, Australija' },
  'adele': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'aerosmith': { c: 'US', o: 'Boston, Massachusetts, SAD' },
  'alanis morissette': { c: 'CA', o: 'Ottawa, Kanada' },
  'avicii': { c: 'SE', o: 'Stockholm, Švedska' },
  'avril lavigne': { c: 'CA', o: 'Belleville, Ontario, Kanada' },
  'backstreet boys': { c: 'US', o: 'Orlando, Florida, SAD' },
  'beatles': { c: 'GB', o: 'Liverpool, Ujedinjeno Kraljevstvo' },
  'the beatles': { c: 'GB', o: 'Liverpool, Ujedinjeno Kraljevstvo' },
  'billie eilish': { c: 'US', o: 'Los Angeles, California, SAD' },
  'bob dylan': { c: 'US', o: 'Duluth, Minnesota, SAD' },
  'bob marley': { c: 'JM', o: 'Nine Mile, Jamajka' },
  'bon jovi': { c: 'US', o: 'Sayreville, New Jersey, SAD' },
  'bryan adams': { c: 'CA', o: 'Kingston, Ontario, Kanada' },
  'coldplay': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'cranberries': { c: 'IE', o: 'Limerick, Irska' },
  'the cranberries': { c: 'IE', o: 'Limerick, Irska' },
  'deep purple': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'dire straits': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'the doors': { c: 'US', o: 'Los Angeles, California, SAD' },
  'doors': { c: 'US', o: 'Los Angeles, California, SAD' },
  'dua lipa': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'ed sheeran': { c: 'GB', o: 'Halifax, Ujedinjeno Kraljevstvo' },
  'elton john': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'elvis presley': { c: 'US', o: 'Tupelo, Mississippi, SAD' },
  'eminem': { c: 'US', o: 'Detroit, Michigan, SAD' },
  'eric clapton': { c: 'GB', o: 'Ripley, Ujedinjeno Kraljevstvo' },
  'eros ramazzotti': { c: 'IT', o: 'Rim, Italija' },
  'europe': { c: 'SE', o: 'Upplands Väsby, Švedska' },
  'evanescence': { c: 'US', o: 'Little Rock, Arkansas, SAD' },
  'fleetwood mac': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'foo fighters': { c: 'US', o: 'Seattle, Washington, SAD' },
  'green day': { c: 'US', o: 'Rodeo, California, SAD' },
  'guns n roses': { c: 'US', o: 'Los Angeles, California, SAD' },
  "guns n' roses": { c: 'US', o: 'Los Angeles, California, SAD' },
  'iron maiden': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'james blunt': { c: 'GB', o: 'Tidworth, Ujedinjeno Kraljevstvo' },
  'john lennon': { c: 'GB', o: 'Liverpool, Ujedinjeno Kraljevstvo' },
  'judas priest': { c: 'GB', o: 'Birmingham, Ujedinjeno Kraljevstvo' },
  'lady gaga': { c: 'US', o: 'New York, SAD' },
  'led zeppelin': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'linkin park': { c: 'US', o: 'Agoura Hills, California, SAD' },
  'madonna': { c: 'US', o: 'Bay City, Michigan, SAD' },
  'metallica': { c: 'US', o: 'Los Angeles, California, SAD' },
  'michael jackson': { c: 'US', o: 'Gary, Indiana, SAD' },
  'muse': { c: 'GB', o: 'Teignmouth, Ujedinjeno Kraljevstvo' },
  'nirvana': { c: 'US', o: 'Aberdeen, Washington, SAD' },
  'oasis': { c: 'GB', o: 'Manchester, Ujedinjeno Kraljevstvo' },
  'onerepublic': { c: 'US', o: 'Colorado Springs, SAD' },
  'ozzy osbourne': { c: 'GB', o: 'Birmingham, Ujedinjeno Kraljevstvo' },
  'pearl jam': { c: 'US', o: 'Seattle, Washington, SAD' },
  'pink floyd': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'queen': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'radiohead': { c: 'GB', o: 'Abingdon, Ujedinjeno Kraljevstvo' },
  'rammstein': { c: 'DE', o: 'Berlin, Nemačka' },
  'red hot chili peppers': { c: 'US', o: 'Los Angeles, California, SAD' },
  'r.e.m.': { c: 'US', o: 'Athens, Georgia, SAD' },
  'rihanna': { c: 'BB', o: 'Saint Michael, Barbados' },
  'rolling stones': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'the rolling stones': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'roxette': { c: 'SE', o: 'Halmstad, Švedska' },
  'scorpions': { c: 'DE', o: 'Hanover, Nemačka' },
  'slipknot': { c: 'US', o: 'Des Moines, Iowa, SAD' },
  'sting': { c: 'GB', o: 'Wallsend, Ujedinjeno Kraljevstvo' },
  'system of a down': { c: 'US', o: 'Glendale, California, SAD' },
  'taylor swift': { c: 'US', o: 'West Reading, Pennsylvania, SAD' },
  'the police': { c: 'GB', o: 'London, Ujedinjeno Kraljevstvo' },
  'toto': { c: 'US', o: 'Los Angeles, California, SAD' },
  'toto cutugno': { c: 'IT', o: 'Fosdinovo, Italija' },
  'u2': { c: 'IE', o: 'Dublin, Irska' }
};

const REGIONAL_FIXES = [
  { match: /^058 Bend$/i, country: 'HR', origin: 'Split, Hrvatska', name: '058' },
  { match: /^058$/i, country: 'HR', origin: 'Split, Hrvatska', name: '058' },
  { match: /^4 Asa$/i, country: 'HR', origin: 'Zagreb, Hrvatska', name: '4 Asa' },
  { match: /^4m$/i, country: 'HR', origin: 'Zagreb, Hrvatska', name: 'Kvartet 4M' },
  { match: /^7 Mladih$/i, country: 'RS', origin: 'Beograd, Srbija', name: '7 Mladih' }
];

async function healAll() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log('🛡️ [ArtistSanitizer] Čišćenje nepostojećih, invertovanih i stranih izvođača');
  console.log('======================================================================\n');

  // 1. Fix Inverted Artists
  console.log('1. Popravljam invertovane parove izvođač-pjesma...');
  for (const inv of INVERSIONS) {
    const artistDoc = await Artist.findOne({ name: inv.matchArtist, deletedAt: null });
    if (artistDoc) {
      const realArtistDoc = await Artist.findOrCreateByName(inv.realArtist);
      const song = await Song.findOne({ artist: artistDoc._id, deletedAt: null });
      if (song) {
        const existing = await Song.findOne({
          artist: realArtistDoc._id,
          title: new RegExp(`^${inv.realTitle.replace(/[\(\)\[\]\.\,\-]/g, '')}`, 'i'),
          deletedAt: null,
          _id: { $ne: song._id }
        });

        if (existing) {
          console.log(`  ✓ [Duplicate Inverted] Pjesma "${inv.realTitle}" već postoji pod "${realArtistDoc.name}". Brišem duplikat.`);
          await Song.deleteOne({ _id: song._id });
        } else {
          console.log(`  ✓ [Fix Inverted] Izvođač "${artistDoc.name}" -> Pjesma "${inv.realTitle}" pod "${realArtistDoc.name}"`);
          const cleanSlug = `${inv.realTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
          await Song.collection.updateOne(
            { _id: song._id },
            { $set: { title: inv.realTitle, artist: realArtistDoc._id, slug: cleanSlug } }
          );
        }
      }
      await Artist.deleteOne({ _id: artistDoc._id });
    }
  }

  // 2. Delete pure junk artists & songs (e.g. "123", "Nepoznat")
  console.log('\n2. Brišem lažne i nepostojeće izvođače ("123", "Nepoznat")...');
  const junk123 = await Artist.findOne({ name: /^123$/i });
  if (junk123) {
    await Song.deleteMany({ artist: junk123._id });
    await Artist.deleteOne({ _id: junk123._id });
    console.log('  ✓ Obrisan lažni izvođač i pjesma "123"');
  }

  const nepoznat = await Artist.findOne({ name: /^nepoznat$/i });
  if (nepoznat) {
    const teskaInd = await Artist.findOrCreateByName('Teška Industrija');
    await Song.updateMany({ artist: nepoznat._id, title: /jutarnja/i }, { $set: { artist: teskaInd._id } });
    await Song.deleteMany({ artist: nepoznat._id });
    await Artist.deleteOne({ _id: nepoznat._id });
    console.log('  ✓ Očišćen profil "Nepoznat" i preusmjerena pjesma');
  }

  // 3. Purge 0-Song Ghost Artists
  console.log('\n3. Brišem sve prazne profile sa 0 pjesama...');
  const allArtists = await Artist.find({ deletedAt: null });
  let purgedZero = 0;
  for (const a of allArtists) {
    const count = await Song.countDocuments({ artist: a._id, deletedAt: null });
    if (count === 0) {
      await Artist.deleteOne({ _id: a._id });
      purgedZero++;
    } else if (a.songCount !== count) {
      a.songCount = count;
      await a.save();
    }
  }
  console.log(`  ✓ Obrisano ${purgedZero} praznih profila sa 0 pjesama.`);

  // 4. Fix Regional Bands (058, 4 Asa, 4M, 7 Mladih)
  console.log('\n4. Ažuriram tačne podatke za regionalne bendove...');
  for (const rf of REGIONAL_FIXES) {
    const a = await Artist.findOne({ name: rf.match, deletedAt: null });
    if (a) {
      a.name = rf.name;
      a.country = rf.country;
      a.origin = rf.origin;
      await a.save();
      console.log(`  ✓ Ažuriran bend: "${a.name}" [${a.country}] (${a.origin})`);
    }
  }

  // 5. Fix Foreign / Western Artists (Country, Origin, Status = Draft)
  console.log('\n5. Standardizujem strane / internacionalne izvođače (postavljam prave države i status: draft)...');
  let foreignCount = 0;
  for (const [nameKey, info] of Object.entries(FOREIGN_ARTISTS_MAP)) {
    const a = await Artist.findOne({ name: new RegExp(`^${nameKey}$`, 'i'), deletedAt: null });
    if (a) {
      a.country = info.c;
      a.origin = info.o;
      await a.save();

      // Set all songs to draft per Quality Gate Rule 33
      await Song.updateMany({ artist: a._id }, { $set: { status: 'draft' } });
      foreignCount++;
      console.log(`  🌐 [Foreign Artist Standardized] "${a.name}" [${info.c}] (${info.o}) -> Status: draft`);
    }
  }
  console.log(`  ✓ Ukupno standardizovano ${foreignCount} stranih izvođača.`);

  // 6. Fix "357" picture (replace bad sticker image with clean text-free silhouette)
  const band357 = await Artist.findOne({ name: /^357$/i, deletedAt: null });
  if (band357) {
    console.log('\n6. Čistim sliku za bend "357" (zamjena naljepnice čistim vizualom)...');
    const textFreeBuf = await generateStudioAvatar('357');
    band357.image = textFreeBuf;
    band357.imageBytes = textFreeBuf.length;
    band357.imageType = 'image/webp';
    band357.imageSource = 'Octava Text-Free Studio Avatar';
    band357.origin = 'Beograd, Srbija';
    band357.country = 'RS';
    await band357.save();
    console.log('  ✓ Postavljena čista WebP silueta bez teksta za "357".');
  }

  const finalTotal = await Artist.countDocuments({ deletedAt: null });
  console.log('\n======================================================================');
  console.log(`🏁 [Čišćenje Završeno] Baza je očišćena. Ukupno validnih izvođača: ${finalTotal}`);
  console.log('======================================================================');

  await mongoose.disconnect();
}

healAll().catch(console.error);
