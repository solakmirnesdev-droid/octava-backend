import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const logsDir = path.join(rootDir, 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';

const SERVICES = [
  { name: 'Quadrant-1-TopDown', script: 'scripts/healer_q1_top_down.js' },
  { name: 'Quadrant-2-MidUp', script: 'scripts/healer_q2_mid_up.js' },
  { name: 'Quadrant-3-MidDown', script: 'scripts/healer_q3_mid_down.js' },
  { name: 'Quadrant-4-BottomUp', script: 'scripts/healer_q4_bottom_up.js' },
  { name: 'Year-Genre-Enricher', script: 'scripts/year_and_genre_enricher.js' },
  { name: 'Smart-Mood-Tagger', script: 'scripts/smart_mood_and_playlist_tagger.js' },
  { name: 'Deep-Forensic-Lyrics', script: 'scripts/lyrics_completer.js' },
  { name: 'Key-Detector-Healer', script: 'scripts/key_detector_healer.js' },
  { name: 'Ghost-Section-Purger', script: 'scripts/ghost_section_purger.js' },
  { name: 'RealTime-Watcher', script: 'scripts/realtime_gate_watcher.js' },
  { name: 'Portrait-Enricher', script: 'scripts/artist_portrait_enricher.js' },
  { name: 'Country-Enricher', script: 'scripts/artist_country_enricher.js' },
  { name: 'YouTube-Matcher', script: 'scripts/youtube_matcher_daemon.js' },
  { name: 'Catalog-Deduplicator', script: 'scripts/auto_deduplicator_daemon.js' },
  { name: 'Anomaly-Hunter-2.0', script: 'scripts/anomaly_discovery_healer.js' },
  { name: 'Auto-Backup-Daemon', script: 'scripts/auto_backup_daemon.js' }
];

function runService(service) {
  const logFile = path.join(logsDir, `${service.name.toLowerCase()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const child = spawn('node', [service.script], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on('exit', (code) => {
    setTimeout(() => runService(service), 3000);
  });
}

function renderBar(current, total, width = 28) {
  if (!total || total === 0) return `[${' '.repeat(width)}] 0.0%`;
  const pct = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${(pct * 100).toFixed(1)}% (${current.toLocaleString('sr-RS')}/${total.toLocaleString('sr-RS')})`;
}

async function renderSupervisorSummary() {
  try {
    const totalSongs = await Song.countDocuments({ deletedAt: null });
    const published = await Song.countDocuments({ deletedAt: null, status: 'published' });
    const withYoutube = await Song.countDocuments({ deletedAt: null, youtubeId: { $exists: true, $ne: null, $ne: '' } });

    const totalArtists = await Artist.countDocuments({ deletedAt: null });
    const withCountry = await Artist.countDocuments({ deletedAt: null, country: { $exists: true, $ne: null, $ne: '' } });
    const withImage = await Artist.countDocuments({ deletedAt: null, imageBytes: { $gt: 0 } });

    const now = new Date().toLocaleTimeString('sr-RS');

    console.log(`\n[${now}] 💎 OCTAVA OVERNIGHT MASTER (16 WORKERS RUNNING):`);
    console.log(` • Pjesme objavljene: ${renderBar(published, totalSongs, 25)}`);
    console.log(` • YouTube spotovi:   ${renderBar(withYoutube, totalSongs, 25)}`);
    console.log(` • Izvođači portreti: ${renderBar(withImage, totalArtists, 25)}`);
    console.log(` • Izvođači države:   ${renderBar(withCountry, totalArtists, 25)}`);
    console.log(` • 4 Kvadranta: Q1 [0-3.6k] ● Q2 [7.2-3.6k] ● Q3 [7.2-10.8k] ● Q4 [14.4-10.8k] ACTIVE\n`);
  } catch (err) {
    // quiet
  }
}

async function startMaster() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('💎 Master Supervisor connected to MongoDB Atlas. Spawning all 16 workers...');

  for (const s of SERVICES) {
    runService(s);
  }

  // Periodic clean heartbeat log every 10 seconds (prevents IPC spam & app crash)
  while (true) {
    await renderSupervisorSummary();
    await new Promise((r) => setTimeout(r, 10000));
  }
}

startMaster();
