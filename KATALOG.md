# KATALOG.md — poliranje Octava kataloga

Radna knjiga za svakog agenta koji nastavlja poliranje ~14.400 pjesama.
Napisana 2026-08-31. Svi brojevi u njoj su **izmjereni**, ne procijenjeni —
ako se ne slažu s onim što vidiš, prvo pokreni `npm run katalog` pa vjeruj
njemu, ne ovom dokumentu.

Vlasnik odluka je **Mirnes**. Šta se uvozi i šta se briše je njegov poziv;
kako se to izvodi je tvoj.

---

## 1. Cilj — „identičan obrazac po svakoj pjesmi"

Svaka pjesma treba imati:

- tačnu notaciju (H sistem, povisilice na izlazu, `Bb` → `A#`)
- tačnu gramatiku i pravopis
- bez duplih razmaka u rečenici
- bez nizova crtica
- bez tipfelera
- bez duplikata u katalogu
- tekst koji se ne lomi i **koji je potpun** — ne fali strofa, ne fale akordi
  na drugoj strofi
- svoje sekcije: `[Strofa 1]`, `[Refren]`, `[Strofa 2]`…
- bez potpisa na kraju (`by Mirnes Solak`)
- bez capo uputstva na početku teksta — capo ide u **polje**, ne u tekst
- izvođače bez duplikata, gramatički tačne, u redu **Ime Prezime**

---

## 2. Gdje smo — izmjereno stanje

`npm run katalog` daje ovu tabelu uživo. Stanje na 2026-08-31:

**14.388 pjesama ocijenjeno, 1.789 besprijekornih (12,4%).**

| nalaz | broj | udio | popravlja |
|---|---|---|---|
| `nema-refren` | 7.550 | 52,5% | ručno |
| `dupli-razmak` | 6.386 | 44,4% | skripta |
| `kvar-u-oznaci` | 3.523 | 24,5% | skripta *(nije napisana)* |
| `razmak-prije-znaka` | 2.856 | 19,8% | skripta |
| `crtice` | 2.079 | 14,4% | skripta |
| `sekcija-bez-akorda` | 1.381 | 9,6% | ručno |
| `kratak-tekst` | 1.338 | 9,3% | ručno |
| `prazna-pjesma` | 1.286 | 8,9% | ručno |
| `potpis` | 622 | 4,3% | skripta |
| `engleske-oznake` | 265 | 1,8% | skripta |
| `capo-u-tekstu` | 32 | 0,2% | skripta |
| `bez-sekcija` | 15 | 0,1% | ručno |
| `ponovljena-sekcija` | 5 | 0,0% | ručno |

**Katalog je stvarno 13.102 prave pjesme.** Onih 1.286 `prazna-pjesma` su
ostaci uvoznika: naslov postoji, teksta nema (`{Tekst i akordi još nisu
upisani.}`). Naduvavaju brojku i kvare pretragu.

Izvođači, 2.813 ukupno:

| nalaz | broj | šta s tim |
|---|---|---|
| moguć obrnut red imena | 26 prijavljeno, **~4 tačna** | samo ručno |
| ime završava cifrom | 44 | provjeri svaki |
| višak razmaka | 1 | sitnica |
| **prave `feat.` saradnje** | **0** | ne postoje, vidi §5 |

---

## 3. Kako se radi

Jedan ulaz. Ne biraj među 111 skripti u `scripts/`.

```bash
npm run katalog                     # izvještaj, ne mijenja ništa
npm run katalog:popravi             # mehaničke popravke, probni prolaz
npm run katalog:popravi -- --write  # primijeni
npm run katalog:ocjeni -- --write   # upiši ocjenu na svaku pjesmu
npm run katalog:provjeri            # sve putanje se razrješavaju
```

**Sve je probno dok ne dodaš `--write`.** To je cijeli sigurnosni model —
nemoj pisati naredbu koja ga zaobilazi.

Za spisak konkretnih pjesama s jednim nalazom:

```bash
node scripts/maintenance/quality.js --list sekcija-bez-akorda --limit 40
```

### Paralelni rad — dionice

```bash
node scripts/katalog.js popravi --radnik 1/4
node scripts/katalog.js popravi --radnik 2/4
node scripts/katalog.js popravi --radnik 3/4
node scripts/katalog.js popravi --radnik 4/4
```

Četiri dionice su **disjunktne i izmjereno ravnomjerne**: 3597 | 3597 | 3597 |
3598, nula preklapanja, zbir tačno 14.389.

**AI-TRAP — ne dijeli „od vrha prema sredini" i „od sredine prema vrhu".** To
je ista polovina dvaput, s dva radnika koji se sudaraju na svakom zapisu.
Dionice su susjedni `_id` rasponi rezani na izmjerenim kvantilima: disjunktne
po konstrukciji, koriste `_id` indeks, i ravnomjerne su iako su ObjectId-evi
zgusnuti tamo gdje je uvoz išao brzo.

**Za skripte paralelizam NIJE potreban.** Cijeli mehanički prolaz kroz
14.388 pjesama traje **552ms** (izmjereno, batch 1000). Četiri procesa da se
uštedi 400 milisekundi donose sudare u pisanju i djelimične greške bez ikakve
koristi. Dionice postoje za **agentski rad** — kad četiri Gemini sesije
poliraju tekstove i ne smiju dirati istu pjesmu.

---

## 4. Šta je gdje

| fajl | uloga |
|---|---|
| `scripts/katalog.js` | jedini ulaz; sve naredbe |
| `scripts/lib/kvalitet.js` | 13 pravila kvaliteta, čista funkcija, bez baze |
| `scripts/lib/sweep.js` | prolaz kroz bazu: kursor, `.lean()`, `bulkWrite`, vodomjer |
| `scripts/lib/dionica.js` | podjela na disjunktne dionice |
| `scripts/lib/potvrdi.js` | brava ispred skripti koje trajno brišu |
| `src/utils/tidyContent.js` | čišćenje razmaka/crtica; **ne dira redove koji su samo akordi** |
| `scripts/maintenance/quality.js` | spisak konkretnih pjesama po nalazu |
| `scripts/maintenance/doctor.js` | popravlja izvedena polja (`searchTitle`, `searchLyrics`, brojači) |

Novo pravilo se dodaje **samo** u `scripts/lib/kvalitet.js`. Ne piši ga u
skripte — obje ga čitaju odatle.

---

## 5. Zamke — izmjerene, ne pretpostavljene

Ovo nisu mišljenja. Svaka je nastala tako što je mehaničko pravilo prijavilo
zdrave podatke kao pokvarene, na ovim podacima, u ovoj bazi. **Šest puta u
jednoj sesiji.** Zato: prvo uzorak, pa tvrdnja.

### 5.1 „X i Y" nisu saradnje nego imena bendova
Regex ` i ` prijavi 152 „saradnje". Prave `feat.` saradnje: **0**. `ft.`: 0.
` x `: 0. Ono što regex hvata su bendovi — *Bajaga i Instruktori*, *Leb i Sol*,
*Goran Bare i Majke*, *Kanda Kodža i Nebojša*, *Đura i Mornari*. Skripta koja
ih „razdvaja" napravila bi lažne izvođače *Instruktori*, *Sol*, *Majke* i
uništila **211 imena**. Isto vrijedi za `&`: *Darko Rundek & Cargo Orkestar*.

**Pravilo: saradnje se rješavaju bijelom listom, nikad regexom.**

### 5.2 Ne spajaj izvođače po skinutim ciframa
Normalizacija koja skida cifru s kraja spoji *Grupa 777* s *Grupa 220*, i
*357* s *058*. To su različiti bendovi. Od 7 prijavljenih grupa duplikata
stvarna su **dva**: `Zdravko Čolić 2010`, `Gibonni 2010`.

### 5.3 Obrnut red imena se ne ispravlja automatski
Heuristika „prvi token liči na prezime" prijavi 26, tačna su ~4
(*Bešlić Halid*, *Balašević Đorđe*, *Badrić Nina*, *Tadić Vlatko*). Ostalo su
bendovi — *Kraljevski Apartman*, *Beogradski Sindikat*, *Bosutski Bečari* — i
**Eric Clapton**, kojeg heuristika smatra prezimenom.

### 5.4 Capo se seli, ne briše
`Song` ima capo polje. „Capo 2" je stvarna informacija.
I: `/capo|kapo/` hvata „kap**om**", „kap**one**" i svaki padež imenice *kapa* —
prijavi 52, stvarno je **40**.

### 5.5 Dupli razmak u redu akorada je nosiv
`[Am]   [F]   [C]` — razmak drži akord iznad sloga. `tidyContent` zato
preskače redove koji su samo akordi. Ne uklanjaj tu provjeru.

### 5.6 Akord i oznaka sekcije imaju istu sintaksu
`[Strofa 2]` i `[Am]` su oboje zagrade. Zamijeni ih u jednom smjeru i svaka
pjesma izgleda strukturirano; u drugom — svaka izgleda bez akorada. Testiraj
akord protiv `CHORD` regexa iz `kvalitet.js`.

### 5.7 Akorde traži BILO GDJE u strofi, ne na početku reda
Katalog je inline ChordPro: `ja [Am]sam`. Pravilo koje traži akord na početku
reda prijavi **85%** kataloga kao „bez akorada"; istina je **9,6%**.

### 5.8 Ponovljen `[Refren]` je ispravan
Refren se pjeva dvaput. Pravilo koje prijavljuje svaku ponovljenu oznaku
osudilo je **3.717 ispravnih pjesama**. Broji samo ponovljene **numerisane**
oznake — pravih je 5.

### 5.9 `select('arrangements.0.content')` ne radi
MongoDB **nema projekciju po indeksu niza**. Taj put tumači kao polje po imenu
`0`, ne nađe ga, i vrati `[{}]` — bez greške i bez upozorenja. Skripta onda
vidi prazan tekst i zaključi da je sve ispravno. Koristi
`select('arrangements.content')`.

**`$set` po indeksu RADI** — `{$set: {'arrangements.0.content': x}}` je ispravno
i ne dira ostale aranžmane. Provjereno.

### 5.10 `npm run katalog popravi` ne prosljeđuje riječ
npm traži `--` prije argumenata. Zato svaka naredba ima svoj npm ulaz.
Direktni oblik radi normalno: `node scripts/katalog.js popravi --write`.

---

## 6. Zaključane skripte

Tri skripte trajno brišu podatke i **niko ih ne poziva**. Traže
`OCTAVA_DOZVOLI_RUSENJE=DA`:

- `scripts/fixes/revert_all_to_original.js` — vraća sve kolekcije iz snimka
- `scripts/fixes/clean_revert_final.js` — briše kolekcije pa vraća backup
- `scripts/healers/heal_nonexistent_and_foreign_artists.js` — `deleteMany`
  koji zaobilazi kantu i modal `SIGURAN SAM`

Prve dvije su legitimne restore skripte — zato su zaključane, a ne obrisane.
**Ako ti se čini da ti treba jedna od njih, ne treba ti.** Pitaj Mirnesa.

U `scripts/` je **31 skripta koju niko ne poziva** i **19 s beskonačnom
petljom**. Ne pokreći ih po imenu. Ako ti treba nešto što `katalog.js` ne
radi — dodaj naredbu u `katalog.js`.

---

## 7. Red posla — nastavi ovdje

### Korak 1 — mehaničko, čeka Mirnesovo odobrenje
```bash
npm run katalog:popravi -- --write
```
**8.188 pjesama**, ~550ms. Skida `dupli-razmak`, `crtice`,
`razmak-prije-znaka`, `engleske-oznake`. Sigurno je: `tidyContent` ne dira
redove akorada.

### Korak 2 — ocjene na disk
```bash
npm run katalog:ocjeni -- --write
```
Upiše `quality.score` i `quality.flags` na svaku pjesmu, pa dashboard može
imati red „traži pažnju", najgore prvo.

### Korak 3 — `kvar-u-oznaci`, 3.523 pjesme (NIJE NAPISANO)
Najveći strukturni kvar. Izgleda ovako:

```
[Strofa 1]
[Hm][Strofa [G]1]     [D]       [A]     ← red akorada slijepljen s oznakom
```

Red akorada je spojen s oznakom sekcije, a jedan akord je upao **unutar**
zagrade. Namjerno nije automatizovano: raspetljavanje znači odlučiti koji
akord ide iznad kojeg sloga, a pogrešna pretpostavka **tiho pomjeri akorde u
četvrtini kataloga**. Traži zasebnu skriptu i uzorak od bar 30 pjesama
pregledanih ručno prije `--write`.

### Korak 4 — 1.286 praznih pjesama
Naslov bez teksta. Odluka je Mirnesova: napuniti ili skinuti s objave.
**Ne izmišljaj tekst.**

### Korak 5 — 1.164 grupe duplikata
Čeka pravilo od Mirnesa: koja verzija pobjeđuje — starija, ona s više pregleda,
ili ona s dužim tekstom? Bez tog odgovora spajanje je pogađanje.

### Korak 6 — ručni red
`sekcija-bez-akorda` (1.381), `kratak-tekst` (1.338), `nema-refren` (7.550).
Radi po dionicama (§3) da se sesije ne sudaraju. Kod `nema-refren` provjeri
prvo je li refren stvarno neoznačen ili pjesma nema refren — oboje postoji.

---

## 8. Šta se NE dira

- **Skreperi.** Povlače tuđe tekstove i transkripcije. Ne dorađuju se.
- **Tekstovi pjesama se ne izmišljaju.** Ako fali strofa, fali — to je
  pribavljanje sadržaja, ne čišćenje.
- **Baza se ne dira bez `--write`,** a `--write` na 14.000 redova je
  Mirnesova odluka, ne tvoja.
- **Ništa se ne stageuje i ne commituje.** Mirnes pregleda svaki diff u VS
  Code. Nikad `git add`, nikad commit, nikad `git push` bez izričitog „da".

---

## 9. Otvorena pitanja za Mirnesa

1. Pustiti `popravi --write` na 8.188 pjesama?
2. Pravilo za spajanje duplikata (1.164 grupe)?
3. Šta s 1.286 praznih — puniti ili skinuti s objave?
4. Obrisati 31 skriptu koju niko ne poziva, ili ih ostaviti zaključane?
