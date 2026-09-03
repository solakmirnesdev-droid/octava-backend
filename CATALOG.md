# CATALOG.md — polishing the Octava catalog

Working book for every agent who continues polishing the ~14,400 songs.
Last pass: 2026-08-31. Every number here is **measured**, not estimated — if it
disagrees with what you see, run `npm run katalog` and trust that.

**Mirnes owns the decisions.** What gets imported and deleted is his call; how
it gets done is yours.

---

## 1. The goal — "an identical pattern on every song"

Every song should have: correct notation (H system, sharps on output), correct
grammar, no double spaces, no runs of dashes, no typos, no duplicates, complete
lyrics that do not break, its own sections (`[Strofa 1]`, `[Refren]`), no
transcriber signature, no capo instruction in the lyrics (the capo goes in the
**field**), and artists without duplicates, grammatically correct, in
**First Last** order.

---

## 2. Where we are

`npm run katalog` prints this table live. State after the 2026-08-31 pass:

**14,388 songs, 5,950 flawless (41.4%).** Before this pass it was 1,789 (12.4%).

| finding | count | share | fixed by |
|---|---|---|---|
| `nema-refren` | 7,548 | 52.5% | by hand |
| `kratak-tekst` | 1,364 | 9.5% | by hand |
| `prazna-pjesma` | 1,286 | 8.9% | by hand |
| `sekcija-bez-akorda` | 1,285 | 8.9% | by hand |
| `ponovljena-sekcija` | 102 | 0.7% | by hand |
| `capo-u-tekstu` | 32 | 0.2% | left alone on purpose, §7 |
| `dupli-razmak` | 27 | 0.2% | edge |
| `potpis` | 20 | 0.1% | edge |
| `bez-sekcija` | 15 | 0.1% | by hand |
| `razmak-prije-znaka` | 1 | 0.0% | edge |

Published songs: **11,904**.

Artists, 2,813 in total:

| finding | count |
|---|---|
| duplicate name among the living | **0** |
| possible reversed name order | 26 reported, **~4 correct** |
| name ends in a digit | 44 |
| **real `feat.` collaborations** | **0** — none exist, §5.1 |

> **AI-NOTE:** the finding keys above (`nema-refren`, `sekcija-bez-akorda`, …)
> are stored data values, queried by `quality.js --list <key>`. They stay in
> Bosnian. Translating one silently breaks every query that names it.

---

## 3. How the work is done

One entry point. Do not pick among the 113 scripts in `scripts/`.

```bash
npm run katalog                     # report, changes nothing
npm run katalog:popravi             # mechanical repairs, dry run
npm run katalog:popravi -- --write  # apply
npm run katalog:ocjeni -- --write   # write a score onto every song
npm run katalog:provjeri            # every script path still resolves
```

**Everything is a dry run until you add `--write`.** That is the entire safety
model.

### Which database — CHECK, ALWAYS

```bash
node scripts/katalog.js                    # local (.env.dev / .env)
node scripts/katalog.js --atlas            # ATLAS, production (.env.prod)
```

Every script prints the database on its first line. **If it does not say
`ATLAS`, you are writing locally.** The two databases are not the same and they
have drifted apart.

**AI-TRAP: never `import 'dotenv/config'` in a script.** It reads only `.env`,
so `--atlas` is ignored and the script quietly repairs the local catalog while
you believe you are working on production. Use `connect()` from `lib/sweep.js`.

**Before every `--write` against Atlas — back up:**

```bash
node scripts/maintenance/backup.js --atlas
```

To list the specific songs carrying one finding:

```bash
node scripts/maintenance/quality.js --list sekcija-bez-akorda --limit 40
```

Other, separate repairs:

```bash
node scripts/maintenance/doctor.js --write                # derived fields
node scripts/maintenance/fix-section-labels.js --write    # chord fused with a label
node scripts/maintenance/unpublish-incomplete.js --write  # empty songs and orphans -> draft
```

### Parallel work — shards

```bash
node scripts/katalog.js popravi --radnik 1/4
```

The four shards are disjoint and measured to be even: 3597 | 3597 | 3597 |
3598, zero overlap, summing to exactly 14,389.

**AI-TRAP: do not split into "top down" and "middle up".** That is the same
half twice, with two workers colliding on every record.

**Scripts do not need the parallelism** — a whole pass takes ~600ms. The shards
exist for **agent work**, when several sessions are polishing lyrics.

---

## 4. What lives where

| file | role |
|---|---|
| `scripts/katalog.js` | the only entry point; all commands |
| `scripts/lib/kvalitet.js` | 13 rules, a pure function with no database |
| `scripts/lib/sweep.js` | the pass: cursor, `.lean()`, `bulkWrite`, progress meter |
| `scripts/lib/dionica.js` | disjoint shards |
| `scripts/lib/confirm.js` | the lock in front of scripts that destroy data |
| `src/utils/tidyContent.js` | spaces and dashes; **does not touch chord rows** |
| `scripts/maintenance/doctor.js` | derived fields and counters |
| `scripts/maintenance/fix-section-labels.js` | chord fused with a label |
| `scripts/maintenance/unpublish-incomplete.js` | empty songs and orphans → draft |
| `scripts/maintenance/quality.js` | list of songs by finding |

A new rule goes **only** into `scripts/lib/kvalitet.js`.

---

## 5. Traps — measured, not assumed

**This is the most important section in the document.** During a single pass
over the catalog, **ten** mechanical rules reported healthy data as broken.
Every one of them looked obviously right. The rule is: **sample first, then
claim.** A number on its own is not a finding.

### 5.1 "X i Y" are not collaborations, they are band names
The regex ` i ` reports 152 "collaborations". Real `feat.` collaborations:
**0**. `ft.`: 0. ` x `: 0. What it catches are bands — *Bajaga i Instruktori*,
*Leb i Sol*, *Goran Bare i Majke*, *Đura i Mornari*. Splitting them would
invent fake artists *Instruktori*, *Sol*, *Majke* and destroy **211 names**.
The same goes for `&`: *Darko Rundek & Cargo Orkestar*. **Collaborations are
handled with an allowlist.**

### 5.2 Do not merge artists by stripping digits
A normalization that strips the digit merges *Grupa 777* with *Grupa 220*, and
*357* with *058*. Different bands.

### 5.3 Reversed name order is not corrected automatically
The heuristic reports 26; about 4 are right (*Bešlić Halid*, *Balašević
Đorđe*, *Badrić Nina*, *Tadić Vlatko*). The rest are bands — *Kraljevski
Apartman*, *Beogradski Sindikat* — and **Eric Clapton**, whom the heuristic
takes for a surname.

### 5.4 `/capo|kapo/` catches the noun *kapa*
"kap**om**", "kap**one**", every case ending. It reports 52; the real number is
40. Use a word boundary. And: **the capo moves into the field, it is not
deleted** — `[G]capo na [D]1. polju` is real information.

### 5.5 A double space in a chord row carries meaning
`[Am]   [F]   [C]` — the spacing holds the chord above its syllable.
`tidyContent` skips rows that are chords only. Do not remove that check.

### 5.6 A chord and a section label share one syntax
`[Strofa 2]` and `[Am]` are both brackets. Test against the `CHORD` regex from
`kvalitet.js`.

### 5.7 Look for chords ANYWHERE in the verse
The catalog is inline ChordPro: `ja [Am]sam`. A rule that looks for a chord at
the start of the line reports **85%** of the catalog as "no chords"; the truth
is 9%.

### 5.8 A repeated `[Refren]` is correct
A chorus is sung twice. A rule that reports every repeated label condemned
**3,717 correct songs**. Count only repeated **numbered** ones.

### 5.9 `[Prelaz / Solo]:` is a valid label
The rule for "chord fused with a label" reported **3,564 songs**. Of those,
**2,609 rows were `[Prelaz / Solo]:`** — a healthy label with a colon and not
one chord in it. The real breakage was 600. Sampling caught it; the number
looked like a discovery.

### 5.10 "izvor" is a word from the lyrics, not an attribution
The signature rule caught `izvor` and reported 622 songs. *"kad na izvor ja
pođem"*, *"More je izvor života"* — that is the lyric. `by` is not harmless
either: there is a song called **By pass**.

### 5.11 `\s` matches a line break too
The rule `/\s+[,.!?;:]/` reported 896 songs after the repair had already run.
Of 1,101 hits, **1,100 were line breaks** and one was a real space. Use
`[ \t]`.

### 5.12 Aggregation does not fire the soft-delete hook
**This one fooled three counters at once.** `Model.aggregate()` does not apply
query middleware, so it counts what is in the trash as well. Without
`$match: { deletedAt: null }` the doctor was reporting **1,200 duplicate
groups** (living: **0**), **228 identical artist names** (living: **0**), and
inflated orphans. The trash holds 1,721 songs and 295 artists. **Always
`$match` first.**

### 5.13 `select('arrangements.0.content')` does not work
MongoDB **has no projection by array index** — it returns `[{}]`, with no
error. The script then sees empty lyrics and concludes everything is fine. Use
`arrangements.content`. **`$set` by index DOES work** and does not touch the
other arrangements.

### 5.14 Mongoose silently drops fields that are not in the schema
The scorer was writing into `quality` before the field existed in `Song.js`. No
error, no warning — it reports 14,388 successful writes and changes nothing.
**Declare the field first.**

### 5.15 `searchName` goes stale because the hook does not run on `updateOne`
The pre-save hook computes `searchName` only on `save()`. Renames through
`updateOne` / `bulkWrite` bypass it, so 37 artists carried somebody else's
name — *Željko Samardžić* held `"zeljko samardzic test"`. **But do not
recompute blindly:** `Dušk'o Kuliš` has `"dusko kulis"`, while slugify gives
`"dusk o kulis"` — the apostrophe splits the word and that is **worse**. Skip
names containing an apostrophe.

### 5.16 The nightly quadrants covered half the catalog twice and half never
`quadrant_runner.js` computed `skip = quadrantIndex * quadSize` **and reversed
the sort per quadrant at the same time**. When skip counts from the opposite
end, Q1 and Q4 land on the same songs, and so do Q2 and Q3. Measured over
14,389 songs:

| quadrant | covered positions |
|---|---|
| Q1 (asc) | 1 – 3,598 |
| Q4 (desc) | 1 – 3,595 |
| Q2 (desc) | 7,194 – 10,791 |
| Q3 (asc) | 7,197 – 10,794 |

**7,190 songs (50%) were never processed**, and 7,190 were processed twice, by
two daemons colliding — every night. Fixed by using `dionice()`: 3597 | 3597 |
3597 | 3598, the sum correct, zero overlap.

**The rule: split in ONE fixed order, then walk it in whichever direction you
like.**

### 5.17 `npm run katalog popravi` does not pass the word through
npm wants `--` before arguments. The direct form works:
`node scripts/katalog.js popravi --write`.

---

## 6. Locked scripts

Three scripts permanently delete data and **nothing calls them**. They require
`OCTAVA_ALLOW_DESTRUCTIVE=YES`:

- `scripts/fixes/revert_all_to_original.js` — restores collections from a
  snapshot
- `scripts/fixes/clean_revert_final.js` — drops collections, then restores a
  backup
- `scripts/healers/heal_nonexistent_and_foreign_artists.js` — a `deleteMany`
  that bypasses the trash and the `SIGURAN SAM` modal

Since 2026-08-31 two more are locked, and **pulled out of the nightly run**:

- `daemons/auto_deduplicator_daemon.js` — `Artist.deleteOne()`, a hard delete
  around the trash. Its notion of a duplicate was unreliable: most "duplicate"
  artists were a single row with a stale `searchName` after a rename (§5.15),
  not a duplicate at all. It was probably deleting innocent artists.
- `healers/lyrics_completer.js` — pulled lyrics from tekstovi.net,
  tekstomanija.com and genius.com every night. Whether the catalog takes
  somebody else's lyrics is Mirnes's decision, not something a daemon settles
  at three in the morning.

The first two are legitimate restore scripts — which is why they are locked
rather than deleted. **If you think you need one of them, you do not.** Ask
Mirnes.

`scripts/` holds **31 scripts nothing calls** and **19 with an infinite loop.**
Do not run them by name. If you need something `katalog.js` does not do — add
a command to `katalog.js`.

---

## 7. What is done, and what remains

### Done on ATLAS (production), 2026-08-31
Backup before anything: `octava-2026-08-31T03-51-57.ejson.gz`, 26.4 MB.

| step | effect |
|---|---|
| mechanical repairs | 4,196 songs (3,221 spacing, 961 labels, 552 signatures) |
| `fix-section-labels` | 600 songs, 604 rows |
| `doctor` | counters + 31 stale `searchName` |
| `unpublish-incomplete` | **1,030 songs from published to draft** |
| `ocjeni` | all 14,384 |

**Flawless: 3,785 → 5,642 (26.3% → 39.2%).**
**Published: 13,537 → 12,507.**

Still open on Atlas: **57 living duplicate groups** (locally there are 0) and
1,065 songs sharing a YouTube video. Both need a decision by hand.

### Done locally, 2026-08-31 (backup: `octava-2026-08-31T05-27`)

| step | effect |
|---|---|
| `popravi --write` | 8,188 songs: spacing, dashes, punctuation |
| label translation | 789 `[Chorus]` / `[Verse]` → `[Refren]` / `[Strofa]` |
| `fix-section-labels --write` | **600 songs**, 604 rows; verified: **0 chords lost** |
| signature removal | 555 transcriber rows (including one stranger's email address) |
| `doctor --write` | searchTitle 1,052, chords 1,592, searchLyrics 4,497, tags 609, `searchName` 31 |
| `ocjeni --write` | a score on all 14,388 |
| `unpublish-incomplete --write` | 90 songs from published to draft (11 empty, 79 orphans) |

**Flawless: 1,789 → 5,950.**

### Remaining

**Step 1 — `sekcija-bez-akorda` (1,285) and `kratak-tekst` (1,364).**
This needs content, not cleanup. **Do not invent lyrics or chords.** Work in
shards.

**Step 2 — `nema-refren` (8,271). NOT SCRIPTABLE — measured.**
"Find the verbatim repeated section and label it `[Refren]`" sounds workable and
is not. On a 3,000-song sample carrying this flag:

| | count | share |
|---|---|---|
| has a verbatim repeated section | 282 | **9.4%** |
| does not | 2,718 | 90.6% |
| **has only ONE section in total** | **1,487** | **50%** |

For half of them the problem is not an unlabeled chorus — the lyrics were never
split into sections at all, so there is nothing to compare. A script would be
guessing in 90% of cases. By hand, in shards.

**Step 3 — `prazna-pjesma` (1,286).** A title with no lyrics. **1,275 are
already in draft** and not publicly visible; the 11 published ones were pulled.
The decision is Mirnes's: fill them or delete them.

**Step 4 — `capo-u-tekstu` (32).** Deliberately not automated: the sample shows
they are mixed in with genuine playing instructions ("svira samo ton B na bas
žici, 8. prag"), so automatic removal would eat real information. By hand, or
with a parser that moves it into the capo field.

**Step 5 — `ponovljena-sekcija` (102).** The label translation exposed them:
songs carrying `Strofa 2 | Strofa 2 | Strofa 2`. Sometimes the repetition is
deliberate, sometimes the numbering is broken — it has to be looked at.

**Step 6 — 1,061 songs share a YouTube video.** Sometimes correct (a live
medley), sometimes a misassigned video. By hand.

**Step 7 — song duplicates: DONE 2026-09-03.** Atlas held 57 living groups
(116 rows: 70 from `2akordi.net`, 38 from `pesmarica.rs`, 7 with no source).
Merged with `scripts/maintenance/merge-duplicates.js` — 59 copies to the trash,
not one of them had a single view or favourite. Remaining: **0**. Living songs
14,385 → 14,326.

The survivor is chosen in this order: **an unscraped row beats a scraped one**
(that row is Mirnes's own work; the scraped copy can be fetched again), then a
higher `quality.score`, then longer content, then the older `_id`. Losers are
**soft**-deleted and come back from the trash.

### What NOT to do

- **Never build a scraper.** Pulling another site's catalog of lyrics and
  transcriptions — `tacnaharmonija.rs`, `pesmarica.rs`, `genius.com` — is not
  work that happens here. That is why `lyrics_completer.js` was taken out of the
  nightly run and locked on 2026-08-31 (§6). Asked again on 2026-09-03 and
  declined again.
- **Song duplicates: no living groups.** Note that the 1,164/1,200 in reports
  before 2026-09-03 were an artifact of aggregation counting the trash (§5.12);
  the 57 real ones were merged on 2026-09-03, see Step 7.
- **Artist duplicates: 0 living.** After the `searchName` repair not one group
  was left.

---

## 7b. Nightly work (desktop)

```bash
npm run master        # 14 daemons, all night — ALL ON THE LOCAL DATABASE
```

No nightly daemon touches Atlas. They all read `.env` and work on the desktop's
local catalog.

**The first night after the quadrant fix is special.** Until 2026-08-31 half
the catalog was never processed (§5.16). Now all 14,389 go through, so the
grammar and diacritics rewriter touches ~7,190 songs at once for the first
time. **Do not let that run blind** — run one quadrant for a couple of minutes,
interrupt it, then compare:

```bash
node scripts/katalog.js > /tmp/before.txt
node scripts/healers/healer_q1_top_down.js     # Ctrl+C after 2 min
node scripts/katalog.js > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
```

Two things were fixed on 2026-08-31 and must stay that way:

1. **The quadrants** — see §5.16. Before the fix, half the catalog was never
   touched.
2. **`key_detector_healer.js`** requires `--daemon --write`; the master now
   passes them through `args`. Without them it does one empty pass and exits.

**Databases:** `.env` / `.env.dev` point at the local Mongo, `.env.prod` points
at Atlas. They are not the same and they have drifted. Check which one you are
writing to before `--write`.

---

## 8. What does not get touched

- **The scrapers.** They pull other people's lyrics and transcriptions. They do
  not get improved.
- **Lyrics are not invented.** If a verse is missing, it is missing.
- **The database is not touched without `--write`,** and a `--write` across
  14,000 rows is Mirnes's decision.
- **A backup before every mass write.** `npm run backup`.
- **Nothing is staged and nothing is committed.** Mirnes reviews every diff in
  VS Code. Never `git add`, never commit, never `git push` without an explicit
  yes.
