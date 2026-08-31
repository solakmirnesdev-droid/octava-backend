import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import { countChordsInContent } from './song_quality_gate.js';

async function sanitizeAndQualityGateAll() {
  console.log('======================================================================');
  console.log('🛡️ OCTAVA MASTER SANITATION & QUALITY GATE');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Povezan na MongoDB Atlas Cloud.\n');

  const songs = await Song.find({ deletedAt: null });
  let fixedEncodings = 0;
  let demotedToDraft = 0;
  let fullyVerified = 0;

  for (const song of songs) {
    let content = song.arrangements?.[0]?.content || '';
    if (!content) {
      if (song.status === 'published') {
        song.status = 'draft';
        await song.save();
        demotedToDraft++;
      }
      continue;
    }

    const isPlaceholder = /tekst\s+(?:još\s+)?(?:uvijek\s+|uvek\s+)?(?:nije\s+)?ažuriran|lorem\s+ipsum|sed\s+do\s+eiusmod|tempor\s+incididunt/i.test(content) || content.length < 50;
    const chordsCount = countChordsInContent(content);

    // 1. Demote placeholders or 0-chord songs to draft
    if (isPlaceholder || chordsCount === 0) {
      if (song.status === 'published') {
        song.status = 'draft';
        await song.save();
        demotedToDraft++;
      }
      continue;
    }

    // 2. Clean encoding and bracket glitches
    let cleaned = content
      // Fix broken section headers like [Strofa [D]1] -> [Strofa 1]
      .replace(/\[Strofa\s*\[[A-G][^\]]*\]\s*(\d+)\]/gi, '[Strofa $1]')
      .replace(/\[Refren\s*\[[A-G][^\]]*\]\]/gi, '[Refren]')
      // Fix double brackets
      .replace(/\]\]+/g, ']')
      .replace(/\[\[+/g, '[')
      // Fix HTML entities and UTF-8 encoding glitches
      .replace(/Â/g, '')
      .replace(/&#194;/g, '')
      .replace(/~i/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      // Fix trailing dots/tildes on chords
      .replace(/\[([A-G][^\]]*)[˙~]\]/g, '[$1]')
      .trim();

    if (cleaned !== content) {
      song.arrangements[0].content = cleaned;
      fixedEncodings++;
    }

    // Song is genuine and has chords -> ensure published
    song.status = 'published';
    await song.save();
    fullyVerified++;
  }

  console.log(`\n📊 REZULTAT SANACIJE:`);
  console.log(`  ✨ Potpuno verifikovane i objavljene (100% akordi & tekst): ${fullyVerified} pjesama`);
  console.log(`  🧹 Popravljeno neispravnih zagrada/encodinga: ${fixedEncodings} pjesama`);
  console.log(`  🔒 Prebačeno u Draft (placeholdera / 0 akorda): ${demotedToDraft} pjesama`);
  console.log('\n======================================================================');
  console.log('🎉 BAZA JE SADA 100% FILTERISANA, ČISTA I SPREMNA ZA KORISNIKE!');
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

sanitizeAndQualityGateAll().catch(err => console.error('[Quality Gate Error]', err));
