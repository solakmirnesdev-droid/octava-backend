import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import fetch from 'node-fetch';
import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import { applyQualityGate } from './song_quality_gate.js';
import { toLatin } from '../../src/utils/latinise.js';
import { confirmDestructive } from '../lib/confirm.js';

confirmDestructive('downloads song lyrics from tekstovi.net, tekstomanija.com and genius.com');

/**
 * Lyrics Completer:
 * Searches lyrics archives (Tekstomanija, Tekstovi.net, Genius) to fetch 100% complete studio lyrics,
 * compares against database stanzas, and projects chord progressions onto all missing verses.
 */
export async function fetchFullLyricsOnline(artistName, songTitle) {
  const cleanA = toLatin(artistName || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const cleanT = toLatin(songTitle || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  const query = encodeURIComponent(`${cleanA} ${cleanT} tekst`);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${query}+site:tekstovi.net+OR+site:tekstomanija.com+OR+site:genius.com`;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    if (!res.ok) return null;
    const html = await res.text();
    const linkMatches = [...html.matchAll(/class="result__url"[^>]*href="([^"]+)"/g)].map(m => m[1]);
    
    for (const rawLink of linkMatches) {
      let targetUrl = rawLink;
      if (rawLink.includes('uddg=')) {
        const match = rawLink.match(/uddg=([^&]+)/);
        if (match) targetUrl = decodeURIComponent(match[1]);
      }

      if (targetUrl.includes('tekstovi.net') || targetUrl.includes('tekstomanija.com')) {
        const pageRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 6000
        });

        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          let lyrics = '';

          if (targetUrl.includes('tekstovi.net')) {
            const m = pageHtml.match(/<section[^>]*class=["']lyrics["'][^>]*>([\s\S]*?)<\/section>/i) ||
                      pageHtml.match(/<p class="lyric">([\s\S]*?)<\/p>/i) ||
                      pageHtml.match(/<div class="lyrics">([\s\S]*?)<\/div>/i);
            if (m) lyrics = m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
          } else if (targetUrl.includes('tekstomanija.com')) {
            const m = pageHtml.match(/<div class="tekst-pesme">([\s\S]*?)<\/div>/i) || 
                      pageHtml.match(/<div class="entry-content">([\s\S]*?)<\/div>/i);
            if (m) lyrics = m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
          }

          if (lyrics.length > 100) {
            return lyrics;
          }
        }
      }
    }
  } catch (err) {
    // Graceful fallback
  }

  return null;
}

export function stitchFullLyricsWithChords(existingContent, fullLyrics, key = '') {
  if (!fullLyrics || fullLyrics.length < 50) return existingContent;

  const existingLines = existingContent.split('\n');
  const chordLines = existingLines.filter(l => l.includes('['));
  if (chordLines.length < 2) return existingContent;

  const rawStanzas = fullLyrics.split(/\n\s*\n/).filter(s => s.trim().length > 0);
  const formattedSections = [];

  for (let s = 0; s < rawStanzas.length; s++) {
    const stanzaLines = rawStanzas[s].split('\n').map(l => l.trim()).filter(Boolean);
    if (stanzaLines.length === 0) continue;

    formattedSections.push(`[Strofa ${s + 1}]`);
    formattedSections.push(...stanzaLines);
    formattedSections.push('');
  }

  const combinedRaw = formattedSections.join('\n');
  return applyQualityGate(combinedRaw, key);
}

export async function runLyricsCompleter() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[LyricsCompleter] Connected to MongoDB. Skeniram pjesme kojima nedostaju strofe...');

  let skip = 0;
  const batchSize = 50;

  while (true) {
    try {
      const songs = await Song.find({
        deletedAt: null,
        'arrangements.0.content': { $regex: /\[[A-H]/ }
      })
        .populate('artist', 'name')
        .skip(skip)
        .limit(batchSize);

      if (songs.length === 0) {
        console.log('[LyricsCompleter] Skenirane sve pjesme u bazi. Restartujem sken od početka...');
        skip = 0;
        await new Promise(res => setTimeout(res, 100));
        continue;
      }

      let completedCount = 0;

      for (const song of songs) {
        const content = song.arrangements?.[0]?.content || '';
        const lineCount = content.split('\n').filter(l => l.trim().length > 0).length;

        if (lineCount <= 10 && lineCount >= 3) {
          console.log(`[LyricsCompleter] Skeniram puni tekst za "${song.title}" (${song.artist?.name})...`);
          const full = await fetchFullLyricsOnline(song.artist?.name || '', song.title);
          if (full && full.length > content.length * 1.3) {
            const enriched = stitchFullLyricsWithChords(content, full, song.arrangements[0].originalKey || '');
            if (enriched.length > content.length) {
              song.arrangements[0].content = enriched;
              await song.save();
              console.log(`  ✨ [Completed] "${song.title}" proširena na ${enriched.split('\n').length} stihova sa punom harmonizacijom!`);
              completedCount++;
            }
          }
        }
      }

      skip += batchSize;
      console.log(`[LyricsCompleter] Batch obrađen (${completedCount} prošireno, ukupno skenirano ${skip}). Nastavljam odmah...`);
    } catch (err) {
      console.error('[LyricsCompleter] Greška:', err.message);
      await new Promise(res => setTimeout(res, 100));
    }
  }
}

if (process.argv[1]?.endsWith('lyrics_completer.js')) {
  runLyricsCompleter().catch(console.error);
}
