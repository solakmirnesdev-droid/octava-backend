# Octava Daemons, Background Workers & Scripts Architecture Guide

This document describes all 11 background daemons, supervisor architecture, zero-delay throughput settings, and how they operate continuously in parallel to maintain catalog health.

---

## 🎛️ Master Supervisor (`scripts/daemons/start_overnight_master.js`)

The Master Supervisor is the central control process that launches and supervises all 11 daemons concurrently. If any child process encounters an unexpected error, the supervisor catches the exit code, logs the error, and automatically restarts the child within 3 seconds.

### Supervised Daemons Table:

| Service Name | Script File | Purpose | Concurrency / Mode |
| :--- | :--- | :--- | :--- |
| **`Fast-Harmonic-Healer`** | `scripts/daemons/continuous_quality_healer.js` | Sweeps all 14,400+ songs, standardizes `#` chords, restores diacritics, strips suffixes | Zero-delay microtask loop |
| **`Deep-Forensic-Lyrics`** | `scripts/healers/lyrics_completer.js` | Unrolls abbreviated refrains, projects chords to all verses, pulls full lyrics | Continuous batching |
| **`Key-Healer`** | `scripts/healers/key_detector_healer.js` | Harmonic cadence analysis (I-IV-V), tonality detection, barre-chord difficulty calculation | BulkWrite batches |
| **`Ghost-Purger`** | `scripts/healers/ghost_section_purger.js` | Removes empty `[Solo]`/`[Outro]` headers, merges duplicate `[Refren]`, sequences verses | Zero-delay sweep |
| **`RealTime-Watcher`** | `scripts/daemons/realtime_gate_watcher.js` | Listens to MongoDB ChangeStreams (`Song.watch()`) to polish any song created/edited in $<10\text{ ms}$ | Real-time reactive loop |
| **`Portrait-Enricher`** | `scripts/healers/artist_portrait_enricher.js` | Multi-tier genuine studio portrait finder + text-free studio silhouette fallback | 16 parallel workers |
| **`Country-Enricher`** | `scripts/healers/artist_country_enricher.js` | Instant dictionary + linguistic classifier for ISO-3166 flags and origin cities | 500-artist bulkWrite |
| **`YouTube-Matcher`** | `scripts/daemons/youtube_matcher_daemon.js` | Multi-threaded official studio audio/video matcher with rotating headers & fallbacks | 16 parallel workers |
| **`Catalog-Deduplicator`** | `scripts/daemons/auto_deduplicator_daemon.js` | Disbands hybrid duet profiles, merges duplicate artists, unifies canonical entries | Continuous sweep |
| **`Anomaly-Hunter`** | `scripts/healers/anomaly_discovery_healer.js` | Autonomous error hunter: cleans trailing years (`2011`), extensions (`.tab`), punctuation | Self-improving loop |
| **`Auto-Backup`** | `scripts/daemons/auto_backup_daemon.js` | Generates full database JSON snapshots every 2 hours in `backups/` | Cron schedule (2h) |

---

## 📊 Terminal Live Dashboard Monitor (`scripts/daemons/live_dashboard_monitor.js`)

A real-time ANSI terminal dashboard that renders live progress bars, exact percentage metrics from MongoDB, and a streaming tail of recent healer events:

```bash
node scripts/daemons/live_dashboard_monitor.js
```

### Live Metrics Monitored:
* **Total Songs & Published Ratio** (e.g. `12,498 / 14,389` — `86.9%`)
* **YouTube Video Links** (e.g. `13,395 / 14,389` — `93.1%`)
* **Total Artists** (e.g. `2,813` canonical profiles)
* **HD WebP Portraits** (`100.0%` coverage, text-free)
* **Country & Origin Flags** (`100.0%` coverage, ISO-3166)

---

## ⚡ Zero-Delay & High-Throughput Policies

1. **No Artificial Sleeps (`0ms Mode`)**:
   All artificial `setTimeout` and multi-second sleeps have been removed. Loops yield only via microtasks (`setImmediate` / `Promise.resolve()`) to allow event-loop breathing.
2. **Localhost Whitelist in Rate Limiters (`src/middleware/rateLimit.js`)**:
   Localhost IP addresses (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) are whitelisted on `publicLimiter`, `staffLimiter`, and `imageLimiter` to allow background workers infinite API throughput.
3. **MongoDB BulkWrite Architecture**:
   All bulk operations use `bulkWrite([ { updateOne: ... } ])` in batches of 50–500 to minimize database roundtrips and eliminate write bottlenecks.
