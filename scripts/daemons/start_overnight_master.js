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

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';

/*
 * AI-DECISION: two daemons were taken out of the nightly run on 2026-08-31 and
 * locked behind OCTAVA_DOZVOLI_RUSENJE=DA. Neither is deleted; both still run
 * by hand, deliberately.
 *
 *   Deep-Forensic-Lyrics  — scraped lyrics off tekstovi.net, tekstomanija.com
 *     and genius.com every night. Whether the catalogue takes third-party
 *     lyrics is Mirnes's call, not something a daemon should decide at 3am.
 *
 *   Catalog-Deduplicator  — Artist.deleteOne(), a HARD delete that walks past
 *     the trash and the SIGURAN SAM modal. Worse, its notion of a duplicate was
 *     unreliable: most "duplicate" artists turned out to be one row carrying a
 *     stale searchName after a rename, not a duplicate at all. It has probably
 *     been deleting innocent artists for a while.
 *
 * See KATALOG.md §6.
 */
const SERVICES = [
  { name: 'Quadrant-1-TopDown', script: 'scripts/healers/healer_q1_top_down.js' },
  { name: 'Quadrant-2-MidUp', script: 'scripts/healers/healer_q2_mid_up.js' },
  { name: 'Quadrant-3-MidDown', script: 'scripts/healers/healer_q3_mid_down.js' },
  { name: 'Quadrant-4-BottomUp', script: 'scripts/healers/healer_q4_bottom_up.js' },
  { name: 'Year-Genre-Enricher', script: 'scripts/healers/year_and_genre_enricher.js' },
  { name: 'Smart-Mood-Tagger', script: 'scripts/healers/smart_mood_and_playlist_tagger.js' },
  { name: 'Key-Detector-Healer', script: 'scripts/healers/key_detector_healer.js', args: ['--daemon', '--write'] },
  { name: 'Ghost-Section-Purger', script: 'scripts/healers/ghost_section_purger.js' },
  { name: 'RealTime-Watcher', script: 'scripts/daemons/realtime_gate_watcher.js' },
  { name: 'Portrait-Enricher', script: 'scripts/healers/artist_portrait_enricher.js' },
  { name: 'Country-Enricher', script: 'scripts/healers/artist_country_enricher.js' },
  { name: 'YouTube-Matcher', script: 'scripts/daemons/youtube_matcher_daemon.js' },
  { name: 'Anomaly-Hunter-2.0', script: 'scripts/healers/anomaly_discovery_healer.js' },
  { name: 'Auto-Backup-Daemon', script: 'scripts/daemons/auto_backup_daemon.js' }
];

function runService(service) {
  const logFile = path.join(logsDir, `${service.name.toLowerCase()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const child = spawn('node', [service.script, ...(service.args || [])], {
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
