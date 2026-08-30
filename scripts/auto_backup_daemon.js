import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupsDir = path.join(__dirname, '../backups');

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupsDir, `octava_backup_${timestamp}.json`);

  console.log(`[AutoBackup] Starting database snapshot...`);
  
  const [songs, artists] = await Promise.all([
    Song.find({ deletedAt: null }).lean(),
    Artist.find({ deletedAt: null }).lean()
  ]);

  const payload = {
    timestamp: new Date().toISOString(),
    totalSongs: songs.length,
    totalArtists: artists.length,
    artists,
    songs
  };

  fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`🔒 [AutoBackup] Snapshot saved: ${backupFile} (${(fs.statSync(backupFile).size / 1024 / 1024).toFixed(2)} MB, ${songs.length} songs, ${artists.length} artists)`);

  // Keep only last 5 backups to save disk space
  const files = fs.readdirSync(backupsDir)
    .filter(f => f.startsWith('octava_backup_'))
    .map(f => path.join(backupsDir, f))
    .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);

  if (files.length > 5) {
    for (const oldFile of files.slice(5)) {
      fs.unlinkSync(oldFile);
      console.log(`[AutoBackup] Pruned old backup: ${path.basename(oldFile)}`);
    }
  }
}

async function runBackupDaemon() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[AutoBackup] Daemon started. Scheduled every 2 hours.');

  // Create immediate initial backup
  await createBackup();

  // Hourly loop (every 2 hours = 7,200,000 ms)
  while (true) {
    await delay(2 * 60 * 60 * 1000);
    try {
      await createBackup();
    } catch (err) {
      console.error('[AutoBackup Error]', err.message);
    }
  }
}

process.on('uncaughtException', (err) => {
  console.error('[AutoBackup UncaughtException]', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[AutoBackup UnhandledRejection]', reason);
});

if (process.argv[1]?.endsWith('auto_backup_daemon.js')) {
  runBackupDaemon().catch(console.error);
}
