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

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import { countChordsInContent, isDummyContent } from './song_quality_gate.js';

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

function renderProgressBar(current, total, width = 24) {
  if (!total || total === 0) return `[${' '.repeat(width)}] 0.0%`;
  const pct = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `\x1b[32m[${bar}]\x1b[0m \x1b[1m${(pct * 100).toFixed(1)}%\x1b[0m (${current}/${total})`;
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
  out += '\x1b[36m╔══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\n';
  out += `\x1b[36m║\x1b[0m  \x1b[1;33m💎 OCTAVA REAL-TIME POLISH & HEALER LIVE MONITOR\x1b[0m              \x1b[90m[Vrijeme: ${now}]\x1b[0m  \x1b[36m║\x1b[0m\n`;
  out += '\x1b[36m╠══════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m\n';
  out += `\x1b[36m║\x1b[0m  \x1b[1;37m📊 UKUPNO PJESAMA U BAZI:\x1b[0m  \x1b[1;32m${totalSongs}\x1b[0m                                                      \x1b[36m║\x1b[0m\n`;
  out += `\x1b[36m║\x1b[0m  • Objavljene pjesme:       ${renderProgressBar(published, totalSongs, 20)}      \x1b[36m║\x1b[0m\n`;
  out += `\x1b[36m║\x1b[0m  • Zvanični YouTube snimci: ${renderProgressBar(withYoutube, totalSongs, 20)}      \x1b[36m║\x1b[0m\n`;
  out += `\x1b[36m║\x1b[0m                                                                                      \x1b[36m║\x1b[0m\n`;
  out += `\x1b[36m║\x1b[0m  \x1b[1;37m👥 UKUPNO IZVOĐAČA:\x1b[0m        \x1b[1;32m${totalArtists}\x1b[0m                                                      \x1b[36m║\x1b[0m\n`;
  out += `\x1b[36m║\x1b[0m  • HD WebP Portreti:        ${renderProgressBar(withImage, totalArtists, 20)}      \x1b[36m║\x1b[0m\n`;
  out += `\x1b[36m║\x1b[0m  • Država & Porijeklo:      ${renderProgressBar(withCountry, totalArtists, 20)}      \x1b[36m║\x1b[0m\n`;
  out += '\x1b[36m╠══════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m\n';
  out += '\x1b[36m║\x1b[0m  \x1b[1;35m⚡ TRENUTNA LIVE AKTIVNOST HEALERA & WATCHERA (Zadnji događaji):\x1b[0m                     \x1b[36m║\x1b[0m\n';
  out += '\x1b[36m╠══════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m\n';

  const streams = [
    { label: '🎬 YouTube-Matcher', file: 'youtube-matcher.log', color: '\x1b[33m' },
    { label: '🎸 Harmonic-Healer', file: 'fast-harmonic-healer.log', color: '\x1b[32m' },
    { label: '🔍 Anomaly-Hunter', file: 'anomaly-hunter.log', color: '\x1b[34m' },
    { label: '📸 Portrait-Enricher', file: 'portrait-enricher.log', color: '\x1b[35m' }
  ];

  for (const s of streams) {
    out += `\x1b[36m║\x1b[0m  ${s.color}\x1b[1m[${s.label}]\x1b[0m\n`;
    const lines = getTailLogs(s.file, 2);
    for (const l of lines) {
      const cleanLine = l.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 80);
      out += `\x1b[36m║\x1b[0m    \x1b[90m›\x1b[0m ${cleanLine}\n`;
    }
  }

  out += '\x1b[36m╚══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\n';
  out += '\x1b[90m(Pritisni Ctrl+C za izlaz iz monitora | Osvježava se svake sekunde)\x1b[0m\n';

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
