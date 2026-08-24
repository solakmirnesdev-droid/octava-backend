# Octava Backend

Express.js + MongoDB API for Octava guitar chords application.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Server runs on `http://localhost:4000`.

| Service | Port |
|---|---|
| octava-app (users) | 3000 |
| octava-backend (API) | 4000 |
| octava-dashboard (workers) | 8000 |

5000 is intentionally unused — reserved for RareCarat.
