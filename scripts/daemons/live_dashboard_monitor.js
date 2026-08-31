import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const logsDir = path.join(rootDir, 'logs');

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import { countChordsInContent, isDummyContent } from '../healers/song_quality_gate.js';

function getTailLogs(filename, maxLines = 4) {
  try {
    const p = path.join(logsDir, filename);
    if (!fs.existsSync(p)) return ['(Čekam prve logove...)'];
    const content = fs.readFileSync(p, 'utf8').trim();
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    return lines.slice(-maxLines);
  } catch {
    return ['(Učitavanje...)'];
  }
}

function renderProgressBar(current, total, width = 28) {
  if (!total || total === 0) return `[${' '.repeat(width)}] 0.0%`;
  const pct = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `\x1b[38;2;16;185;129m[${bar}]\x1b[0m \x1b[1;97m${(pct * 100).toFixed(1)}%\x1b[0m \x1b[90m(${current.toLocaleString('sr-RS')}/${total.toLocaleString('sr-RS')})\x1b[0m`;
}

async function renderDashboard() {
  const totalSongs = await Song.countDocuments({ deletedAt: null });
  const published = await Song.countDocuments({ deletedAt: null, status: 'published' });
  const withYoutube = await Song.countDocuments({ deletedAt: null, youtubeId: { $exists: true, $ne: null, $ne: '' } });

  const totalArtists = await Artist.countDocuments({ deletedAt: null });
  const withCountry = await Artist.countDocuments({ deletedAt: null, country: { $exists: true, $ne: null, $ne: '' } });
  const withImage = await Artist.countDocuments({ deletedAt: null, imageBytes: { $gt: 0 } });

  const now = new Date().toLocaleTimeString('sr-RS');

  // ANSI Clear & Home
  let out = '\x1b[2J\x1b[H';
  out += '\x1b[38;2;6;182;212m╭───────────────────────────────────────────────────────────────────────────────────────────╮\x1b[0m\n';
  out += `\x1b[38;2;6;182;212m│\x1b[0m  \x1b[1;38;2;245;158;11m💎 OCTAVA REAL-TIME TURBO POLISH & 4-QUADRANT MONITOR\x1b[0m          \x1b[90m[Vrijeme: ${now}]\x1b[0m  \x1b[38;2;6;182;212m│\x1b[0m\n`;
  out += '\x1b[38;2;6;182;212m├───────────────────────────────────────────────────────────────────────────────────────────┤\x1b[0m\n';
  out += `\x1b[38;2;6;182;212m│\x1b[0m  \x1b[1;97m📊 UKUPNO PJESAMA NA ATLASU:\x1b[0m  \x1b[1;38;2;52;211;153m${totalSongs.toLocaleString('sr-RS')}\x1b[0m                                                      \x1b[38;2;6;182;212m│\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m│\x1b[0m  • Objavljene & Ispravljene: ${renderProgressBar(published, totalSongs, 24)} \x1b[38;2;6;182;212m│\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m│\x1b[0m  • Zvanični YouTube snimci:  ${renderProgressBar(withYoutube, totalSongs, 24)} \x1b[38;2;6;182;212m│\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m│\x1b[0m                                                                                           \x1b[38;2;6;182;212m│\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m│\x1b[0m  \x1b[1;97m👥 UKUPNO IZVOĐAČA NA ATLASU:\x1b[0m \x1b[1;38;2;168;85;247m${totalArtists.toLocaleString('sr-RS')}\x1b[0m                                                      \x1b[38;2;6;182;212m│\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m│\x1b[0m  • HD WebP Portreti:         ${renderProgressBar(withImage, totalArtists, 24)} \x1b[38;2;6;182;212m│\x1b[0m\n`;
  out += `\x1b[38;2;6;182;212m│\x1b[0m  • Država & Porijeklo:       ${renderProgressBar(withCountry, totalArtists, 24)} \x1b[38;2;6;182;212m│\x1b[0m\n`;
  out += '\x1b[38;2;6;182;212m├───────────────────────────────────────────────────────────────────────────────────────────┤\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m│\x1b[0m  \x1b[1;38;2;236;72;153m⚡ 4-SMJERNI KVADRANTNI HEALERI U POGONU:\x1b[0m                                                \x1b[38;2;6;182;212m│\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m│\x1b[0m  \x1b[38;2;52;211;153m● Q1 (Top ➔ 25%)\x1b[0m    \x1b[38;2;6;182;212m● Q2 (Mid ➔ 25%)\x1b[0m    \x1b[38;2;245;158;11m● Q3 (Mid ➔ 75%)\x1b[0m    \x1b[38;2;168;85;247m● Q4 (Bottom ➔ 75%)\x1b[0m  \x1b[38;2;6;182;212m│\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m├───────────────────────────────────────────────────────────────────────────────────────────┤\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m│\x1b[0m  \x1b[1;38;2;251;191;36m📡 TRENUTNI LIVE STREAM DOGAĐAJA (Zadnje izmjene na Atlasu):\x1b[0m                             \x1b[38;2;6;182;212m│\x1b[0m\n';
  out += '\x1b[38;2;6;182;212m├───────────────────────────────────────────────────────────────────────────────────────────┤\x1b[0m\n';

  const streams = [
    { label: '🎸 Q1-TopDown', file: 'healer_q1_top_down.log', color: '\x1b[38;2;52;211;153m' },
    { label: '🔄 Q2-MidUp', file: 'healer_q2_mid_up.log', color: '\x1b[38;2;6;182;212m' },
    { label: '🔍 Anomaly-Hunter-2.0', file: 'anomaly_discovery_healer.log', color: '\x1b[38;2;96;165;250m' },
    { label: '📜 Deep-Lyrics', file: 'lyrics_completer.log', color: '\x1b[38;2;192;132;252m' },
    { label: '🏷️ Smart-Mood-Tagger', file: 'smart_mood_and_playlist_tagger.log', color: '\x1b[38;2;244;114;182m' },
    { label: '📅 Year-Genre-Enricher', file: 'year_and_genre_enricher.log', color: '\x1b[38;2;251;191;36m' }
  ];

  for (const s of streams) {
    const lines = getTailLogs(s.file, 1);
    for (const l of lines) {
      const cleanLine = l.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 68);
      out += `\x1b[38;2;6;182;212m│\x1b[0m  ${s.color}\x1b[1m[${s.label}]\x1b[0m \x1b[90m›\x1b[0m \x1b[37m${cleanLine.padEnd(68)}\x1b[0m \x1b[38;2;6;182;212m│\x1b[0m\n`;
    }
  }

  out += '\x1b[38;2;6;182;212m╰───────────────────────────────────────────────────────────────────────────────────────────╯\x1b[0m\n';
  out += '\x1b[90m(OCTAVA 24/7 ULTRA-TURBO ENGINE ONLINE | ALL QUADRANTS ACTIVE | SLEEP OFF)\x1b[0m\n';

  process.stdout.write(out);
}

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  while (true) {
    try {
      await renderDashboard();
    } catch (err) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

start().catch(console.error);
