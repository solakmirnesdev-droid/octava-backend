/**
 * Keeps only the discovered artists who belong in a guitar songbook.
 *
 * Country was the wrong filter on its own: "from the region" pulled in six
 * Montenegrin black metal bands, a cellist duo, several DJs and a novelist.
 * What matters is whether somebody would sit down and play them, and
 * MusicBrainz carries genre tags that answer exactly that.
 */
import fs from 'node:fs/promises';

const UA = 'Octava/0.1 ( solakmirnes.dev@gmail.com )';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Anything a guitarist would plausibly look up chords for. */
const WANTED = /\b(pop|rock|folk|sevdah|sevdalinka|turbo-folk|schlager|chanson|singer-songwriter|cantautore|ballad|new wave|blues|country|acoustic|world|balkan|yugoslav|ex-yu|zabavna|narodna)\b/i;

/** Genres where a chord chart is beside the point. */
const UNWANTED = /\b(black metal|death metal|thrash|doom|grindcore|metalcore|techno|house|trance|edm|electronic|drum and bass|dubstep|hip hop|rap|trap|classical|opera|chamber|orchestral|symphon|instrumental rock|jazz fusion|ambient|industrial|noise|psytrance|progressive trance)\b/i;

const path = new URL('./discovered.json', import.meta.url);
const artists = JSON.parse(await fs.readFile(path, 'utf8'));

const kept = [];
const dropped = [];

for (const [i, a] of artists.entries()) {
  let tags = [];
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/${a.mbid}?inc=tags+genres&fmt=json`,
      { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const d = await res.json();
      tags = [...(d.genres || []).map((g) => g.name), ...(d.tags || []).map((t) => t.name)];
    }
  } catch { /* treated as untagged below */ }

  const text = tags.join(' ');
  const wanted = WANTED.test(text);
  const unwanted = UNWANTED.test(text);

  /**
   * AI-TRAP: the condition here was once
   *   (wanted && !unwanted) || (wanted && unwanted)
   * which reduces to plain `wanted` — the unwanted check was dead code, and a
   * cello duo tagged "instrumental rock" sailed through on the word "rock".
   * An excluded genre now actually excludes.
   */
  const keep = tags.length === 0 ? true : (wanted && !unwanted);

  (keep ? kept : dropped).push({ ...a, tags: tags.slice(0, 5) });
  console.log(`  [${i + 1}/${artists.length}] ${a.name} → ${keep ? 'zadrzan' : 'odbacen'} ${tags.slice(0, 3).join(', ')}`);
  await pause(1100);
}

await fs.writeFile(path, JSON.stringify(kept, null, 2));
await fs.writeFile(new URL('./discarded.json', import.meta.url), JSON.stringify(dropped, null, 2));
console.log(`\n  zadrzano: ${kept.length}   odbaceno: ${dropped.length}`);
