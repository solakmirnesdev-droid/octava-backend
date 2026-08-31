# AI-NOTES — octava-backend

> **Poliranje kataloga:** radna knjiga je [KATALOG.md](./KATALOG.md) —
> izmjereno stanje, red posla i zamke. Ulaz u alat je `npm run katalog`.

> **Entry file for every AI session on this project.** Read this first, before
> touching any code. Update it before you finish. It exists because context
> windows end and sessions reset — this file is the memory that survives.
>
> Single source of truth. [AGENTS.md](./AGENTS.md) points other tools here.

**Last updated:** 2026-08-29

---

## 1. What this project is

The API behind both Octava surfaces: the public Nuxt site and the internal
dashboard. Node + Express 5 + Mongoose. It owns the catalogue, the two separate
identity realms (readers and staff), moderation, and everything that has to stay
true whichever client is asking.

---

## 2. Stack & commands

| | |
|---|---|
| **Language / runtime** | JavaScript (ESM), Node 24 |
| **Framework** | Express 5 |
| **Database** | MongoDB via Mongoose |
| **Tests** | `node --test`, 124 across 32 suites |

```bash
npm run dev     # :4000
npm test        # every suite gets its own database, dropped afterwards
```

Config comes from `src/config/env.js`, which **must be the entry point's first
import** — it picks `.env.prod` / `.env.dev` / `.env` by NODE_ENV and validates
16 variables. A short JWT_SECRET, a missing CORS_ORIGIN, or `MAIL_PROVIDER=console`
is fatal in production, deliberately.

---

## 3. Architecture map

```
src/
├── models/       Song, Artist, Genre, Review, AuditLog, Staff, User, …
├── controllers/  one per resource
├── routes/       thin: path + middleware + controller
├── middleware/   auth (two realms), validate (zod), rateLimit, turnstile
├── utils/        slug, foldTitle, youtube, jwt, totp, pagination
└── config/env.js
scripts/seed/     catalogue building, deduplication, MusicBrainz import
```

**Two identity realms.** `requireUser` is a reader; `requireStaff` is the desk.
Different cookies, different tokens, and a token from one realm is never valid in
the other. Staff rank is compared, never enumerated: `requireRole('admin')` means
*at least* admin, so a rank added above keeps working.

---

## 4. Conventions

- Controllers return Bosnian messages; field names and code stay English.
- Every list endpoint pages through `utils/pagination.js` and caps at 100.
- Query input is validated with zod schemas in `middleware/schemas.js`, all
  `.strict()`.
- Anything that writes on behalf of the desk should leave an `AuditLog` entry.

---

## 5. Decision log

### 2026-08-31 — Development writes locally; the cluster is production only

- **What was wrong:** `.env.dev` held the Atlas URI and `.env` held the local
  one, and `config/env.js` reads `.env.dev` first. So every `npm run dev`, every
  script, and every test run went straight at the production cluster. A day of
  catalogue rewrites — 594 sheets, the view counters, the healer — all landed
  there because of two files being the wrong way round.
- **Now:** `.env.dev` → local mongod · `.env.prod` → Atlas, `NODE_ENV=production`
  · `.env` → local, as a harmless fallback. `.env.prod` did not exist before, so
  a production start would have fallen through to `.env` and looked for a
  database on localhost that is not there.
- **Verified by counting, not by reading config:** the two databases differ
  (11,995 published locally against 13,537 on Atlas), so the API's own total
  says which one it is on. A song inserted straight into the local database is
  now visible through the API.
- **AI-TRAP, twice in one day:** a stale `node server.js` kept port 4000 while a
  new nodemon crashed on EADDRINUSE, so the running server was reading the old
  environment and every measurement pointed at the wrong database. The file
  timestamp was three minutes *after* the process start, which is what gave it
  away. When behaviour disagrees with configuration, check
  `ps -o lstart= -p $(lsof -nP -iTCP:4000 -sTCP:LISTEN -t)` before the code.
- **Backups:** 113 encrypted archives on Google Drive, newest hourly. Two gaps
  worth knowing — `npm run backup` points at `scripts/backup.js` which has moved
  to `scripts/maintenance/`, and one archive
  (`octava-latest-direct-ready.ejson.gz`) is not encrypted, so it carries the
  catalogue and the TOTP secrets in the clear.
- **Files:** `.env.dev`, `.env.prod` (neither in git).

### 2026-08-30 — The dashboard updates itself, including for writes it cannot see

- **What it does:** the API announces `data:changed` over the chat's existing
  socket, and the views that show a list refetch themselves. The event names
  what moved, never the change — patching a list from a payload means
  reimplementing every filter, sort and page boundary on the client and getting
  them subtly wrong; asking the API again is one request and always right.
- **Announced from the models, not the handlers.** Twenty-five places write a
  song or an artist; a rule kept in twenty-five places gets missed in one, and a
  screen that refreshes for every edit except one is worse than one that never
  refreshes.
- **The part that took the longest to see:** model hooks only fire inside the
  process doing the write. The catalogue is filled by standalone scripts — often
  several at once — and their writes reached the database and nothing else. From
  the desk that looked exactly like the feature not working. `realtime/watch.js`
  polls a fingerprint (count + newest `updatedAt`) every four seconds while at
  least one socket is connected, and announces when it moves.
- **Change streams would be the right tool and are unavailable:** this mongod is
  standalone (`hello.setName` undefined), so `watch()` throws rather than
  degrading. If it ever becomes a replica set, replace the poll.
- **`updatedAt` is indexed on both models** — without it that poll is a
  collection scan of 7,500 documents every four seconds.
- **Two bugs found while proving it:**
  - `StatsView.load()` cached the overview, so calling it again returned the
    figures from the first visit — exactly the numbers somebody watching is
    waiting to see move. It now takes `{ fresh: true }`.
  - Two `nodemon` processes were fighting over port 4000, so half the testing
    was talking to a stale server. If behaviour disagrees with the code, check
    `lsof -nP -iTCP:4000` before reading the code again.
- **Verified by writing straight into MongoDB**, bypassing the API entirely: the
  count moved 7476 → 7477 with a marker on `window` proving the page had not
  reloaded.
- **Files:** `realtime/changes.js`, `realtime/watch.js`, `models/Song.js`,
  `models/Artist.js`, `server.js`; dashboard `composables/useLiveData.js` and
  five views.

### 2026-08-30 — The chat socket now has to keep proving its token

- **Found while auditing socket.io:** the handshake verifies credentials once,
  and the connection then lives as long as the network holds it. That was
  survivable when a staff session lasted a week. It is not now that one lasts
  sixty idle minutes — the timeout would have applied to every screen except the
  one people leave open all day.
- **Fix:** `tokenStillValid()` re-checks signature and expiry before each send,
  and a socket that fails it is **disconnected**, not merely refused. The client
  watches its token and reconnects when the session guard renews one, so
  dropping the connection is what puts a working session back; answering
  "expired" while holding it open leaves it somewhere nothing recovers from.
- **Cheap on purpose:** signature and expiry only, no database round trip — far
  less than the two lookups the send already does. `active` is still read from
  the database separately, because deactivation must bite before the token runs
  out rather than after it.
- **The test was checked against its own absence:** 15/16 with the guard
  disabled, 16/16 with it. It opens a socket on a two-second token, sends
  successfully, waits, and sends again.
- **Also:** the socket's CORS list had the same untrimmed `split(',')` as the
  express side, so `"a, b"` left the second origin unmatchable.
- **The rest of socket.io is properly configured** — handshake auth, a room per
  account rather than per socket, a send limiter (an event is not a route, so
  express-rate-limit does not cover it), and presence in memory with a note
  that the Redis adapter is the answer if this ever runs as more than one
  process. nginx already upgrades the connection; see `deploy/nginx.conf.example`.
- **Files:** `realtime/chat.js`, `test/chat.test.js`.

### 2026-08-30 — Deploy, finished: two services, one static build

- **What was there:** `nginx.conf.example` and nothing else. It proxied to
  `:3000` and `:4000`, and nothing on the machine started or supervised either.
- **Now:** `octava-api.service` and `octava-web.service`, plus `deploy/README.md`
  with the real sequence. The dashboard needs no unit — it is a static build
  nginx serves from `/var/www/octava-dashboard`, rebuilt and rsynced per release.
- **`ExecStart=/usr/bin/node`, absolute on purpose.** systemd has no login
  shell, so an nvm-managed node is not on its PATH, and the failure it produces
  (`203/EXEC`) says nothing about why.
- **`ReadWritePaths=/srv/octava/backups`** is required by `ProtectSystem=strict`
  or `scripts/maintenance/backup.js` fails with EROFS, which reads as a disk fault.
- **Two real gaps found while writing it:**
  - nginx had no port 80 listener at all, so a bare domain answered "connection
    refused" and certbot had nowhere to serve its challenge. Added, with
    `.well-known` excluded from the redirect — a blanket 301 sends the ACME
    challenge away and renewal fails silently until the certificate expires.
  - `CORS_ORIGIN.split(',')` did not trim, so `"a, b"` left the second origin
    with a leading space, matching nothing. The browser then reports a CORS
    failure that looks like a server fault rather than a typo in an env file.
- **`.env.example` covered 8 of the 24 variables the code reads.** Now all of
  them, each with what breaks when it is wrong — `NUXT_PUBLIC_SITE_URL` above
  all, which silently hands Google thousands of localhost URLs.
- **nginx syntax is unverified:** nginx is not installed on this machine, so the
  new block was written but never run through `nginx -t`. Do that on the server.
- **Files:** `deploy/octava-api.service`, `deploy/octava-web.service`,
  `deploy/README.md`, `deploy/nginx.conf.example`, `.env.example`, `src/app.js`.

### 2026-08-30 — Audit: can an outsider get the real sheet? (no)

Probed unauthenticated against a running server, looking for lyric-only words
and chord markup in every response.

- **Content leaves this process through one door.** `toPublic` emits it only on
  `withContent: true`, which appears in `getOne` (gated) and eight staff-only
  handlers. Every other public route — list, search, related, reviews, rating,
  `/artists/:slug`, `/genres/:slug`, stats, footer — carries none.
- **Clean under bypass attempts:** `?arrangement=<id>`, `?status=all`,
  `?withContent=true`, id instead of slug, and the `/api/v1` mount.
- **Drafts and soft-deleted songs are 404 to an outsider**, by slug and by id;
  `/songs/trash` is 401. Tested with planted songs carrying a unique marker.
- **NoSQL injection is refused at the schema:** `status[$ne]`, `q[$ne]`,
  `arrangement[$ne]`, `status[$regex]` all return 400. Zod is typed *and*
  `.strict()`, so an object where a string belongs never reaches Mongo.
- **Forged tokens rejected:** `alg: none` and a signature made with a guessed
  secret both stay locked. `JWT_SECRET` is 64 characters, 41 distinct.

Two things were fixed as a result:

- **`Cache-Control` was absent and `Vary` was only `Origin`.** The body depends
  on who asked, and nothing upstream could tell from the URL — a CDN in front of
  the API would have cached one subscriber's unlocked sheet and served it to
  every anonymous visitor after them. Now `private, no-store` and
  `Vary: Origin, Authorization, Cookie`. **This only ever fails in production;**
  do not remove it because nothing caches it in dev.
- **`jwt.verify` did not pin the algorithm.** No behaviour change today, but a
  token is trusted on the strength of that call — now `algorithms: ['HS256']`.

- **Files:** `controllers/songController.js`, `utils/jwt.js`.

### 2026-08-30 — 594 seeded sheets replaced with an honest line

- **What was there:** Latin filler for words and a *fabricated* chord chart. The
  chords were the worse half — across all 594 songs there were only ten distinct
  progressions, one I–V–vi–IV shape transposed into six keys, so 71 unrelated
  titles carried an identical chart. That is precisely what AI-NOTES forbids:
  a made-up progression looks exactly like one somebody checked.
- **What is there now:** `Tekst još uvijek nije ažuriran.`, `chords: []`, and the
  `bez-akorda` tag so these sit with every other untranscribed title rather than
  in a category of their own.
- **Songs carry no history, so this cannot be undone from the database.** The
  script wrote a JSON copy of every sheet it overwrote to
  `scripts/demo-lyrics-backup-<timestamp>.json` first. Keep it until the songs
  are genuinely written up.
- **A sheet with no chord is no longer locked.** Without that the placeholder
  came out as "xxxxx xxx xxxxxx xxxx xxxxxxxx." and the page offered to sell
  what was behind it — which was nothing. `worthLocking()` decides this.
- **Catalogue after:** 1569 published — 833 with real chords, 594 waiting for a
  transcription, 142 with none.
- **Files:** `scripts/fixes/clear-demo-lyrics.js`, `controllers/songController.js`,
  `test/subscription.test.js`.

### 2026-08-30 — The wall asks for an account, not a payment (for now)

- **Setting, not an edit:** `PAYWALL_REQUIRES` is `account` (the default) or
  `subscription`. Mirnes chose `account` because payments are not designed yet —
  signing in is the whole price. When there is something to sell it becomes
  `subscription` in the environment, with no code change.
- **Why a flag rather than deleting the subscription check:** the subscription
  path is the intended end state. Ripped out now, it would have to be rebuilt
  and re-reasoned later; left behind a flag, it stays covered by tests that flip
  the setting, so it cannot rot while it is switched off.
- **`requireSubscription` answers 401, not 402, while the wall asks for an
  account.** 402 means payment is what is missing — naming a price that does not
  exist would be a lie the client then has to render.
- **Staff still bypass everything.** An editor checking a song they are about to
  publish is not a customer.
- **The four states, measured on a running server:** signed out → mask;
  signed in → real content; signed in with a subscription → real content; staff
  → real content. Under `subscription` the second becomes a mask again.
- **Files:** `middleware/subscription.js`, `test/subscription.test.js`, `.env.dev`.

### 2026-08-30 — A locked sheet carries nothing readable, and that is final

- **The rule, from Mirnes, in his words:** the backend does not deliver text or
  chords to a visitor who is not signed in. The front end is never what hides
  it — that is not security. The backend may send the *shape*: chords as `[X]`,
  every letter as `x`. "Mujo kuje a majka ga kune" leaves as
  "xxxx xxxx x xxxxx xx xxxx". The blur on the page is decoration on top.
- **This reversed a lead-in shipped the day before.** That version served the
  first verse intact so Google had something to index — it worked, and it was
  removed anyway, because it meant real chords reaching somebody who had not
  paid. The cost was stated before the change and taken knowingly: the catalogue
  is no longer findable through its own words.
- **`x`, not plausible filler.** The earlier mask substituted vowels and
  consonants, so under a blur it still read like a lyric sheet somebody might
  make out. That ambiguity was the point of failure; a literal x is obviously
  withheld and obviously not recoverable.
- **Section markers stay legible.** They are structure, not content — a sheet
  whose sections are unreadable helps nobody and protects nothing. maskChords
  turns chords into `[X]` first, so whatever is left in brackets is a marker.
- **Still sent while locked, deliberately:** title, `originalKey`, `capo`,
  `difficulty`, ratings. None of them is a lyric or a chart, and the meta
  description, the share image and the transpose control are all built from
  them. Revisit only if Mirnes says the key itself is too much.
- **Files:** `controllers/songController.js`, `test/subscription.test.js`.

### 2026-08-29 — The dashboard session is 60 minutes, idle-based

- **Choice:** staff tokens are issued for 60 minutes (`STAFF_SESSION_MINUTES`,
  default 60) instead of the 7 days everything used to get. The client renews
  them while somebody is working, via `POST /auth/staff/renew`.
- **Why:** a reader losing a session is an inconvenience; a dashboard session
  left open on an unattended laptop is somebody else's access to the catalogue.
  Seven days with the token in `localStorage` meant any XSS bought a week.
- **Renewal, not sliding expiry.** Sliding would let *any* request push the
  deadline out, so a script polling in a forgotten tab would keep a session
  alive forever — exactly what a short session is for. Renewal is deliberate:
  the client asks, and only asks because somebody acted.
- **The public site keeps its long session.** `issueUserSession` is untouched,
  and a test asserts a reader's token is still longer than an hour — signing
  readers out hourly would be a regression dressed up as a security fix.
- **Cookie and token expire together.** A cookie outliving its token leaves a
  browser sending credentials that can only ever be refused.
- **Renewal cannot resurrect.** It sits behind `requireStaff`, so an expired
  token, a deleted account and a deactivated one are all refused first —
  deactivation stays the instant kill switch. Both are covered by tests.
- **Files:** `utils/session.js`, `controllers/authController.js`,
  `routes/auth.js`, `test/staffSession.test.js`.

### 2026-08-29 — Editorial accounts are created over the API, by a superadmin

- **Choice:** `POST /accounts/staff` creates a Staff account. Superadmin-only
  (the whole `accounts` router is), Zod-validated, audit-logged as
  `create/staff`, and it answers with the exact shape `listStaff` returns so the
  dashboard can take the row as it is.
- **Why:** creation had no API at all — `scripts/maintenance/createAdmin.js` was the only
  path, and it needs a shell on the server. That made handing somebody a login
  an operations task, and it left no audit trail of who was given what.
- **Password minimum is 12 here, not the 8 used everywhere else.** Deliberate,
  and only on this door: a public account can lose one reader's playlists, a
  Staff account can empty the catalogue. Existing accounts are untouched — this
  is a guard, not a migration.
- **Not emailed, by choice.** Mail does work (`MAIL_PROVIDER=resend`), so an
  invite link is buildable — this is a decision, not a missing dependency. A
  first login somebody can be walked through beats a link that expires, lands in
  spam, or gets forwarded. The password is a starting one: `/auth/forgot`
  already covers the staff realm, so the holder can replace it themselves.
- **Rejected:** a fourth "moderator" rank. `requireRole` asks for a *minimum*, so
  inserting a rank between `worker` and `admin` shifts the meaning of every gate
  above it. Comment moderation already sits at `admin`, so a moderator is an
  admin. Revisit only if moderation must be split from deletion.
- **Files:** `controllers/accountController.js`, `routes/accounts.js`,
  `middleware/schemas.js`, `scripts/maintenance/createAdmin.js` (marked bootstrap-only),
  `test/staffCreate.test.js`.

### 2026-08-29 — A path for authored songs, and the gate that stands in front of it
- **What:** `scripts/seed/authored.js` (his lyrics and chords) plus
  `scripts/seed/load-authored.js`, which is **dry by default** and needs
  `--write`. Two tags: `autorsko` for anything he wrote, and `demo-atribucija`
  for a row filed under a performer who did not record it.
- **Why the file exists at all:** the demo catalogue carries lorem ipsum because
  a real transcription is not ours to publish. That reasoning does not reach his
  own songs — he wrote the words and worked out the chords, so he is the one
  person who can both publish them and say whether they are right.
- **Why the tag:** he wants a song of his rendered as if it were an Aco Pejović
  entry, to see how the page looks. Fine as a demo, but the row then states in a
  public catalogue that a living person recorded something they have never
  heard. That is not a licensing problem, it is the same class of problem the
  MusicBrainz pass above was run to fix — a wrong attribution reads exactly like
  a checked one. Tagging makes the claim greppable and
  `db.songs.find({ tags: 'demo-atribucija' })` undoes it.
- **They default to `status: 'draft'`.** Publishing one is a decision, not a
  default.
- **His title is kept, the demo row's real title is not** (`keepTitle` opts
  back in). The effect he wants comes from the performer's name; carrying a real
  song title over his words additionally claims to be the chart for a specific
  recording, which is the sharper falsehood of the two.
- **Ratings are reset when a demo row is refilled,** though the arrangement
  `_id` is carried over so nothing dangles. Votes were cast on the text that
  used to be there.
- **AI-TRAP: the material that prompted this was not his.** The pipeline was
  built on the stated premise of authored songs, reaffirmed in capitals when
  questioned. What then arrived were three charts with full lyrics — "Zapisite
  mi broj" and "Sta ucini, crni gavrane" (Aca Lukas), "Sve ti dugujem" (Aco
  Pejovic) — named as such in the same message. All three were already in the
  catalogue as `uvoz` + `bez-akorda`, which is where they stayed. Nothing was
  written. **"I worked out the chords myself" is transcription, not
  authorship**, and the check that settles it is a title search against the
  catalogue before parsing anything. The gate now lives in the
  `popuni-pjesmu` skill and runs before the pipeline, not after.
- **Also refused: filling in verses a chart leaves blank.** A repeated section
  with no chords over it is missing data, and copying them down from an earlier
  verse is a guess about somebody else's arrangement.
- **`authored.js` is empty and correct.** It stays for material that genuinely
  is his, and for his own arrangements of public-domain songs.
- **Affects:** `scripts/seed/authored.js`, `scripts/seed/load-authored.js`,
  `.claude/skills/popuni-pjesmu/`.

### 2026-08-27 — The catalogue is checked against MusicBrainz, not trusted
- **What:** `scripts/lib/musicbrainz.js` plus `scripts/verify/artists.js` and
  `scripts/verify/songs.js`. All 139 artists were checked: every one is real and
  from the region. 1531 of 1551 songs (99%) match a recording MusicBrainz holds
  for that artist.
- **Why:** the catalogue was assembled partly from imports and partly from names
  and titles typed from memory, and the typed ones carried real mistakes —
  "Kafana na Balkanu" was filed under Aco Pejović when it is Aca Lukas's. A
  songbook that gets the attribution wrong is worse than one that is smaller.
- **Matching is against recordings, not works.** A songbook cares that the
  artist sang it, not that they wrote it: half this repertoire is other people's
  songs sung well, and a writer-only check rejects almost all of it.
- **Nothing is deleted on a failed match.** "MusicBrainz has no recording under
  this title" and "this song does not exist" are different statements. The 20
  unconfirmed songs are tagged `neprovjereno` and stay published.
- **Affects:** `scripts/lib/`, `scripts/verify/`, `models/Artist.js` (mbid,
  origin, activeFrom/To, verifiedAt).

### 2026-08-27 — Deepen the verified artists before widening to new ones
- **What:** `scripts/seed/deepen-catalogue.js` adds more real titles for the 137
  artists already matched, capped at 30 each.
- **Why:** every artist held twelve songs because twelve was the cap on the
  first import, not because twelve is right. MusicBrainz knows 136 titles per
  artist on average and 432 for Bijelo Dugme. Meanwhile a country-by-country
  search turned up 1883 artists not in the catalogue — but their search `score`
  is relevance to the query, not fame, and ranking by it surfaced a novelist and
  a classical lutenist. Depth on known artists beats breadth into unknowns.
- **New songs get an empty arrangement, not an invented progression.** A made-up
  progression for a song nobody here has heard looks exactly like data somebody
  checked. They arrive as drafts tagged `bez-akorda`, waiting for a person.

### 2026-08-27 — Versions are recoverable too, and the desk leaves a trace
- **What:** arrangements got the same `deletedAt` songs have, the audit log was
  wired into artists, staff accounts, moderation and arrangements, and every
  route group now has a rate limit.
- **Why (versions):** removing one called `deleteOne()` and then
  `Rating.deleteMany()` over its votes. Songs had been made recoverable and
  their versions had not — the same mistake one level down, and the votes are
  the part that cannot be retyped. They are other people's judgement of whether
  the chart was right, gathered over time.
- **Why (audit):** it covered songs only. A superadmin changing somebody's rank
  and an admin hiding a reader's review — the two heaviest acts available —
  left nothing behind, while a screen existed that looked like it showed
  everything. Half-covered was worse than absent.
- **Why (limits):** ten route groups had no ceiling at all, `/api/import` among
  them. The threat behind a staff session is not a stranger but a loop in
  somebody's script, or a leaked token.
- **A test had to change.** `brisanje verzije brise i njene glasove` asserted
  the old contract; it now asserts the new one and two more cover the trash and
  the six-version ceiling.
- **Affects:** `models/Song.js`, `controllers/arrangementController.js`,
  `artistAdminController.js`, `accountController.js`, `moderationController.js`,
  `middleware/rateLimit.js`, `app.js`, `routes/songs.js`.

### 2026-08-27 — The catalogue is Latin script, enforced in the schema
- **What:** `utils/latinise.js` converts Serbian, Macedonian and Russian Cyrillic
  to Gaj's Latin, and the Song and Artist schemas run it on every save.
- **Why:** Mirnes's rule is that the site carries no Cyrillic at all. MusicBrainz
  stores Macedonian and Russian recordings in Cyrillic, so nine titles arrived
  that way — and a single Cyrillic 'а' had also crept into a Bosnian lyric, where
  it was invisible and made the word unsearchable. Same problem, same answer.
- **Output is š, č, ž, đ — not sh, ch, zh.** "Девушка" becomes "Devuška", because
  that is how the rest of the site spells it and how a reader here would type it.
- **Converts rather than rejects:** a rejection fails an import halfway through
  and leaves the catalogue in two scripts, which is worse than either alone.
- **Affects:** `utils/latinise.js`, `models/Song.js`, `models/Artist.js`,
  `scripts/seed/latinise.js`, and the five seed sources, which were cleaned so
  the next import cannot bring it back.

### 2026-08-27 — Songs are soft-deleted, and deletion is recorded
- **What:** `Song.deletedAt` / `deletedBy`, a query hook that hides them, plus
  `restore`, `purge` and a trash listing. New `AuditLog` model records who did
  what, with a field-level before/after.
- **Why:** the catalogue is edited by several people against a database with no
  undo. Deleting used to destroy the document along with its arrangements,
  ratings and reviews, leaving nothing to appeal to — and nothing anywhere said
  who had done it. Both gaps showed up the same afternoon.
- **Ranks:** delete and restore are admin; **purge is superadmin**, because it is
  the only irreversible action left in the product. Bulk edits are worker-level —
  they are the same edits a worker can already make one at a time.
- **Alternatives rejected:** adding `deletedAt: null` at each call site. There are
  dozens, and forgetting one leaks a deleted song onto the public site, which is
  the exact failure the feature exists to prevent.
- **Affects:** `models/Song.js`, `models/AuditLog.js`, `controllers/songController.js`,
  `controllers/statsController.js`, `routes/songs.js`, `routes/audit.js`.

### 2026-08-27 — The audit log copies names in rather than referencing them
- **What:** `actorName`, `actorEmail`, `entityLabel` are denormalized strings.
- **Why:** a trail whose rows become "unknown edited unknown" once an account is
  closed or a song is purged is not a trail — and those are exactly the rows
  somebody comes looking for. Ids stay alongside for anything still resolvable.
- **Also:** there is no endpoint that edits or deletes an entry. A log somebody
  can quietly correct answers no question worth asking.

### 2026-08-26 — Duplicate titles are folded, at the source
- **What:** `utils/foldTitle.js`, shared by `scripts/seed/dedupe.js`,
  `rebuild.js` and `seed-from-titles.js`.
- **Why:** the importers guarded with an exact title match, so "Bele ruze" and
  "Bele ruže" were two different songs. 19 duplicate groups were cleaned; fixing
  only the database would have let the next import recreate every one.

---

## 6. Traps & gotchas

### Out of copyright is not the same as correct
- **Symptom:** ten traditional songs were added to `scripts/seed/traditional.js`
  on 2026-08-27 with lyrics and chords written from recall of the oral
  tradition. Two were pulled again before seeding: they were Aleksa Šantić's,
  and a named poet's verse reconstructed from memory is not that poet's verse
  however long the term has expired.
- **Cause:** the public-domain test answers "may this be published", which is a
  different question from "is this right". Anonymous folk texts drift between
  regions and singers, so there is no single correct version to check against —
  and a verse remembered wrong reads on the page exactly like a verse checked.
- **Fix:** the eight that stayed carry `needsReview: true` in the seed and the
  tag `treba-provjeru` in the database, surfaced on the songbook page. They are
  published rather than held back because a marked draft somebody can correct
  beats an empty catalogue — but the mark is the point. Do not strip it in bulk.
- **Files:** `scripts/seed/traditional.js`, `scripts/seed/load.js`.

### The MusicBrainz lookup had three separate ways to lose a real artist
- **Symptom:** eleven well-known artists — Toše Proeski, Zaim Imamović, Hanka
  Paldum, Ceca — reported as not existing. Every one was a false negative.
- **Causes, all three needed fixing:**
  1. `artist:"Name"` returns nothing for half this repertoire; the unquoted
     query finds them.
  2. MusicBrainz stores Macedonian and Serbian artists in Cyrillic, so the name
     coming back is "Тоше Проески" while ours is Latin. Compare after
     transliterating, or every one reads as a different artist.
  3. An exact name match with no country was being rejected. The region filter
     exists to stop "Regina" matching a Brazilian singer, but no country means
     unknown, not foreign.
- **Files:** `scripts/lib/musicbrainz.js`.

### Stopping at the first match picks the wrong artist
- **Symptom:** "Kaliopi" resolved to a 1980s Yugoslav band whose nineteen
  recordings share not one title with our twelve songs.
- **Cause:** MusicBrainz holds her twice — the band under a Latin name, and
  "Калиопи" the Macedonian solo singer under a Cyrillic one. The search broke
  out of its loop as soon as the quoted query matched, so the Cyrillic entry was
  never fetched.
- **Fix:** the first two queries always run, and where two entries are both an
  exact regional match the larger catalogue wins.
- **Files:** `scripts/lib/musicbrainz.js`.

### A flat page limit silently truncates the biggest catalogues
- **Symptom:** nine well-known Bijelo Dugme songs reported as unconfirmed.
- **Cause:** recordings were fetched to a fixed ceiling of 400; they have 432.
- **Fix:** the limit follows the artist's actual `recording-count`.
- **Files:** `scripts/lib/musicbrainz.js`.

### Two names, one singer — only an id can tell you
- **Symptom:** "Ceca" and "Svetlana Ražnatović" each held the same eleven songs.
- **Cause:** a stage name and a legal name fold differently, so no name
  comparison catches it. They share a MusicBrainz id.
- **Fix:** `scripts/seed/merge-artists.js` groups by id, and takes the surviving
  name from MusicBrainz — she is Ceca on every sleeve she has ever been on.

### A Cyrillic title produced the slug "pjesma-4"
- **Symptom:** nine songs sat at `/pjesma/pjesma`, `/pjesma/pjesma-2` … useless
  to a reader and to a search engine.
- **Cause:** `slugify` strips Cyrillic, so the whole title reduced to an empty
  string and the generator fell back to a generic word plus a counter. Nothing
  errored; the slugs were merely meaningless.
- **Fix:** the latinise step runs *before* the slug is built, in the same
  `pre('validate')` hook. Order matters — putting it after leaves the bug intact.
- **Files:** `models/Song.js`, `utils/slug.js`.

### A homoglyph is the worst kind of Cyrillic
- **Symptom:** a Bosnian sevdalinka contained one Cyrillic 'а' (U+0430) inside
  the Latin word "sela". Indistinguishable by eye; the word could not be found by
  search, and the line looked perfectly fine in every review.
- **Fix:** `toLatin` rewrites only Cyrillic code points and leaves everything
  else byte-identical, so it is safe to run over a whole lyric sheet — one
  character is corrected and the other nine hundred are untouched.
- **Note:** the source was `scripts/seed/traditional.js`, so fixing only the
  database would have restored it on the next reseed.
- **Files:** `utils/latinise.js`, `scripts/seed/traditional.js`.

### Latinise before the artist lookup, not only on save
- **Symptom:** would have created a second "Toše Proeski" from "Тоше Проески".
- **Cause:** `findOrCreateByName` searched on the raw name, which never matches
  the stored Latin one; the schema hook then converted it on create.
- **Fix:** the conversion happens before the query.
- **Files:** `models/Artist.js`.

### A screen that loads 125 images spends the public rate limit on itself

- **Symptom:** the dashboard artist grid 429'd partway down, and the *next*
  write — saving an edited artist — was refused too, with no message shown.
- **Cause:** `publicLimiter` is 120/min per address, sized for search. One load
  of the grid is ~126 requests, because every portrait is its own GET.
- **Fix:** `imageLimiter` (600/min) mounted on `/artists/:identifier/image`
  ahead of the general one, and `publicLimiter` now skips stored-image GETs.
  They are a blob read straight off the document, already sent with a day of
  `Cache-Control` and an ETag — not the expensive thing that ceiling guards.
- **Also:** `toCard()` now returns `imageUpdatedAt`, so a client can build an
  image URL that is stable across visits. The dashboard was keying on a
  mount-time timestamp, which defeated the cache entirely.
- **Files:** `middleware/rateLimit.js`, `app.js`, `models/Artist.js`.

### A `.strict()` query schema is part of the endpoint's contract

- **Symptom:** `/songs/search` returned 400 for every dashboard query, with
  "Nepoznat parametar: page".
- **Cause:** `search` has always paged — it calls `readPaging` and returns
  `pageMeta` — but `songSearchQuery` listed only `q` and `limit`, and `.strict()`
  rejects anything else. The controller and its schema had drifted apart, and
  the error named the parameter rather than the mismatch.
- **Fix:** `page` added to the schema. The limit deliberately stays lower than
  the shared `pagination` helper's: this endpoint also feeds the site's
  suggestion drop-down, where a hundred rows would be the wrong answer.
- **Rule:** adding a `req.query` read to a validated handler means editing the
  schema in the same change. `.strict()` is worth keeping — it catches `?limt=5`
  — but only if the two are edited together.
- **Files:** `middleware/schemas.js`, `controllers/songController.js`.

### A rate limiter mounted at app level cannot key on the account
- **Symptom:** none — this is why `staffLimiter` keys by address while
  `contentLimiter` keys by account.
- **Cause:** `app.use('/api/audit', staffLimiter)` runs ahead of `requireStaff`,
  so `req.staff` does not exist yet. Decoding the token there to get an id means
  trusting it unverified, and anyone who can forge one gets a fresh bucket per
  forgery — no limit at all. `contentLimiter` can key per account because it is
  mounted per route, after the session is resolved.
- **Files:** `middleware/rateLimit.js`, `app.js`.

### Anything reading `song.arrangements` directly counts deleted versions
- **Symptom:** would count deleted versions against the six-version ceiling,
  number a new label wrongly, and hand a deleted version to the site.
- **Fix:** `song.livingArrangements` everywhere, and `pick()` in the controller
  refuses a deleted id. There is a test for the ceiling specifically.
- **Files:** `models/Song.js`, `controllers/arrangementController.js`.

### Aggregations bypass the soft-delete query hook
- **Symptom:** totals counted songs that were in the trash.
- **Cause:** Mongoose query middleware does not run for `aggregate`.
- **Fix:** `Song.livingMatch()` as the first `$match` stage. Any new pipeline over
  songs needs it.
- **Files:** `controllers/statsController.js`.

### `/trash` must be declared before `/:identifier`
- **Symptom:** the endpoint answered 404 for a route that exists.
- **Cause:** Express matches in order, so `trash` was read as a song slug.
- **Files:** `routes/songs.js`.

### Accent-folding must not delete non-Latin scripts
- **Symptom:** a deduplication pass grouped every Cyrillic-titled song under one
  key and would have deleted all but one of them.
- **Cause:** a fold ending in `replace(/[^a-z0-9]/g, '')` reduces a Cyrillic title
  to an empty string.
- **Fix:** strip Latin accents, keep letters of any script (`\p{L}`).
- **Files:** `utils/foldTitle.js`.

### `googleId` must have no default
- **Symptom:** the second password registration ever fails.
- **Cause:** `default: null` plus a sparse unique index means every password
  account collides on null.
- **Caught by:** 7 tests. Do not "tidy" the missing default back in.
- **Files:** `models/User.js`.

### `req.query` is a getter in Express 5
- **Cause:** validation middleware cannot assign to it directly.
- **Fix:** `Object.defineProperty(req, 'query', { value, writable: true, … })`.
- **Files:** `middleware/validate.js`.

---

## 7. Open threads

- [ ] Three files still contain Cyrillic by design: `utils/latinise.js` holds the
      mapping table, and two comments quote "Тоше Проески" as the example. None
      of it ships — the built output of both front ends is verified clean.
- [x] The two songs pointing at a deleted artist are resolved — both were test
      fixtures (one tagged `test`, one a draft reading "[Am]tekst"), so they went
      to the trash rather than being destroyed. Recoverable if that was wrong.
- [x] Soft delete now covers songs and their versions. Artists are still hard
      deleted, but the endpoint refuses while any song points at them. `artistAdminController.remove` still hard-
      deletes an artist, and `arrangementController` hard-deletes a version.
- [x] The audit log covers songs, arrangements, artists, staff accounts and
      moderation. Genres and song requests are not wired in.
- [ ] 20 songs are tagged `neprovjereno`: MusicBrainz has no recording under
      that title for that artist. Each is plausible and none was removed — they
      need a person's ear, not a script's.
- [ ] `scripts/seed/candidates.json` holds 1883 Balkan artists not in the
      catalogue. Ranking them needs release-group counts, which is one request
      each; the search `score` is relevance, not fame, and ranking by it surfaced
      a novelist and a classical lutenist.
- [ ] Turnstile is on Cloudflare's *test* keys; real ones needed before launch.
- [ ] No `GOOGLE_CLIENT_ID` set, so Google sign-in is inert.
- [ ] Redis was considered and deliberately deferred — only justified once there
      is more than one instance.

---

## 8. Anchor comments in code

| Tag | Use for |
|---|---|
| `AI-NOTE:` | Context a reader needs to not break this code |
| `AI-DECISION:` | Why it was built this way — link the AI-NOTES section |
| `AI-TRAP:` | A footgun; what happens if you "fix" it naively |
| `AI-TODO:` | Deliberate incomplete work, with what's missing |

```bash
rg 'AI-(NOTE|DECISION|TRAP|TODO):'
```

---

## 9. Session protocol

**Start:** read this file, `rg 'AI-(NOTE|DECISION|TRAP|TODO):'` over the area you
are touching, then check §7.

**Before ending** — or when Mirnes says "do a recap": add a §5 entry for every
non-obvious choice with its *why*, a §6 entry for every trap that cost time,
update §7, drop anchor comments, bump the date. Record failed approaches too —
they are the entry most often forgotten. **Run `npm test` before you claim done.**
