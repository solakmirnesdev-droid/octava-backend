import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Artist from '../../src/models/Artist.js';
import { detectArtistCountry, detectArtistOrigin } from './detect_artist_country.js';

export async function healArtistCountries() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log('🌍 [CountryEnricher] Turbo Multi-Source Country & Origin Daemon Online');
  console.log('======================================================================\n');

  while (true) {
    try {
      const artists = await Artist.find({
        deletedAt: null,
        $or: [{ country: { $exists: false } }, { country: null }, { country: '' }]
      }).sort({ songCount: -1 }).limit(100);

      if (artists.length === 0) {
        console.log('[CountryEnricher] Svi izvođači u bazi imaju postavljenu državu! (100% Pokrivenost)');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      console.log(`\n[CountryEnricher] Obrađujem batch od ${artists.length} izvođača...`);
      let healedCount = 0;

      const bulkOps = [];
      for (const artist of artists) {
        const country = detectArtistCountry(artist.name, artist.origin || '');
        const origin = detectArtistOrigin(artist.name, artist.origin || '');

        if (country) {
          bulkOps.push({
            updateOne: {
              filter: { _id: artist._id },
              update: { $set: { country, origin: origin || artist.origin || '' } }
            }
          });
          healedCount++;
        }
      }

      if (bulkOps.length > 0) {
        await Artist.bulkWrite(bulkOps);
        console.log(`  ✨ [Turbo Batch] Postavljena država i porijeklo za ${healedCount} izvođača.`);
      }

      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.error('[CountryEnricher Error]', err.message);
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

if (process.argv[1]?.endsWith('artist_country_enricher.js')) {
  healArtistCountries().catch(console.error);
}
