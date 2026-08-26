/**
 * The last cut, made by judgement rather than by rule.
 *
 * Four rounds of automated filtering each got to roughly seventy percent and
 * left a residue that no rule caught: recording count measures how prolific
 * somebody is, not whether a guitarist would ever look them up. A classical
 * pianist with a thousand recordings outranked every rock band in the list.
 *
 * These names are removed because of what they play, not how much. Each one is
 * listed with its reason so the decision can be argued with later.
 */
import fs from 'node:fs/promises';

const DROP = new Map([
  ['Ana-Marija Markovina',      'pijanistica, klasika'],
  ['Titan Slayer',              'metal'],
  ['Who See',                   'hip-hop'],
  ['Кочани Оркестар',           'limeni orkestar'],
  ['Boban Marković Orkestar',   'limeni orkestar'],
  ['Disease',                   'punk, slabo poznat'],
  ['Ареа',                      'slabo poznat'],
  ['Eliza Stark & The Dappers', 'mali rockabilly sastav'],
  ['Highway',                   'slabo poznat pop'],
  ['Damir Price',               'nije izvodjac za pjesmaricu']
]);

const dir = new URL('./', import.meta.url);
const kept = JSON.parse(await fs.readFile(new URL('discovered.json', dir), 'utf8'));
const dropped = JSON.parse(await fs.readFile(new URL('discarded.json', dir), 'utf8'));

const final = [];
for (const a of kept) {
  const why = DROP.get(a.name);
  if (why) dropped.push({ ...a, reason: `rucno: ${why}` });
  else final.push(a);
}

await fs.writeFile(new URL('discovered.json', dir), JSON.stringify(final, null, 2));
await fs.writeFile(new URL('discarded.json', dir), JSON.stringify(dropped, null, 2));
console.log(`  zadrzano ${final.length}  ·  rucno uklonjeno ${kept.length - final.length}`);
for (const a of final) console.log(`    ${a.name}  (${a.country})`);
