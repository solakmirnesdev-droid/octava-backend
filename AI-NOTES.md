# AI-NOTES — octava-backend

> **Entry file for every AI session on this project.** Read this first, before
> touching any code. Update it before you finish. It exists because context
> windows end and sessions reset — this file is the memory that survives.
>
> Single source of truth. [AGENTS.md](./AGENTS.md) points other tools here.

**Last updated:** 2026-08-27

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
