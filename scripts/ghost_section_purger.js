import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import { isSectionHeader, isDummyContent, applyQualityGate } from './song_quality_gate.js';

export function purgeGhostSectionsAndFixBrackets(content) {
  if (!content) return '';
  let lines = content.split('\n');

  // 1. Fix nested/double brackets
  lines = lines.map(line => {
    return line
      .replace(/\[{2,}/g, '[')
      .replace(/\]{2,}/g, ']')
      .replace(/\[\s*\]/g, '')
      .trimEnd();
  });

  // 2. Remove consecutive duplicate headers (e.g. [Refren] followed directly by [Refren])
  const deduplicatedHeaders = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim();
    const next = lines[i + 1]?.trim();
    if (isSectionHeader(current) && isSectionHeader(next) && current.toLowerCase() === next.toLowerCase()) {
      continue; // Skip duplicate
    }
    deduplicatedHeaders.push(lines[i]);
  }
  lines = deduplicatedHeaders;

  // 3. Remove Empty / Ghost Sections (header followed immediately by another header or end of file)
  const nonGhostLines = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim();
    if (isSectionHeader(current)) {
      // Look ahead to see if there is any content before the next header or EOF
      let hasContent = false;
      for (let j = i + 1; j < lines.length; j++) {
        const ahead = lines[j].trim();
        if (ahead.length === 0) continue;
        if (isSectionHeader(ahead)) {
          break; // Hit next header without content
        }
        hasContent = true;
        break;
      }
      if (!hasContent) {
        continue; // Skip ghost header
      }
    }
    nonGhostLines.push(lines[i]);
  }
  lines = nonGhostLines;

  // 4. Renumber Stanzas sequentially ([Strofa 1], [Strofa 2], [Strofa 3]...)
  let stanzaIndex = 1;
  const reindexedLines = lines.map(line => {
    const trimmed = line.trim();
    if (/^\[Strofa\s*\d*\]/i.test(trimmed)) {
      const newLine = `[Strofa ${stanzaIndex}]`;
      stanzaIndex++;
      return newLine;
    }
    return line;
  });

  let result = reindexedLines.join('\n');
  // Collapse 3+ empty lines to 2
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

export async function runGhostPurgeSweep() {
  const songs = await Song.find({ deletedAt: null });
  let purgedCount = 0;

  for (const song of songs) {
    const content = song.arrangements?.[0]?.content || '';
    if (content.length > 0 && !isDummyContent(content)) {
      const cleaned = purgeGhostSectionsAndFixBrackets(content);
      if (cleaned !== content) {
        song.arrangements[0].content = cleaned;
        await song.save();
        purgedCount++;
      }
    }
  }

  if (purgedCount > 0) {
    console.log(`[GhostPurger] Purged ghost sections and fixed brackets in ${purgedCount} songs.`);
  }
  return purgedCount;
}

async function startDaemon() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('======================================================================');
  console.log('🪓 [GhostPurger] Empty Header & Ghost Section Squeezer Daemon Online');
  console.log('======================================================================\n');

  while (true) {
    try {
      await runGhostPurgeSweep();
    } catch (err) {
      console.error('[GhostPurger Error]', err.message);
    }
    await new Promise(r => setTimeout(r, 15000));
  }
}

if (process.argv[1]?.endsWith('ghost_section_purger.js')) {
  startDaemon().catch(console.error);
}
