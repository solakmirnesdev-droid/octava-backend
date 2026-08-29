---
name: popuni-pjesmu
description: Put real lyrics and chords into an Octava song — the gate that decides what may go in, the ChordPro intake tool, and the loader. Use when filling a song's content, replacing a lorem ipsum demo entry, adding an arrangement, or when Mirnes pastes a chord chart as text or an image.
---

# Popuni pjesmu

Getting content into a song in `octava-backend`. Read the gate before the
pipeline — the pipeline is easy and the gate is where this goes wrong.

## 1. The gate — run this first, every time

A chart lands in the chat. Before parsing a single bracket, answer one question:
**whose song is this?**

| Source | Verdict |
|---|---|
| Mirnes wrote the words and the music | **In.** Tag `autorsko`. |
| Public domain — sevdalinka, narodna, anonymous and old | **In.** Tag `javno-vlasnistvo`. |
| Mirnes's own arrangement of a public-domain song | **In.** Same tag. |
| A released song by a named performer | **Out.** Title and artist only. |

**"I worked out the chords myself" does not move a song across that line.** The
lyrics stay someone else's, and a chord chart laid against a specific recording
is a derivative representation of a protected composition — which is why the
large sites license theirs. Working it out by ear is transcription, not
authorship.

Two checks that catch the common mistake, because it has now been made here:

- **Does the chart carry the real lyrics of a song a named performer released?**
  Then it is out, whoever typed the chords. In August 2026 three charts arrived
  labelled as authored work and turned out to be Aca Lukas and Aco Pejović
  titles — named as such in the same message that offered them.
- **Search the catalogue by title before doing anything else.** If it comes back
  `uvoz` + `bez-akorda`, that is not a gap waiting to be filled. It is the
  deliberate state described in `AI-NOTES.md` §5: the title is a fact and may
  stand, the content is not ours.

```bash
node --input-type=module -e "
import 'dotenv/config'; import mongoose from 'mongoose';
import Song from './src/models/Song.js';
await mongoose.connect(process.env.MONGODB_URI);
const rows = await Song.find({ searchTitle: /NASLOV/i }).populate('artist','name').select('title slug status tags artist');
for (const r of rows) console.log(r.slug, '|', r.artist?.name, '|', r.status, '|', r.tags.join(','));
await mongoose.disconnect();"
```

**Never fill in the verses a chart leaves blank.** A repeated section with no
chords written above it is missing data. Copying the chords down from an earlier
verse is a guess about someone else's arrangement, and an invented progression
is indistinguishable from a checked one. This is the same rule that keeps 1589
imported titles empty on purpose.

Refusing is one sentence, not a lecture. Say what is out, say the songs already
sit in the catalogue correctly, and offer the public-domain path — that one is
open, the loader is built, and it is what actually grows the catalogue.

## 2. Intake — chart to ChordPro

`scripts/intake.mjs` converts a pasted chart into the stored format, using the
repo's own `src/utils/chords.js`, so notation cannot drift from what the app
prints.

```bash
node .claude/skills/popuni-pjesmu/scripts/intake.mjs chart.txt --key Am --capo 2
```

Handles chords-above-lyrics and already-inline `[Am]like [F]this`. Rewrites `Bb`
to `A#` and `B` to `H`. Recognises section markers so `[Refren]` is not parsed
as C plus "efren". A chord line with nothing under it stays a bar line.

Read the report it prints, not just the body: the chord list, and the `WARN`
lines for any flat or bare `B` that survived.

## 3. Load

Content lives in `scripts/seed/`, split data from logic:

| Material | Data | Loader |
|---|---|---|
| Public domain | `seed/traditional.js` | `seed/load.js` |
| Mirnes's own | `seed/authored.js` | `seed/load-authored.js` |

`load-authored.js` is **dry by default**; `--write` commits. Both are idempotent
by slug, so a text can be corrected and reloaded rather than duplicated.

`load-authored.js` tags `demo-atribucija` whenever `artist` differs from
`author` — filing an authored song under a real singer is a demo device, and the
row then claims in a public catalogue that a living person recorded it. Default
`status` is `draft`. Do not strip either without being told to.

## 4. Conventions the content itself must satisfy

- **H is the twelfth degree; sharps only on output.** `A#`, never `Bb`. Input is
  tolerant, output never is.
- **Stored chords are the SOUNDING chords**, and `originalKey` is the sounding
  key. `capo` is a suggestion for where to clamp — never an offset already
  baked into the symbols. `sounding = shape + capo`. A capo must never change
  the key.
- **Sections are bracket tokens on their own line:** `[Uvod]`, `[Strofa 1]`,
  `[Refren]`, `[Solo]`, `[Kraj]`.
- **Do not set `arrangements.chords`.** The pre-validate hook in `Song.js` runs
  `extractChords` on every save.
- **A folk text written from recall carries `treba-provjeru`** until a person
  who knows the song has read it. Out of copyright is not the same as correct,
  and this tag is never stripped in bulk.

## 5. Before you say it worked

```bash
npm test    # 221 tests, 56 suites; every suite gets its own database
```

Then look at the song in the dashboard on :8000. Check the key label against the
capo control, and confirm no chord renders with a flat.

Leave everything unstaged. Other sessions edit this same checkout — read
`git diff` before undoing anything, and never `git add`.
