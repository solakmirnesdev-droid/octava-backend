import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import { countChordsInContent } from './song_quality_gate.js';
import { toLatin } from '../src/utils/latinise.js';

function cleanSectionHeader(line, verseCount, chorusCount) {
  const trimmed = line.trim();
  
  if (/^\[?(?:intro|uvod|for[sš]pil)\]?:?$/i.test(trimmed)) {
    return '[Intro / Uvod]';
  }
  if (/^\[?(?:prelaz|bridge|solo)\]?:?$/i.test(trimmed)) {
    return '[Prelaz / Solo]';
  }
  if (/^\[?(?:outro|kraj|finale)\]?:?$/i.test(trimmed)) {
    return '[Outro / Kraj]';
  }
  if (/^\[?(?:refren|chorus|ref)\]?:?$/i.test(trimmed)) {
    return '[Refren]';
  }
  if (/^\[?(?:strofa|verse|kitica)\s*(\d+)?\]?:?$/i.test(trimmed)) {
    const match = trimmed.match(/\d+/);
    const num = match ? parseInt(match[0]) : verseCount;
    return `[Strofa ${num}]`;
  }
  return null;
}

function cleanScraperArtifacts(text) {
  return text
    // Remove dates like 29.07.2016. or 2016-08-30
    .replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\.?\b/g, '')
    // Remove forum comments
    .replace(/(?:znam\s+)?drugi\s+deo:?/gi, '')
    .replace(/akorde?\s+(?:pisao|skinuo|poslao)[^:\n]*:?/gi, '')
    .replace(/\(capo\s*\d+\)/gi, '')
    // Fix glued brackets like "j Am]a" -> "[Am]ja" or "godinaG]ma" -> "[G]godinama"
    .replace(/([a-zA-ZčćžšđČĆŽŠĐ]+)\s*([A-G][b#]?(?:m|maj|dim|aug|sus\d?|add\d?|\d)?)]\s*([a-zA-ZčćžšđČĆŽŠĐ]*)/g, '[$2]$1$3')
    .replace(/([a-zA-ZčćžšđČĆŽŠĐ]+)\[([A-G][^\]]*)\]/g, '[$2]$1')
    // Fix bracket spacing inside words
    .replace(/\[([A-G][^\]]*)\]\s+/g, '[$1]')
    .trim();
}

function propagateVerseChords(chordVerseLines, plainVerseLines) {
  if (chordVerseLines.length === 0 || plainVerseLines.length === 0) return plainVerseLines;
  
  const result = [];
  for (let i = 0; i < plainVerseLines.length; i++) {
    const plain = plainVerseLines[i].trim();
    if (!plain) continue;
    
    const sourceChordLine = chordVerseLines[i % chordVerseLines.length];
    
    // Extract chords from source line
    const chords = [];
    const chordMatches = [...sourceChordLine.matchAll(/\[([A-G][^\]]*)\]/g)];
    for (const m of chordMatches) {
      chords.push({ chord: m[1], pos: m.index / Math.max(sourceChordLine.length, 1) });
    }
    
    if (chords.length === 0) {
      result.push(plain);
      continue;
    }
    
    // Distribute chords along words
    let words = plain.split(/\s+/).filter(Boolean);
    let newLine = '';
    let currentPos = 0;
    
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx];
      const relPos = currentPos / Math.max(plain.length, 1);
      
      const matchingChord = chords.find(c => Math.abs(c.pos - relPos) < 0.25);
      if (matchingChord) {
        newLine += `[${matchingChord.chord}]` + word + ' ';
        chords.splice(chords.indexOf(matchingChord), 1);
      } else {
        newLine += word + ' ';
      }
      currentPos += word.length + 1;
    }
    
    // Prefix remaining initial chord if not placed
    if (chords.length > 0) {
      newLine = `[${chords[0].chord}]` + newLine;
    }
    
    result.push(newLine.trim());
  }
  return result;
}

export function formatSongNotationAndPropagate(rawContent) {
  if (!rawContent || rawContent.length < 20) return rawContent;
  
  const cleanedText = cleanScraperArtifacts(rawContent);
  const rawLines = cleanedText.split('\n').map(l => l.trim());
  
  let formattedLines = [];
  let verseCount = 0;
  let chorusCount = 0;
  
  let currentSection = null;
  let sectionBuffers = []; // { section: '[Strofa 1]', lines: [] }
  let currentBuffer = { section: '[Strofa 1]', lines: [] };
  
  for (let line of rawLines) {
    if (!line) {
      continue;
    }
    
    const header = cleanSectionHeader(line, verseCount + 1, chorusCount + 1);
    if (header) {
      if (currentBuffer.lines.length > 0) {
        sectionBuffers.push(currentBuffer);
      }
      if (header.startsWith('[Strofa')) verseCount++;
      if (header.startsWith('[Refren')) chorusCount++;
      currentBuffer = { section: header, lines: [] };
      continue;
    }
    
    currentBuffer.lines.push(line);
  }
  
  if (currentBuffer.lines.length > 0) {
    sectionBuffers.push(currentBuffer);
  }
  
  // Find reference verse with chords
  let referenceVerseChords = [];
  for (const sb of sectionBuffers) {
    if (sb.section.startsWith('[Strofa')) {
      const chordsInVerse = sb.lines.filter(l => /\[[A-G][^\]]*\]/.test(l));
      if (chordsInVerse.length > 0) {
        referenceVerseChords = chordsInVerse;
        break;
      }
    }
  }
  
  // Rebuild song with clean sections and propagated chords
  let currentVerseIndex = 1;
  const finalOutput = [];
  
  for (const sb of sectionBuffers) {
    let sectionName = sb.section;
    if (sectionName.startsWith('[Strofa')) {
      sectionName = `[Strofa ${currentVerseIndex}]`;
      currentVerseIndex++;
      
      // If verse has no chords, propagate from reference verse
      const hasChords = sb.lines.some(l => /\[[A-G][^\]]*\]/.test(l));
      if (!hasChords && referenceVerseChords.length > 0) {
        sb.lines = propagateVerseChords(referenceVerseChords, sb.lines);
      }
    }
    
    finalOutput.push(sectionName);
    finalOutput.push(...sb.lines);
    finalOutput.push(''); // blank line between sections
  }
  
  return finalOutput.join('\n').trim();
}

async function runHarmonizerAndPublish() {
  console.log('======================================================================');
  console.log('🚀 OCTAVA NOTATION & VERSE CHORD HARMONIZER ENGINE');
  console.log('======================================================================\n');
  
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Povezan na MongoDB Atlas Cloud.\n');
  
  // Preload artist names in memory
  const artists = await Artist.collection.find({ deletedAt: null }, { projection: { _id: 1, name: 1 } }).toArray();
  const artistMap = new Map();
  for (const a of artists) artistMap.set(a._id.toString(), a.name);
  
  const cursor = Song.find({ deletedAt: null }).cursor();
  let count = 0;
  let fixedCount = 0;
  
  for await (const song of cursor) {
    count++;
    const artistName = artistMap.get(song.artist?.toString()) || 'Nepoznat izvođač';
    const originalContent = song.arrangements?.[0]?.content || '';
    
    if (!originalContent || originalContent.length < 20) continue;
    
    // Clean title from trailing 1, 2, v2
    let cleanTitle = song.title.replace(/\s*(?:1|2|3|v1|v2|v3)\s*$/i, '').trim();
    
    const formattedContent = formatSongNotationAndPropagate(originalContent);
    const chordCount = countChordsInContent(formattedContent);
    
    if (formattedContent !== originalContent || cleanTitle !== song.title || song.status !== 'published') {
      song.title = cleanTitle;
      song.searchTitle = toLatin(cleanTitle).toLowerCase();
      song.status = 'published';
      if (!song.arrangements || song.arrangements.length === 0) {
        song.arrangements = [{ label: 'Glavna verzija', content: formattedContent, isPrimary: true }];
      } else {
        song.arrangements[0].content = formattedContent;
        song.arrangements[0].label = song.arrangements[0].label || 'Glavna verzija';
      }
      
      await song.save();
      fixedCount++;
      
      const key = song.arrangements[0].originalKey || 'Am';
      console.log(`✨ [${fixedCount}] PUBLISHED & NOTATED: "${artistName} - ${cleanTitle}" (Key: ${key} | ${chordCount} akorda)`);
    }
  }
  
  console.log('\n======================================================================');
  console.log(`🎉 ZAVRŠENO! Pregledano: ${count} pjesama | Ažurirano i objavljeno: ${fixedCount} pjesama!`);
  console.log('======================================================================\n');
  
  await mongoose.disconnect();
}

runHarmonizerAndPublish().catch(err => console.error('[Harmonizer Error]', err));
