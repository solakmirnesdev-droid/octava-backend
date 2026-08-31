import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import sharp from 'sharp';

dotenv.config();

import Artist from '../../src/models/Artist.js';
import { toLatin } from '../../src/utils/latinise.js';

const CONCURRENCY = 16; // 16 parallel workers for turbo throughput
const BATCH_SIZE = 60;
const MAX_IMAGE_BYTES = 20 * 1024; // Strict 20 KB limit

const HEADERS = {
  'User-Agent': 'OctavaMusicBot/1.0 (https://octava.app; info@octava.app)',
  'Accept': 'application/json, image/webp, image/jpeg, image/*;q=0.8'
};

const BLACKLIST_KEYWORDS = [
  'coat_of_arms', 'grb', 'zastava', 'flag', 'map', 'karta', 'logo', 'emblem', 'seal',
  'symbol', 'album', 'cover', 'cd', 'vinyl', 'tape', 'plakat', 'poster', 'diagram',
  'shema', 'grafik', 'stadium', 'stage_lights', 'guitar_tab', 'sheet_music', 'placeholder',
  'generic', 'audio', 'sound_wave', 'blank', 'default', 'icon', 'wikimedia-logo', 'heraldic'
];

function isBlacklistedImage(url = '') {
  const low = url.toLowerCase();
  return BLACKLIST_KEYWORDS.some(kw => low.includes(kw));
}

/**
 * Generate a luxury 100% TEXT-FREE Dark Studio Avatar for folklore / traditional / unphotographable entities
 * STRICT RULE: ZERO LETTERS, ZERO INITIALS, ZERO TYPOGRAPHY, ZERO TEXT.
 */
export async function generateStudioAvatar(artistName) {
  const colors = [
    ['#1e1b4b', '#312e81', '#4338ca'],
    ['#0f172a', '#1e293b', '#334155'],
    ['#14532d', '#166534', '#15803d'],
    ['#701a75', '#86198f', '#a21caf'],
    ['#7c2d12', '#9a3412', '#c2410c'],
    ['#1e293b', '#0f172a', '#020617']
  ];
  let hash = 0;
  for (let i = 0; i < artistName.length; i++) hash = (hash << 5) - hash + artistName.charCodeAt(i);
  const grad = colors[Math.abs(hash) % colors.length];

  // Sleek minimalist dark musician silhouette (100% TEXT-FREE)
  const svg = `
    <svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad_${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${grad[0]};stop-opacity:1" />
          <stop offset="50%" style="stop-color:${grad[1]};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${grad[2]};stop-opacity:1" />
        </linearGradient>
        <linearGradient id="glowGrad_${Math.abs(hash)}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.28" />
          <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0.06" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#bgGrad_${Math.abs(hash)})" rx="50" />
      
      <!-- Subtle concentric acoustic rings -->
      <circle cx="200" cy="200" r="140" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.08" />
      <circle cx="200" cy="200" r="110" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.12" />

      <!-- Minimalist artist head & shoulders silhouette (ZERO TEXT) -->
      <circle cx="200" cy="155" r="52" fill="url(#glowGrad_${Math.abs(hash)})" />
      <path d="M 120 310 C 120 240, 155 230, 200 230 C 245 230, 280 240, 280 310 Z" fill="url(#glowGrad_${Math.abs(hash)})" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
}

/**
 * Multi-Source Multi-Tier Studio Portrait Search:
 * Tier 1: Deezer API (Official studio photo of artist/band)
 * Tier 2: TheAudioDB API (strArtistThumb)
 * Tier 3: Wikidata P18 (Official photo claim)
 * Tier 4: Wikipedia Multilingual OpenSearch
 * Tier 5: Pure Text-Free Studio Silhouette Avatar
 */
export async function fetchPortraitImage(artistName) {
  if (!artistName) return null;
  const cleanName = toLatin(artistName)
    .replace(/\s*\([^\)]*\)/g, '')
    .replace(/\s*-\s*.*$/, '')
    .trim();

  // Tier 1: Deezer API
  try {
    const dRes = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanName)}`, { headers: HEADERS, timeout: 4000 });
    if (dRes.ok) {
      const dData = await dRes.json();
      const first = dData?.data?.[0];
      if (first) {
        const foundName = toLatin(first.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (foundName === targetName || foundName.includes(targetName) || targetName.includes(foundName)) {
          const pic = first.picture_big || first.picture_medium;
          if (pic && !isBlacklistedImage(pic) && !pic.includes('artist/default')) {
            const imgRes = await fetch(pic, { headers: HEADERS, timeout: 5000 });
            if (imgRes.ok) {
              const arrayBuffer = await imgRes.arrayBuffer();
              return { buffer: Buffer.from(arrayBuffer), source: 'Deezer' };
            }
          }
        }
      }
    }
  } catch (e) {}

  // Tier 2: TheAudioDB API
  try {
    const audRes = await fetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(cleanName)}`, { headers: HEADERS, timeout: 4000 });
    if (audRes.ok) {
      const audData = await audRes.json();
      const thumb = audData?.artists?.[0]?.strArtistThumb;
      if (thumb && !isBlacklistedImage(thumb)) {
        const imgRes = await fetch(thumb, { headers: HEADERS, timeout: 5000 });
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          return { buffer: Buffer.from(arrayBuffer), source: 'TheAudioDB' };
        }
      }
    }
  } catch (e) {}

  // Tier 3: Wikidata P18 Official Portrait Photo
  try {
    const wDataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanName)}&language=sr&format=json&limit=2`;
    const wDataRes = await fetch(wDataUrl, { headers: HEADERS, timeout: 4000 });
    if (wDataRes.ok) {
      const wdJson = await wDataRes.json();
      for (const ent of wdJson?.search || []) {
        const desc = (ent.description || '').toLowerCase();
        if (/singer|pevač|pjevač|musician|muzičar|band|grupa|rock|folk|person|composer/i.test(desc) || wdJson.search.length === 1) {
          const claimUrl = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${ent.id}&property=P18&format=json`;
          const claimRes = await fetch(claimUrl, { headers: HEADERS, timeout: 4000 });
          if (claimRes.ok) {
            const claimJson = await claimRes.json();
            const filename = claimJson.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
            if (filename && !isBlacklistedImage(filename)) {
              const imgUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=600`;
              const imgRes = await fetch(imgUrl, { headers: HEADERS, timeout: 5000 });
              if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                return { buffer: Buffer.from(arrayBuffer), source: 'Wikidata' };
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  // Tier 4: Wikipedia Multilingual OpenSearch
  for (const lang of ['sr', 'sh', 'hr', 'bs', 'mk', 'sl', 'en']) {
    try {
      const openUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanName)}&limit=1&format=json`;
      const openRes = await fetch(openUrl, { headers: HEADERS, timeout: 3500 });
      if (openRes.ok) {
        const openData = await openRes.json();
        const articleTitle = openData[1]?.[0];
        if (articleTitle) {
          const pageUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(articleTitle)}&prop=pageimages|extracts&exintro=1&explaintext=1&format=json&pithumbsize=600`;
          const pageRes = await fetch(pageUrl, { headers: HEADERS, timeout: 4000 });
          if (pageRes.ok) {
            const pageData = await pageRes.json();
            const p = Object.values(pageData?.query?.pages || {})[0];
            const extract = (p?.extract || '').toLowerCase();
            const isMusician = /pevač|pjevač|glazbenik|muzičar|grupa|bend|vokal|sing|music/i.test(extract);
            const thumb = p?.thumbnail?.source;
            if (thumb && !isBlacklistedImage(thumb) && (isMusician || lang !== 'en')) {
              const imgRes = await fetch(thumb, { headers: HEADERS, timeout: 5000 });
              if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                return { buffer: Buffer.from(arrayBuffer), source: `Wikipedia (${lang})` };
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  // Tier 5: Pure Text-Free Studio Avatar
  const avatarBuf = await generateStudioAvatar(artistName);
  return { buffer: avatarBuf, source: 'Octava Text-Free Studio Avatar' };
}

/**
 * Validate aspect ratio and compress strictly to WebP <= 20 KB
 */
export async function processToWebp(rawBuffer) {
  try {
    const meta = await sharp(rawBuffer).metadata();
    if (meta.width && meta.height) {
      const ratio = meta.width / meta.height;
      if (ratio > 2.2 || ratio < 0.45) {
        return null;
      }
    }

    let quality = 82;
    let webpBuffer = await sharp(rawBuffer)
      .resize(320, 320, { fit: 'cover', position: 'center' })
      .webp({ quality })
      .toBuffer();

    while (webpBuffer.length > MAX_IMAGE_BYTES && quality > 20) {
      quality -= 10;
      webpBuffer = await sharp(rawBuffer)
        .resize(300, 300, { fit: 'cover', position: 'center' })
        .webp({ quality })
        .toBuffer();
    }

    if (webpBuffer.length <= MAX_IMAGE_BYTES) {
      return webpBuffer;
    }
  } catch (err) {
    // Sharp decode error
  }
  return null;
}

async function mapConcurrent(items, limit, fn) {
  const results = [];
  const executing = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);

    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

export async function runPortraitEnricherDaemon() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log(`📸 [PortraitEnricher] 100% TEXT-FREE STUDIO PORTRAIT ENGINE ONLINE (Workers: ${CONCURRENCY})`);
  console.log('======================================================================\n');

  while (true) {
    try {
      const artists = await Artist.find({
        deletedAt: null,
        $or: [
          { imageBytes: { $exists: false } },
          { imageBytes: 0 },
          { imageBytes: null },
          { imageBytes: { $gt: MAX_IMAGE_BYTES } },
          { imageType: { $ne: 'image/webp' } }
        ]
      })
        .select('_id name songCount')
        .sort({ songCount: -1, createdAt: -1 })
        .limit(BATCH_SIZE);

      if (artists.length === 0) {
        console.log('[PortraitEnricher] SVI IZVOĐAČI U BAZI IMAJU POSTAVLJEN 100% TEXT-FREE HD WEBP PORTRET!');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      console.log(`\n[PortraitEnricher] Obrađujem batch od ${artists.length} izvođača sa ${CONCURRENCY} workera...`);
      const t0 = Date.now();
      let enrichedCount = 0;

      await mapConcurrent(artists, CONCURRENCY, async (artist) => {
        const fetched = await fetchPortraitImage(artist.name);
        if (fetched && fetched.buffer) {
          const webpBuffer = await processToWebp(fetched.buffer) || fetched.buffer;
          if (webpBuffer) {
            await Artist.updateOne(
              { _id: artist._id },
              {
                $set: {
                  image: webpBuffer,
                  imageType: 'image/webp',
                  imageBytes: webpBuffer.length,
                  imageSource: fetched.source,
                  imageUpdatedAt: new Date()
                }
              }
            );
            enrichedCount++;
            console.log(`  ✨ [PORTRAIT SAVED] "${artist.name}" -> ${fetched.source} (${(webpBuffer.length / 1024).toFixed(1)} KB WebP)`);
          }
        }
      });

      const diffSec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[PortraitEnricher] Batch završen za ${diffSec}s! Postavljeno ${enrichedCount}/${artists.length} portreta. Nastavljam odmah...`);
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.error('[PortraitEnricher Error]', err.message);
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

if (process.argv[1]?.endsWith('artist_portrait_enricher.js')) {
  runPortraitEnricherDaemon().catch(console.error);
}
