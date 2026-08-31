import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';

async function runReview() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to database:', mongoose.connection.name);

  // 1. Overall counts
  const totalSongs = await Song.countDocuments({ deletedAt: null });
  const publishedSongs = await Song.countDocuments({ deletedAt: null, status: 'published' });
  const draftSongs = await Song.countDocuments({ deletedAt: null, status: 'draft' });
  const reviewSongs = await Song.countDocuments({ deletedAt: null, status: 'review' });

  console.log(`\n=== GENERAL STATS ===`);
  console.log(`Total active songs: ${totalSongs}`);
  console.log(`Published: ${publishedSongs} (${((publishedSongs/totalSongs)*100).toFixed(1)}%)`);
  console.log(`Draft: ${draftSongs}`);
  console.log(`Review: ${reviewSongs}`);

  // Fetch artists map
  const artists = await Artist.collection.find({ deletedAt: null }, { projection: { _id: 1, name: 1 } }).toArray();
  const artistMap = new Map();
  for (const a of artists) artistMap.set(a._id.toString(), a.name);

  // 2. Fetch the most recently updated 50 songs
  const recentSongs = await Song.find({ deletedAt: null })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  console.log(`\n=== INSPECTING RECENTLY UPDATED 50 SONGS ===`);
  
  let validNotationCount = 0;
  let allVersesHaveChordsCount = 0;
  let artifactFreeCount = 0;
  let publishedCount = 0;

  const standardSections = ['[Strofa 1]', '[Strofa 2]', '[Strofa 3]', '[Strofa 4]', '[Strofa 5]', '[Strofa 6]', '[Refren]', '[Intro / Uvod]', '[Prelaz / Solo]', '[Outro / Kraj]'];
  const artifactRegexes = [
    /\b\d{1,2}\.\d{1,2}\.\d{4}\.?\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/i,
    /(?:znam\s+)?drugi\s+deo/i,
    /akorde?\s+(?:pisao|skinuo|poslao)/i,
    /\(capo\s*\d+\)/i,
    /\[\s*\]/,
    /\[[A-G][^\]]*\s*$/, // unclosed bracket at end
    /[a-zA-ZčćžšđČĆŽŠĐ]+\[[A-G][^\]]*\]/, // glued chord inside word without space e.g. text[Am]
  ];

  const reviewedExamples = [];

  for (let i = 0; i < recentSongs.length; i++) {
    const s = recentSongs[i];
    const artistName = artistMap.get(s.artist?.toString()) || 'Nepoznat';
    const content = s.arrangements?.[0]?.content || '';
    
    // Check status
    const isPublished = s.status === 'published';
    if (isPublished) publishedCount++;

    // Split content into lines and sections
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const sections = lines.filter(l => l.startsWith('[') && l.endsWith(']'));
    
    // Check sections notation
    const nonStandardSections = sections.filter(sec => !standardSections.includes(sec) && !sec.match(/^\[(?:Strofa \d+|Refren \d+|Solo|Uvod|Kraj|Instrumental)\]$/));
    const hasValidNotation = sections.length > 0 && nonStandardSections.length === 0;
    if (hasValidNotation) validNotationCount++;

    // Check verse chords
    let currentSec = null;
    let sectionLinesMap = {};
    for (const l of lines) {
      if (l.startsWith('[') && l.endsWith(']')) {
        currentSec = l;
        sectionLinesMap[currentSec] = [];
      } else if (currentSec) {
        sectionLinesMap[currentSec].push(l);
      }
    }

    let emptyVerseFound = false;
    let versesFound = 0;
    for (const [secName, secLines] of Object.entries(sectionLinesMap)) {
      if (secName.startsWith('[Strofa')) {
        versesFound++;
        const hasChord = secLines.some(l => /\[[A-G][^\]]*\]/.test(l));
        if (!hasChord && secLines.length > 0) {
          emptyVerseFound = true;
        }
      }
    }
    const allVersesHaveChords = versesFound > 0 && !emptyVerseFound;
    if (allVersesHaveChords) allVersesHaveChordsCount++;

    // Check scraper artifacts
    let foundArtifacts = [];
    for (const rx of artifactRegexes) {
      if (rx.test(content)) {
        foundArtifacts.push(rx.toString());
      }
    }
    const isArtifactFree = foundArtifacts.length === 0;
    if (isArtifactFree) artifactFreeCount++;

    if (i < 15) {
      reviewedExamples.push({
        title: s.title,
        artist: artistName,
        status: s.status,
        updatedAt: s.updatedAt,
        sections,
        versesFound,
        emptyVerseFound,
        allVersesHaveChords,
        foundArtifacts,
        chordCount: (content.match(/\[[A-G][^\]]*\]/g) || []).length,
        fullContent: content
      });
    }
  }

  console.log(`\n=== SAMPLE METRICS (Out of 50 recent songs) ===`);
  console.log(`Published Status: ${publishedCount}/50 (${(publishedCount/50*100).toFixed(1)}%)`);
  console.log(`Valid Section Notation: ${validNotationCount}/50 (${(validNotationCount/50*100).toFixed(1)}%)`);
  console.log(`All Verses Harmonized (No empty verses): ${allVersesHaveChordsCount}/50 (${(allVersesHaveChordsCount/50*100).toFixed(1)}%)`);
  console.log(`Artifact-Free: ${artifactFreeCount}/50 (${(artifactFreeCount/50*100).toFixed(1)}%)`);

  console.log(`\n=== DETAILED REVIEWS (Top 10 Songs) ===`);
  for (let idx = 0; idx < Math.min(reviewedExamples.length, 10); idx++) {
    const ex = reviewedExamples[idx];
    console.log(`\n============================================================`);
    console.log(`SONG #${idx + 1}: "${ex.artist} - ${ex.title}"`);
    console.log(`Status: ${ex.status} | Updated: ${ex.updatedAt}`);
    console.log(`Sekcije (${ex.sections.length}): ${ex.sections.join(' | ')}`);
    console.log(`Broj akorda: ${ex.chordCount}`);
    console.log(`Harmonizacija strofa: ${!ex.emptyVerseFound ? '✅ Sve strofe imaju akorde' : '❌ Prazne strofe detektovane'}`);
    console.log(`Čistoća teksta (bez artefakata): ${ex.foundArtifacts.length === 0 ? '✅ Čisto' : '❌ Pronađeno: ' + ex.foundArtifacts.join(', ')}`);
    console.log(`\nSadržaj arrangementa:\n${ex.fullContent}\n`);
  }

  // Deep audit across the entire collection
  console.log(`\n=== CATALOG-WIDE DEEP AUDIT ===`);

  const dummyPlaceholderCount = await Song.countDocuments({
    deletedAt: null,
    $or: [
      { 'arrangements.0.content': /Tekst još uvijek nije ažuriran/i },
      { 'arrangements.0.content': /lorem ipsum/i },
      { 'arrangements.0.content': /veniam quis/i },
      { 'arrangements.0.content': /sint occaecat/i }
    ]
  });

  const zeroChordPublishedCount = await Song.countDocuments({
    deletedAt: null,
    status: 'published',
    $or: [
      { 'arrangements.0.content': { $not: /\[[A-G][^\]]*\]/ } },
      { 'arrangements.0.content': { $exists: false } },
      { 'arrangements.0.content': '' }
    ]
  });

  const brokenBracketCount = await Song.countDocuments({
    deletedAt: null,
    'arrangements.0.content': { $regex: /\]\]|\[Strofa\s*\[|&\[|&#194;|Â/ }
  });

  const wellFormedPublishedCount = await Song.countDocuments({
    deletedAt: null,
    status: 'published',
    'arrangements.0.content': { 
      $regex: /\[Strofa 1\]/,
      $not: /Tekst još uvijek nije ažuriran|lorem ipsum|veniam quis|\]\]|Â|&#194;/i
    }
  });

  console.log(`Total songs with placeholder/dummy text: ${dummyPlaceholderCount}`);
  console.log(`Total published songs with ZERO chords: ${zeroChordPublishedCount}`);
  console.log(`Total songs with broken brackets / encoding artifacts (Â, &#194;, ]], [Strofa [X]): ${brokenBracketCount}`);
  console.log(`Fully clean and well-formed published songs: ${wellFormedPublishedCount}`);

  // Fetch 5 songs from each category for review:
  console.log(`\n=== INSPECTION OF CLEAN PUBLISHED SONGS ===`);
  const cleanSongs = await Song.find({
    deletedAt: null,
    status: 'published',
    'arrangements.0.content': { 
      $regex: /\[Strofa 1\]/,
      $not: /Tekst još uvijek nije ažuriran|lorem ipsum|veniam quis|\]\]|Â|&#194;/i
    }
  }).limit(5).lean();

  for (const s of cleanSongs) {
    const artistName = artistMap.get(s.artist?.toString()) || 'Nepoznat';
    const content = s.arrangements?.[0]?.content || '';
    const chordCount = (content.match(/\[[A-G][^\]]*\]/g) || []).length;
    console.log(`- "${artistName} - ${s.title}" | Chords: ${chordCount} | First 100 chars: ${content.substring(0, 100).replace(/\n/g, ' ')}`);
  }

  console.log(`\n=== INSPECTION OF DUMMY / PLACEHOLDER SONGS ===`);
  const dummySongs = await Song.find({
    deletedAt: null,
    'arrangements.0.content': /Tekst još uvijek nije ažuriran|lorem ipsum|veniam quis/i
  }).limit(5).lean();

  for (const s of dummySongs) {
    const artistName = artistMap.get(s.artist?.toString()) || 'Nepoznat';
    console.log(`- "${artistName} - ${s.title}" | Status: ${s.status} | Snippet: ${s.arrangements?.[0]?.content?.substring(0, 100).replace(/\n/g, ' ')}`);
  }

  console.log(`\n=== INSPECTION OF ARTIFACT CORRUPTED SONGS ===`);
  const artifactSongs = await Song.find({
    deletedAt: null,
    'arrangements.0.content': { $regex: /\]\]|\[Strofa\s*\[|&\[|&#194;|Â/ }
  }).limit(5).lean();

  for (const s of artifactSongs) {
    const artistName = artistMap.get(s.artist?.toString()) || 'Nepoznat';
    console.log(`- "${artistName} - ${s.title}" | Snippet: ${s.arrangements?.[0]?.content?.substring(0, 150).replace(/\n/g, ' ')}`);
  }

  await mongoose.disconnect();
  console.log('\nReview complete.');
}

runReview().catch(err => {
  console.error(err);
  process.exit(1);
});
