# Octava Backend & Autonomous Polish Suite

Express.js + MongoDB API + Autonomous Quality Healers for the Octava guitar chords platform.

## 🚀 Quick Setup (Any Machine / Desktop PC)

```bash
npm install
cp .env.example .env.dev
node server.js
```

Server runs on `http://localhost:4000`.

| Service | Port | Description |
|---|---|---|
| **octava-app** | 3000 | User mobile/web client |
| **octava-backend** | 4000 | Core API & ChangeStreams |
| **octava-dashboard** | 8000 | Staff & curation dashboard |

---

## 💎 Master Polish & Healer Suite (11 Daemons)

To start the autonomous 11-daemon supervisor:
```bash
node scripts/start_overnight_master.js
```

To monitor real-time progress and live metrics in terminal:
```bash
node scripts/live_dashboard_monitor.js
```

---

## 📚 Knowledge Base & Documentation

* 📜 **[Quality Gate Standards (Rules 1–57)](./docs/QUALITY_GATE_STANDARD.md)**: The inviolable rules for lyrics, chords, `#` notation, diacritics, and deduplication.
* 🎛️ **[Daemons & Scripts Architecture Guide](./docs/DAEMONS_AND_SCRIPTS_GUIDE.md)**: How all 11 daemons operate concurrently in zero-delay mode.
* 🖥️ **[Desktop PC Setup & Handover Guide](./docs/DESKTOP_SETUP_AND_HANDOVER.md)**: Instructions for running on other machines and handing over context to AI agents.
* 🤖 **[Skill Definition](./skills/song-chords/SKILL.md)**: Native Antigravity / Agentic skill package for song harmonization and curation.
