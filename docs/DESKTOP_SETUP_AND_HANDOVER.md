# Desktop PC Setup, Handover & Quick-Start Guide

This guide contains everything required to clone, run, and continue work on your Desktop PC or any other machine.

---

## 🛠️ Step-by-Step Desktop PC Setup

### 1. Clone or Pull the Repository
```bash
git clone <repo-url> octava-backend
cd octava-backend
```
*(If already cloned, just run `git pull origin main`)*

---

### 2. Install Dependencies
```bash
npm install
```

---

### 3. Configure Environment (`.env.dev` or `.env`)
Ensure your `.env.dev` or `.env` points to your MongoDB instance:
```env
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/octava
JWT_SECRET=your_super_secret_jwt_key_here
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:5174
```

---

### 4. Start Octava Backend API Server
```bash
node server.js
```
The API server will listen on `http://localhost:4000`.

---

### 5. Launch the 11-Daemon Master Polish Supervisor
In a new terminal window:
```bash
node scripts/start_overnight_master.js
```
This automatically starts all 11 daemons:
* 🎸 Harmonic Healer (Akordi & kvačice)
* 🎬 YouTube Matcher (Turbo 16-worker pool)
* 🎼 Key & Difficulty Healer
* 🪓 Ghost Section Purger
* ⚡ Real-Time ChangeStream Watcher
* 🔍 Autonomous Anomaly Hunter
* 📸 100% Text-Free Studio Portrait Engine
* 👥 Catalog Deduplicator & Duet Merger
* 💾 Rolling Auto-Backup (Every 2h)

---

### 6. View Live Terminal Monitor
In a third terminal window:
```bash
node scripts/live_dashboard_monitor.js
```

---

## 🤖 Antigravity / AI Agent Handoff

If you open Antigravity, Claude, or any coding agent on your desktop PC:
1. The agent will automatically find the skill in `.agent/skills/song-chords/SKILL.md` or `skills/song-chords/SKILL.md`.
2. All 57 Quality Gate Rules and architectural decisions are documented in `docs/QUALITY_GATE_STANDARD.md`.
3. To tell the agent to continue, simply prompt:
   > *"Nastavi sa radom, pokreni master supervisor i live dashboard monitor."*
