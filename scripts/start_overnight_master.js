import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const logsDir = path.join(rootDir, 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const SERVICES = [
  { name: 'Fast-Harmonic-Healer', script: 'scripts/continuous_quality_healer.js' },
  { name: 'Deep-Forensic-Lyrics', script: 'scripts/lyrics_completer.js' },
  { name: 'Key-Healer', script: 'scripts/key_detector_healer.js' },
  { name: 'Ghost-Purger', script: 'scripts/ghost_section_purger.js' },
  { name: 'RealTime-Watcher', script: 'scripts/realtime_gate_watcher.js' },
  { name: 'Portrait-Enricher', script: 'scripts/artist_portrait_enricher.js' },
  { name: 'Country-Enricher', script: 'scripts/artist_country_enricher.js' },
  { name: 'YouTube-Matcher', script: 'scripts/youtube_matcher_daemon.js' },
  { name: 'Catalog-Deduplicator', script: 'scripts/auto_deduplicator_daemon.js' },
  { name: 'Anomaly-Hunter', script: 'scripts/anomaly_discovery_healer.js' },
  { name: 'Auto-Backup', script: 'scripts/auto_backup_daemon.js' }
];

console.log('======================================================================');
console.log('💎  OCTAVA MASTER SUPERVISOR — 100% TOTAL POLISH MODE (ZERO CRAWLERS)');
console.log('======================================================================\n');

function runService(service) {
  const logFile = path.join(logsDir, `${service.name.toLowerCase()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const args = [service.script, ...(service.args || [])];
  const child = spawn('node', args, {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  console.log(`🚀 [Started] Service "${service.name}" (PID: ${child.pid}) -> logs/${service.name.toLowerCase()}.log`);

  child.on('exit', (code, signal) => {
    console.warn(`⚠️ [Restarting] Service "${service.name}" exited (code: ${code}, signal: ${signal}). Auto-restarting in 3s...`);
    setTimeout(() => runService(service), 3000);
  });
}

// Start all services
for (const s of SERVICES) {
  runService(s);
}

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Master Supervisor...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[Master Supervisor UncaughtException]', err.message);
});
