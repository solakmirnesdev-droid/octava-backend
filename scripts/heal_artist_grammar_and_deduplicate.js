import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Artist from '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import { toLatin } from '../src/utils/latinise.js';

// Official Master Dictionary of Balkan & International Artists with 100% Verified Grammar & Diacritics
export const CANONICAL_OFFICIAL_ARTISTS = {
  // Pop / Folk / Zabavna
  'aco pejovic': 'Aco Pejović',
  'aco pejović': 'Aco Pejović',
  'aca lukas': 'Aca Lukas',
  'dino merlin': 'Dino Merlin',
  'halid beslic': 'Halid Bešlić',
  'halid bešlić': 'Halid Bešlić',
  'halid muslimovic': 'Halid Muslimović',
  'halid muslimović': 'Halid Muslimović',
  'haris dzinovic': 'Haris Džinović',
  'haris džinović': 'Haris Džinović',
  'zdravko colic': 'Zdravko Čolić',
  'zdravko čolić': 'Zdravko Čolić',
  'zeljko samardzic': 'Željko Samardžić',
  'zeljko samardžić': 'Željko Samardžić',
  'zeljko joksimovic': 'Željko Joksimović',
  'zeljko joksimović': 'Željko Joksimović',
  'zeljko bebek': 'Željko Bebek',
  'zeljko sasic': 'Željko Šašić',
  'zeljko šašić': 'Željko Šašić',
  'sasa matic': 'Saša Matić',
  'sasa matić': 'Saša Matić',
  'saša matic': 'Saša Matić',
  'saša matić': 'Saša Matić',
  'dejan matic': 'Dejan Matić',
  'dejan matić': 'Dejan Matić',
  'sasa kovacevic': 'Saša Kovačević',
  'saša kovačević': 'Saša Kovačević',
  'saban saulic': 'Šaban Šaulić',
  'šaban šaulić': 'Šaban Šaulić',
  'saban bajramovic': 'Šaban Bajramović',
  'šaban bajramović': 'Šaban Bajramović',
  'sinan sakic': 'Sinan Sakić',
  'sinan sakić': 'Sinan Sakić',
  'toma zdravkovic': 'Toma Zdravković',
  'toma zdravković': 'Toma Zdravković',
  'miroslav ilic': 'Miroslav Ilić',
  'miroslav ilić': 'Miroslav Ilić',
  'oliver dragojevic': 'Oliver Dragojević',
  'oliver dragojević': 'Oliver Dragojević',
  'oliver mandic': 'Oliver Mandić',
  'oliver mandić': 'Oliver Mandić',
  'kemal monteno': 'Kemal Monteno',
  'kemal malovcic': 'Kemal Malovčić',
  'kemal malovčić': 'Kemal Malovčić',
  'gibonni': 'Gibonni',
  'petar graso': 'Petar Grašo',
  'petar grašo': 'Petar Grašo',
  'tose proeski': 'Toše Proeski',
  'toše proeski': 'Toše Proeski',
  'vlado georgiev': 'Vlado Georgiev',
  'djordje balasevic': 'Đorđe Balašević',
  'đorđe balašević': 'Đorđe Balašević',
  'dzej': 'Džej Ramadanovski',
  'dzej ramadanovski': 'Džej Ramadanovski',
  'džej': 'Džej Ramadanovski',
  'džej ramadanovski': 'Džej Ramadanovski',
  'marinko rokvic': 'Marinko Rokvić',
  'marinko rokvic': 'Marinko Rokvić',
  'nikola rokvic': 'Nikola Rokvić',
  'nikola rokvić': 'Nikola Rokvić',
  'ljuba alicic': 'Ljuba Aličić',
  'ljuba aličić': 'Ljuba Aličić',
  'enes begovic': 'Enes Begović',
  'enes begović': 'Enes Begović',
  'serif konjevic': 'Šerif Konjević',
  'šerif konjević': 'Šerif Konjević',
  'mile kitic': 'Mile Kitić',
  'mile kitić': 'Mile Kitić',
  'mitar miric': 'Mitar Mirić',
  'mitar mirić': 'Mitar Mirić',
  'nedeljko bajic baja': 'Nedeljko Bajić Baja',
  'nedeljko bajić baja': 'Nedeljko Bajić Baja',
  'osman hadzic': 'Osman Hadžić',
  'osman hadžić': 'Osman Hadžić',
  'safet isovic': 'Safet Isović',
  'safet isović': 'Safet Isović',
  'himzo polovina': 'Himzo Polovina',
  'hanka paldum': 'Hanka Paldum',
  'silvana armenulic': 'Silvana Armenulić',
  'silvana armenulić': 'Silvana Armenulić',
  'nedzad salkovic': 'Nedžad Salković',
  'nedžad salković': 'Nedžad Salković',
  'lepa brena': 'Lepa Brena',
  'ceca': 'Ceca',
  'svetlana ceca raznatovic': 'Ceca',
  'svetlana raznatovic': 'Ceca',
  'dragana mirkovic': 'Dragana Mirković',
  'dragana mirković': 'Dragana Mirković',
  'ana bekuta': 'Ana Bekuta',
  'snezana djurisic': 'Snežana Đurišić',
  'snežana đurišić': 'Snežana Đurišić',
  'zorica brunclik': 'Zorica Brunclik',
  'vesna zmijanac': 'Vesna Zmijanac',
  'severina': 'Severina',
  'jelena rozga': 'Jelena Rozga',
  'nina badric': 'Nina Badrić',
  'nina badrić': 'Nina Badrić',
  'goca trzan': 'Goca Tržan',
  'goca tržan': 'Goca Tržan',
  'natasa bekvalac': 'Nataša Bekvalac',
  'nataša bekvalac': 'Nataša Bekvalac',
  'jelena karleusa': 'Jelena Karleuša',
  'jelena karleuša': 'Jelena Karleuša',
  'aleksandra prijovic': 'Aleksandra Prijović',
  'aleksandra prijović': 'Aleksandra Prijović',
  'tea tairovic': 'Tea Tairović',
  'tea tairović': 'Tea Tairović',
  'milica pavlovic': 'Milica Pavlović',
  'milica pavlović': 'Milica Pavlović',
  'seka aleksic': 'Seka Aleksić',
  'seka aleksić': 'Seka Aleksić',
  'tanja savic': 'Tanja Savić',
  'tanja savić': 'Tanja Savić',
  'darko lazic': 'Darko Lazić',
  'darko lazić': 'Darko Lazić',
  'sergej cetkovic': 'Sergej Ćetković',
  'sergej ćetković': 'Sergej Ćetković',
  'toni cetinski': 'Toni Cetinski',
  'tony cetinski': 'Tony Cetinski',
  'boris novkovic': 'Boris Novković',
  'boris novković': 'Boris Novković',
  'davorin popovic': 'Davorin Popović',
  'davorin popović': 'Davorin Popović',
  'jadranka stojakovic': 'Jadranka Stojaković',
  'jadranka stojaković': 'Jadranka Stojaković',
  'arsen dedic': 'Arsen Dedić',
  'arsen dedić': 'Arsen Dedić',
  'massimo savic': 'Massimo Savić',
  'massimo savić': 'Massimo Savić',
  'massimo': 'Massimo Savić',
  'goran karan': 'Goran Karan',
  'hari mata hari': 'Hari Mata Hari',
  'al dino': 'Al\'Dino',
  'aldino': 'Al\'Dino',
  'bozo vreco': 'Božo Vrećo',
  'božo vrećo': 'Božo Vrećo',
  'amira medunjanin': 'Amira Medunjanin',
  'damir imamovic': 'Damir Imamović',
  'damir imamović': 'Damir Imamović',
  'tozovac': 'Predrag Živković Tozovac',
  'predrag zivkovic tozovac': 'Predrag Živković Tozovac',
  'predrag živković tozovac': 'Predrag Živković Tozovac',

  // Rock & Bendovi
  'bijelo dugme': 'Bijelo Dugme',
  'azra': 'Azra',
  'riblja corba': 'Riblja Čorba',
  'riblja čorba': 'Riblja Čorba',
  'parni valjak': 'Parni Valjak',
  'crvena jabuka': 'Crvena Jabuka',
  'bajaga': 'Bajaga',
  'bajaga i instruktori': 'Bajaga & Instruktori',
  'plavi orkestar': 'Plavi Orkestar',
  'zabranjeno pusenje': 'Zabranjeno Pušenje',
  'zabranjeno pušenje': 'Zabranjeno Pušenje',
  'prljavo kazaliste': 'Prljavo Kazalište',
  'prljavo kazalište': 'Prljavo Kazalište',
  'divlje jagode': 'Divlje Jagode',
  'indexi': 'Indexi',
  'indeksi': 'Indexi',
  'ekv': 'EKV',
  'ekatarina velika': 'Ekatarina Velika',
  'partibrejkers': 'Partibrejkers',
  'van gogh': 'Van Gogh',
  'kerber': 'Kerber',
  'galija': 'Galija',
  'smak': 'Smak',
  'generacija 5': 'Generacija 5',
  'osvajaci': 'Osvajači',
  'osvajači': 'Osvajači',
  'yu grupa': 'YU Grupa',
  'atomsko skloniste': 'Atomsko Sklonište',
  'atomsko sklonište': 'Atomsko Sklonište',
  'psihomodo pop': 'Psihomodo Pop',
  'hladno pivo': 'Hladno Pivo',
  'elektricni orgazam': 'Električni Orgazam',
  'električni orgazam': 'Električni Orgazam',
  'idoli': 'Idoli',
  'film': 'Film',
  'haustor': 'Haustor',
  'disciplina kicme': 'Disciplina Kičme',
  'disciplina kičme': 'Disciplina Kičme',
  'korni grupa': 'Korni Grupa',
  'time': 'Time',
  'leb i sol': 'Leb i Sol',
  'poslednja igra leptira': 'Poslednja Igra Leptira',
  'alisa': 'Alisa',
  'valentino': 'Valentino',
  'bolero': 'Bolero',
  'regina': 'Regina',
  'bombaj stampa': 'Bombaj Štampa',
  'bombaj štampa': 'Bombaj Štampa',
  'letu stuke': 'Letu Štuke',
  'letu štuke': 'Letu Štuke',
  'zoster': 'Zoster',
  'dubioza kolektiv': 'Dubioza Kolektiv',
  's.a.r.s.': 'S.A.R.S.',
  'sars': 'S.A.R.S.',
  'mostar sevdah reunion': 'Mostar Sevdah Reunion',
  'divanhana': 'Divanhana',
  'magazin': 'Magazin',
  'novi fosili': 'Novi Fosili',
  'srebrna krila': 'Srebrna Krila',
  'amadeus band': 'Amadeus Band',
  'lexington band': 'Lexington Band',
  'tropico band': 'Tropico Band',
  'lapsus band': 'Lapsus Band',
  'miligram': 'Miligram',
  'in vivo': 'In Vivo',
  'nervozni postar': 'Nervozni Poštar',
  'nervozni poštar': 'Nervozni Poštar',

  // Trap / Rap / Modern
  'voyage': 'Voyage',
  'nucci': 'Nucci',
  'breskvica': 'Breskvica',
  'senidah': 'Senidah',
  'rasta': 'Rasta',
  'devito': 'Devito',
  'jala brat': 'Jala Brat',
  'buba corelli': 'Buba Corelli',
  'coby': 'Coby',
  'relja': 'Relja Popović',
  'relja popovic': 'Relja Popović',
  'relja popović': 'Relja Popović',
  'nikolija': 'Nikolija',
  'crni cerak': 'Crni Cerak',
  'sajfer': 'Sajfer',
  'frenkie': 'Frenkie',
  'edo maajka': 'Edo Maajka',
  'helem nejse': 'Helem Nejse'
};

function toAsciiSlug(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/[š]/g, 's')
    .replace(/[đ]/g, 'dj')
    .replace(/[ž]/g, 'z')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeKey(str) {
  return toAsciiSlug(str).replace(/[^a-z0-9]/g, '');
}

function toGrammaticalTitleCase(name) {
  if (!name) return '';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const lower = trimmed.toLowerCase();

  // 1. Check exact dictionary match
  if (CANONICAL_OFFICIAL_ARTISTS[lower]) {
    return CANONICAL_OFFICIAL_ARTISTS[lower];
  }

  // 2. Normalize and apply Balkan Diacritics Rules
  const words = trimmed.split(' ');
  const transformedWords = words.map((w, idx) => {
    let word = w.trim();
    if (!word) return '';

    // Handle all lowercase particles
    const lowerWord = word.toLowerCase();
    if (idx > 0 && ['i', 'and', '&', 'feat', 'feat.', 'ft.', 'de', 'la', 'von', 'van'].includes(lowerWord)) {
      if (lowerWord === 'and') return '&';
      return lowerWord;
    }

    // Capitalize first letter, lowercase rest
    let cap = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

    // Suffix rules: All Balkan surnames ending in -ic -> -ić
    if (/^[A-ZČĆŠĐŽa-zčćšđž]+(ic|ič)$/i.test(cap)) {
      cap = cap.replace(/(ic|ič)$/i, 'ić');
    }
    // Prefix / Name rules
    if (/^dj/i.test(cap) && cap.length > 3) {
      cap = 'Đ' + cap.slice(2);
    }
    if (/^dz/i.test(cap) && cap.length > 3) {
      cap = 'Dž' + cap.slice(2);
    }
    if (/^saban/i.test(cap)) cap = 'Šaban' + cap.slice(5);
    if (/^sasa/i.test(cap)) cap = 'Saša' + cap.slice(4);
    if (/^serif/i.test(cap)) cap = 'Šerif' + cap.slice(5);
    if (/^zeljko/i.test(cap)) cap = 'Željko' + cap.slice(6);
    if (/^zarko/i.test(cap)) cap = 'Žarko' + cap.slice(5);
    if (/^dusko/i.test(cap)) cap = 'Duško' + cap.slice(5);
    if (/^miso/i.test(cap)) cap = 'Mišo' + cap.slice(4);
    if (/^sinisa/i.test(cap)) cap = 'Siniša' + cap.slice(6);
    if (/^nedzad/i.test(cap)) cap = 'Nedžad' + cap.slice(6);
    if (/^bozo/i.test(cap)) cap = 'Božo' + cap.slice(4);
    if (/^dzej/i.test(cap)) cap = 'Džej' + cap.slice(4);

    return cap;
  });

  return transformedWords.filter(Boolean).join(' ');
}

export async function healAllArtists() {
  console.log('======================================================================');
  console.log('💎  OCTAVA MASTER ARTIST HEALER & ZERO-DUPLICATE HARMONIZER');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Connected to MongoDB Atlas Cloud.\n');

  const allArtists = await Artist.find({ deletedAt: null }).lean();
  console.log(`📊 Ukupno pronađeno ${allArtists.length} izvođača u bazi na Atlasu.\n`);

  // Group by normalized key
  const groups = new Map();
  for (const a of allArtists) {
    const key = normalizeKey(a.name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(a);
  }

  let renamedCount = 0;
  let mergedGroupsCount = 0;
  let songsReassignedCount = 0;
  let duplicateDocsDeleted = 0;

  const artistBulkOps = [];
  const songsReassignOps = [];
  const deleteArtistOps = [];

  const pendingSlugsInBulk = new Set();
  const existingArtists = await Artist.find({ deletedAt: null }).select('_id slug').lean();
  for (const a of existingArtists) {
    if (a.slug) pendingSlugsInBulk.add(a.slug);
  }

  for (const [key, group] of groups.entries()) {
    if (!key) continue;

    // Pick the canonical candidate
    let canonical = group[0];
    let bestScore = -1;

    for (const doc of group) {
      let score = 0;
      if (doc.imageBytes && doc.imageBytes > 0) score += 50;
      if (doc.country) score += 20;
      if (doc.origin) score += 10;
      if (doc.name.includes('ć') || doc.name.includes('č') || doc.name.includes('š') || doc.name.includes('đ') || doc.name.includes('ž')) score += 30;
      if (score > bestScore) {
        bestScore = score;
        canonical = doc;
      }
    }

    // Determine the 100% official grammatical name
    const rawLower = canonical.name.toLowerCase().trim();
    let officialName = CANONICAL_OFFICIAL_ARTISTS[rawLower] || toGrammaticalTitleCase(canonical.name);
    if (!officialName) officialName = canonical.name;

    const baseSlug = toAsciiSlug(officialName);
    let canonicalSlug = baseSlug;

    if (pendingSlugsInBulk.has(canonicalSlug) && canonical.slug !== canonicalSlug) {
      let counter = 1;
      while (pendingSlugsInBulk.has(`${baseSlug}-${counter}`)) {
        counter++;
      }
      canonicalSlug = `${baseSlug}-${counter}`;
    }
    pendingSlugsInBulk.add(canonicalSlug);

    // 1. Update Canonical Document
    const nameChanged = canonical.name !== officialName;
    const slugChanged = canonical.slug !== canonicalSlug;

    if (nameChanged || slugChanged) {
      const setDoc = { name: officialName, updatedAt: new Date() };
      if (slugChanged) {
        setDoc.slug = canonicalSlug;
      }
      artistBulkOps.push({
        updateOne: {
          filter: { _id: canonical._id },
          update: { $set: setDoc }
        }
      });
      renamedCount++;
    }

    // 2. Deduplicate: Merge all other duplicates in the group into canonical
    if (group.length > 1) {
      mergedGroupsCount++;
      for (const dup of group) {
        if (dup._id.toString() === canonical._id.toString()) continue;

        // Reassign songs in bulk
        songsReassignOps.push({
          updateMany: {
            filter: { artist: dup._id },
            update: { $set: { artist: canonical._id } }
          }
        });

        // Soft-delete duplicate with unique deleted slug
        deleteArtistOps.push({
          updateOne: {
            filter: { _id: dup._id },
            update: { $set: { deletedAt: new Date(), slug: `deleted-${dup._id}` } }
          }
        });
        duplicateDocsDeleted++;
      }
    }
  }

  if (songsReassignOps.length > 0) {
    console.log(`🎵 Reassigning songs from ${songsReassignOps.length} duplicate artist profiles to canonical ones in bulk...`);
    const CHUNK = 200;
    for (let i = 0; i < songsReassignOps.length; i += CHUNK) {
      await Song.bulkWrite(songsReassignOps.slice(i, i + CHUNK), { ordered: false });
    }
  }

  if (artistBulkOps.length > 0) {
    console.log(`💾 Writing ${artistBulkOps.length} artist grammar & slug updates to Atlas in bulk...`);
    const CHUNK = 200;
    for (let i = 0; i < artistBulkOps.length; i += CHUNK) {
      await Artist.bulkWrite(artistBulkOps.slice(i, i + CHUNK), { ordered: false });
    }
  }

  if (deleteArtistOps.length > 0) {
    console.log(`🧹 Purging ${deleteArtistOps.length} duplicate artist documents in bulk...`);
    const CHUNK = 200;
    for (let i = 0; i < deleteArtistOps.length; i += CHUNK) {
      await Artist.bulkWrite(deleteArtistOps.slice(i, i + CHUNK), { ordered: false });
    }
  }

  console.log('\n======================================================================');
  console.log('🎉 REZULTAT PROVJERE I POLIRANJA IZVOĐAČA NA ATLASU:');
  console.log('======================================================================');
  console.log(`✅ Gramatički ispravljeno i dodijeljene kvačice (č,ć,š,đ,ž): ${renamedCount} izvođača`);
  console.log(`🔗 Duplikata pronađeno i spojeno u kanonske profile:       ${mergedGroupsCount} grupa (${duplicateDocsDeleted} dokumenata)`);
  console.log(`🎵 Pjesama preusmjereno na kanonske izvođače:              ${songsReassignedCount} grupa`);
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

healAllArtists().catch(err => {
  console.error('[Artist Healer Error]', err);
});
