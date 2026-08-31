import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';

const SLEEP_MS = 800;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function renderBar(current, total, width = 35) {
  if (!total || total === 0) return `[${' '.repeat(width)}] 0.0%`;
  const pct = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `\x1b[38;2;16;185;129m[${bar}]\x1b[0m \x1b[1;97m${(pct * 100).toFixed(1)}%\x1b[0m \x1b[90m(${current.toLocaleString('sr-RS')}/${total.toLocaleString('sr-RS')})\x1b[0m`;
}

async function renderFrame() {
  const totalSongs = await Song.countDocuments({ deletedAt: null });
  const published = await Song.countDocuments({ deletedAt: null, status: 'published' });
  const withYoutube = await Song.countDocuments({ deletedAt: null, youtubeId: { $exists: true, $ne: null, $ne: '' } });

  const totalArtists = await Artist.countDocuments({ deletedAt: null });
  const withCountry = await Artist.countDocuments({ deletedAt: null, country: { $exists: true, $ne: null, $ne: '' } });
  const withImage = await Artist.countDocuments({ deletedAt: null, imageBytes: { $gt: 0 } });

  // Get last 15 live updates directly from MongoDB Atlas
  const recentUpdates = await Song.find({ deletedAt: null })
    .sort({ updatedAt: -1 })
    .limit(14)
    .populate('artist', 'name')
    .lean();

  const now = new Date().toLocaleTimeString('sr-RS');

  let out = '\x1b[2J\x1b[H';
  out += '\x1b[38;2;6;182;212m╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\n';
  out += `\x1b[38;2;6;182;212m║\x1b[0m  \x1b[1;38;2;245;158;11m💎 OCTAVA REAL-TIME TURBO POLISH MONITOR (MONGODB ATLAS CLOUD)\x1b[0m                        \x1b[90m[Vrijeme: ${now}]\x1b[0m  \x1b[38;2;6;182;212m║\x1b[0m\n`;
  out += '\x1b[38;2;6;182;212m╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m\n';
  out += `\x1b[38;2;6;182;212m║\x1b[0m  \x1b[1;97m📊 UKUPNO PJESAMA NA ATLASU:\x1b[0m  \x1b[1;38;2;52;211;153m${totalSongs.toLocaleString('sr-RS')}\x1b[0m                                                                         \x1b[38;2;6;182;212m║\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m║\x1b[0m  • Objavljene & Verifikovane: ${renderBar(published, totalSongs, 32)}                 \x1b[38;2;6;182;212m║\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m║\x1b[0m  • Zvanični YouTube spotovi:  ${renderBar(withYoutube, totalSongs, 32)}                 \x1b[38;2;6;182;212m║\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m║\x1b[0m                                                                                                              \x1b[38;2;6;182;212m║\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m║\x1b[0m  \x1b[1;97m👥 UKUPNO IZVOĐAČA NA ATLASU:\x1b[0m \x1b[1;38;2;168;85;247m${totalArtists.toLocaleString('sr-RS')}\x1b[0m                                                                         \x1b[38;2;6;182;212m║\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m║\x1b[0m  • HD WebP Portreti:          ${renderBar(withImage, totalArtists, 32)}                 \x1b[38;2;6;182;212m║\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m║\x1b[0m  • Država & ISO Porijeklo:    ${renderBar(withCountry, totalArtists, 32)}                 \x1b[38;2;6;182;212m║\x1b[0m\n`;
  out += '\x1b[38;2;6;182;212m╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m║\x1b[0m  \x1b[1;38;2;236;72;153m⚡ 4-SMJERNI HYPER-SPEED RADNICI (Brzina: ~2.35s / krug):\x1b[0m                                                   \x1b[38;2;6;182;212m║\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m║\x1b[0m  \x1b[38;2;52;211;153m● Q1 (Top ➔ 25%)\x1b[0m      \x1b[38;2;6;182;212m● Q2 (Mid ➔ 25%)\x1b[0m      \x1b[38;2;245;158;11m● Q3 (Mid ➔ 75%)\x1b[0m      \x1b[38;2;168;85;247m● Q4 (Bottom ➔ 75%)\x1b[0m            \x1b[38;2;6;182;212m║\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m║\x1b[0m  \x1b[1;38;2;251;191;36m📡 LIVE REAL-TIME FEED (Zadnje ažurirane pjesme direktno na MongoDB Atlasu):\x1b[0m                                 \x1b[38;2;6;182;212m║\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m\n';

  for (const s of recentUpdates) {
    const art = (s.artist?.name || 'Nepoznat izvođač').slice(0, 20).padEnd(20);
    const tit = (s.title || 'Bez naslova').slice(0, 24).padEnd(24);
    const key = (s.arrangements?.[0]?.originalKey || 'C').padEnd(3);
    const diff = (s.arrangements?.[0]?.difficulty || 'easy').padEnd(6);
    const chordsCount = s.arrangements?.[0]?.chords?.length || 0;
    const timeStr = s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString('sr-RS') : now;

    // Determine concrete forensic details of what was updated
    const details = [];
    if (s.status === 'published') details.push('\x1b[38;2;52;211;153m[🌟 Published]\x1b[0m');
    if (chordsCount > 0) details.push(`\x1b[38;2;96;165;250m[🎸 ${chordsCount} akorda]\x1b[0m`);
    if (s.youtubeId) details.push('\x1b[38;2;248;113;113m[🎬 YouTube]\x1b[0m');
    if (s.tags && s.tags.length > 0) details.push(`\x1b[38;2;251;191;36m[🏷️ #${s.tags[0]}]\x1b[0m`);
    if (s.year) details.push(`\x1b[38;2;192;132;252m[📅 ${s.year}]\x1b[0m`);
    details.push(`\x1b[38;2;45;212;191m[🎼 ${key}|${diff}]\x1b[0m`);

    const detailStr = details.slice(0, 4).join(' ');

    out += `\x1b[38;2;6;182;212m║\x1b[0m \x1b[90m[${timeStr}]\x1b[0m \x1b[1;97m${tit}\x1b[0m \x1b[90m›\x1b[0m \x1b[38;2;147;197;253m${art}\x1b[0m \x1b[90m➔\x1b[0m ${detailStr}\x1b[0m\n`;
  }

  out += '\x1b[38;2;6;182;212m╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\n';
  out += '\x1b[90m(OCTAVA 24/7 ULTRA-TURBO LIVE MONITOR | DIRECT ATLAS CLOUD STREAM | Press Ctrl+C to close)\x1b[0m\n';

  process.stdout.write(out);
}

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  while (true) {
    try {
      await renderFrame();
    } catch (e) {}
    await delay(SLEEP_MS);
  }
}

start();
