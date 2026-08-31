# KATALOG.md — poliranje Octava kataloga

Radna knjiga za svakog agenta koji nastavlja poliranje ~14.400 pjesama.
Zadnji prolaz: 2026-08-31. Svi brojevi su **izmjereni**, ne procijenjeni — ako
se ne slažu s onim što vidiš, pokreni `npm run katalog` i vjeruj njemu.

Vlasnik odluka je **Mirnes**. Šta se uvozi i briše je njegov poziv; kako se to
izvodi je tvoj.

---

## 1. Cilj — „identičan obrazac po svakoj pjesmi"

Svaka pjesma treba imati: tačnu notaciju (H sistem, povisilice na izlazu),
tačnu gramatiku, bez duplih razmaka, bez nizova crtica, bez tipfelera, bez
duplikata, potpun tekst koji se ne lomi, svoje sekcije (`[Strofa 1]`,
`[Refren]`), bez potpisa transkribenta, bez capo uputstva u tekstu (capo ide u
**polje**), i izvođače bez duplikata, gramatički tačne, u redu **Ime Prezime**.

---

## 2. Gdje smo

`npm run katalog` daje ovu tabelu uživo. Stanje nakon prolaza 2026-08-31:

**14.388 pjesama, 5.950 besprijekornih (41,4%).** Prije ovog prolaza bilo je
1.789 (12,4%).

| nalaz | broj | udio | popravlja |
|---|---|---|---|
| `nema-refren` | 7.548 | 52,5% | ručno |
| `kratak-tekst` | 1.364 | 9,5% | ručno |
| `prazna-pjesma` | 1.286 | 8,9% | ručno |
| `sekcija-bez-akorda` | 1.285 | 8,9% | ručno |
| `ponovljena-sekcija` | 102 | 0,7% | ručno |
| `capo-u-tekstu` | 32 | 0,2% | ostavljeno namjerno, §7 |
| `dupli-razmak` | 27 | 0,2% | rub |
| `potpis` | 20 | 0,1% | rub |
| `bez-sekcija` | 15 | 0,1% | ručno |
| `razmak-prije-znaka` | 1 | 0,0% | rub |

Objavljenih pjesama: **11.904**.

Izvođači, 2.813 ukupno:

| nalaz | broj |
|---|---|
| duplikat imena među živima | **0** |
| moguć obrnut red imena | 26 prijavljeno, **~4 tačna** |
| ime završava cifrom | 44 |
| **prave `feat.` saradnje** | **0** — ne postoje, §5.1 |

---

## 3. Kako se radi

Jedan ulaz. Ne biraj među 113 skripti u `scripts/`.

```bash
npm run katalog                     # izvještaj, ne mijenja ništa
npm run katalog:popravi             # mehaničke popravke, probni prolaz
npm run katalog:popravi -- --write  # primijeni
npm run katalog:ocjeni -- --write   # upiši ocjenu na svaku pjesmu
npm run katalog:provjeri            # sve putanje se razrješavaju
```

**Sve je probno dok ne dodaš `--write`.** To je cijeli sigurnosni model.

### Koja baza — OBAVEZNO PROVJERI

```bash
node scripts/katalog.js                    # lokalna (.env.dev / .env)
node scripts/katalog.js --atlas            # ATLAS, produkcija (.env.prod)
```

Svaka skripta ispisuje bazu u prvom redu. **Ako ne piše `ATLAS`, pišeš
lokalno.** Baze nisu iste i razišle su se.

**AI-TRAP: nikad `import 'dotenv/config'` u skripti.** Čita samo `.env`, pa
`--atlas` biva ignorisan i skripta tiho popravlja lokalni katalog dok ti
misliš da radiš na produkciji. Koristi `connect()` iz `lib/sweep.js`.

**Prije svakog `--write` na Atlas — backup:**

```bash
node scripts/maintenance/backup.js --atlas
```

Spisak konkretnih pjesama s jednim nalazom:

```bash
node scripts/maintenance/quality.js --list sekcija-bez-akorda --limit 40
```

Ostale, zasebne popravke:

```bash
node scripts/maintenance/doctor.js --write            # izvedena polja
node scripts/maintenance/popravi-oznake.js --write    # akord slijepljen s oznakom
node scripts/maintenance/skloni-nespremne.js --write  # prazne i siročad -> draft
```

### Paralelni rad — dionice

```bash
node scripts/katalog.js popravi --radnik 1/4
```

Četiri dionice su disjunktne i izmjereno ravnomjerne: 3597 | 3597 | 3597 |
3598, nula preklapanja, zbir tačno 14.389.

**AI-TRAP: ne dijeli „od vrha prema sredini" i „od sredine prema vrhu".** To je
ista polovina dvaput, s dva radnika koji se sudaraju na svakom zapisu.

**Za skripte paralelizam nije potreban** — cijeli prolaz traje ~600ms. Dionice
postoje za **agentski rad**, kad više sesija polira tekstove.

---

## 4. Šta je gdje

| fajl | uloga |
|---|---|
| `scripts/katalog.js` | jedini ulaz; sve naredbe |
| `scripts/lib/kvalitet.js` | 13 pravila, čista funkcija bez baze |
| `scripts/lib/sweep.js` | prolaz: kursor, `.lean()`, `bulkWrite`, vodomjer |
| `scripts/lib/dionica.js` | disjunktne dionice |
| `scripts/lib/potvrdi.js` | brava ispred skripti koje trajno brišu |
| `src/utils/tidyContent.js` | razmaci i crtice; **ne dira redove akorada** |
| `scripts/maintenance/doctor.js` | izvedena polja i brojači |
| `scripts/maintenance/popravi-oznake.js` | akord slijepljen s oznakom |
| `scripts/maintenance/skloni-nespremne.js` | prazne i siročad → draft |
| `scripts/maintenance/quality.js` | spisak pjesama po nalazu |

Novo pravilo ide **samo** u `scripts/lib/kvalitet.js`.

---

## 5. Zamke — izmjerene, ne pretpostavljene

**Ovo je najvažnija sekcija u dokumentu.** Tokom jednog jedinog prolaza kroz
katalog, **deset** mehaničkih pravila prijavilo je zdrave podatke kao
pokvarene. Svako je izgledalo očigledno tačno. Pravilo: **prvo uzorak, pa
tvrdnja.** Broj sam po sebi nije nalaz.

### 5.1 „X i Y" nisu saradnje nego imena bendova
Regex ` i ` prijavi 152 „saradnje". Pravih `feat.` saradnji: **0**. `ft.`: 0.
` x `: 0. Ono što hvata su bendovi — *Bajaga i Instruktori*, *Leb i Sol*,
*Goran Bare i Majke*, *Đura i Mornari*. Razdvajanje bi napravilo lažne izvođače
*Instruktori*, *Sol*, *Majke* i uništilo **211 imena**. Isto vrijedi za `&`:
*Darko Rundek & Cargo Orkestar*. **Saradnje se rješavaju bijelom listom.**

### 5.2 Ne spajaj izvođače po skinutim ciframa
Normalizacija koja skida cifru spoji *Grupa 777* s *Grupa 220*, i *357* s
*058*. Različiti bendovi.

### 5.3 Obrnut red imena se ne ispravlja automatski
Heuristika prijavi 26, tačna su ~4 (*Bešlić Halid*, *Balašević Đorđe*,
*Badrić Nina*, *Tadić Vlatko*). Ostalo su bendovi — *Kraljevski Apartman*,
*Beogradski Sindikat* — i **Eric Clapton**, kojeg heuristika smatra prezimenom.

### 5.4 `/capo|kapo/` hvata imenicu *kapa*
„kap**om**", „kap**one**", svaki padež. Prijavi 52, stvarno je 40. Koristi
granicu riječi. I: **capo se seli u polje, ne briše** — `[G]capo na [D]1. polju`
je stvarna informacija.

### 5.5 Dupli razmak u redu akorada je nosiv
`[Am]   [F]   [C]` — razmak drži akord iznad sloga. `tidyContent` preskače
redove koji su samo akordi. Ne uklanjaj tu provjeru.

### 5.6 Akord i oznaka sekcije imaju istu sintaksu
`[Strofa 2]` i `[Am]` su oboje zagrade. Testiraj protiv `CHORD` regexa iz
`kvalitet.js`.

### 5.7 Akorde traži BILO GDJE u strofi
Katalog je inline ChordPro: `ja [Am]sam`. Pravilo koje traži akord na početku
reda prijavi **85%** kataloga kao „bez akorada"; istina je 9%.

### 5.8 Ponovljen `[Refren]` je ispravan
Refren se pjeva dvaput. Pravilo koje prijavljuje svaku ponovljenu oznaku
osudilo je **3.717 ispravnih pjesama**. Broji samo ponovljene **numerisane**.

### 5.9 `[Prelaz / Solo]:` je ispravna oznaka
Pravilo za „akord slijepljen s oznakom" prijavilo je **3.564 pjesme**. Od toga
su **2.609 redova bili `[Prelaz / Solo]:`** — zdrava oznaka s dvotačkom, bez
ijednog akorda. Stvarni kvar je bio 600. Uzorkovanje je to uhvatilo; broj je
izgledao kao otkriće.

### 5.10 „izvor" je riječ iz pjesme, ne atribucija
Pravilo za potpise hvatalo je `izvor` i prijavilo 622 pjesme. *„kad na izvor ja
pođem"*, *„More je izvor života"* — to je tekst. Ni `by` nije bezopasan: postoji
pjesma **By pass**.

### 5.11 `\s` hvata i prelom reda
Pravilo `/\s+[,.!?;:]/` prijavilo je 896 pjesama nakon što je popravka već
prošla. Od 1.101 pogotka, **1.100 su bili prelomi reda**, a jedan pravi razmak.
Koristi `[ \t]`.

### 5.12 Agregacija ne pokreće soft-delete hook
**Ovo je zavaralo tri brojača odjednom.** `Model.aggregate()` ne primjenjuje
query middleware, pa broji i ono što je u kanti. Bez `$match: { deletedAt: null }`
doktor je prijavljivao **1.200 grupa duplikata** (živih: **0**), **228 istih
imena izvođača** (živih: **0**), i naduvane siročadi. U kanti je 1.721 pjesma i
295 izvođača. **Uvijek `$match` prvi.**

### 5.13 `select('arrangements.0.content')` ne radi
MongoDB **nema projekciju po indeksu niza** — vraća `[{}]`, bez greške. Skripta
onda vidi prazan tekst i zaključi da je sve ispravno. Koristi
`arrangements.content`. **`$set` po indeksu RADI** i ne dira ostale aranžmane.

### 5.14 Mongoose tiho odbacuje polja kojih nema u šemi
Ocjenjivač je pisao u `quality` prije nego je polje postojalo u `Song.js`.
Nema greške, nema upozorenja — prijavi 14.388 uspješnih upisa i ne promijeni
ništa. **Prvo deklariši polje.**

### 5.15 `searchName` zastari jer hook ne radi na `updateOne`
Pre-save hook računa `searchName` samo pri `save()`. Preimenovanja kroz
`updateOne`/`bulkWrite` ga zaobilaze, pa je 37 izvođača nosilo tuđe ime —
*Željko Samardžić* je imao `"zeljko samardzic test"`. **Ali ne preračunavaj
slijepo:** `Dušk'o Kuliš` ima `"dusko kulis"`, a slugify daje `"dusk o kulis"` —
apostrof cijepa riječ i to je **gore**. Preskoči imena s apostrofom.

### 5.16 Noćni kvadranti su pokrivali pola kataloga dvaput, a pola nikad
`quadrant_runner.js` je računao `skip = quadrantIndex * quadSize` **i istovremeno
obrtao sort po kvadrantu**. Kad skip broji od suprotnog kraja, Q1 i Q4 završe na
istim pjesmama, a Q2 i Q3 na istim. Izmjereno na 14.389 pjesama:

| kvadrant | pokrivao pozicije |
|---|---|
| Q1 (asc) | 1 – 3.598 |
| Q4 (desc) | 1 – 3.595 |
| Q2 (desc) | 7.194 – 10.791 |
| Q3 (asc) | 7.197 – 10.794 |

**7.190 pjesama (50%) nikad nije obrađeno**, a 7.190 dvaput, s dva demona koji
se sudaraju — svake noći. Popravljeno korištenjem `dionice()`: 3597 | 3597 |
3597 | 3598, zbir tačan, nula preklapanja.

**Pravilo: dijeli u JEDNOM fiksnom poretku, pa obilazi kojim smjerom hoćeš.**

### 5.17 `npm run katalog popravi` ne prosljeđuje riječ
npm traži `--` prije argumenata. Direktni oblik radi:
`node scripts/katalog.js popravi --write`.

---

## 6. Zaključane skripte

Tri skripte trajno brišu podatke i **niko ih ne poziva**. Traže
`OCTAVA_DOZVOLI_RUSENJE=DA`:

- `scripts/fixes/revert_all_to_original.js` — vraća kolekcije iz snimka
- `scripts/fixes/clean_revert_final.js` — briše kolekcije pa vraća backup
- `scripts/healers/heal_nonexistent_and_foreign_artists.js` — `deleteMany` koji
  zaobilazi kantu i modal `SIGURAN SAM`

Od 2026-08-31 zaključane su još dvije, i **izvađene iz noćnog rada**:

- `daemons/auto_deduplicator_daemon.js` — `Artist.deleteOne()`, tvrdo brisanje
  mimo kante. Njegov pojam duplikata je bio nepouzdan: većina „duplih"
  izvođača bio je jedan red sa zastarjelim `searchName` poslije preimenovanja
  (§5.15), a ne duplikat. Vjerovatno je brisao nedužne izvođače.
- `healers/lyrics_completer.js` — skidao tekstove s tekstovi.net,
  tekstomanija.com i genius.com svake noći. Da li katalog uzima tuđe tekstove
  je Mirnesova odluka, ne stvar koju demon rješava u tri ujutro.

Prve dvije su legitimne restore skripte — zato zaključane, ne obrisane.
**Ako ti se čini da ti treba jedna od njih, ne treba ti.** Pitaj Mirnesa.

U `scripts/` je **31 skripta koju niko ne poziva** i **19 s beskonačnom
petljom.** Ne pokreći ih po imenu. Ako ti treba nešto što `katalog.js` ne radi —
dodaj naredbu u `katalog.js`.

---

## 7. Šta je urađeno, i šta ostaje

### Urađeno na ATLASU (produkcija), 2026-08-31
Backup prije svega: `octava-2026-08-31T03-51-57.ejson.gz`, 26,4 MB.

| korak | učinak |
|---|---|
| mehaničke popravke | 4.196 pjesama (3.221 razmaci, 961 oznake, 552 potpisi) |
| `popravi-oznake` | 600 pjesama, 604 reda |
| `doctor` | brojači + 31 zastario `searchName` |
| `skloni-nespremne` | **1.030 pjesama s objave u draft** |
| `ocjeni` | svih 14.384 |

**Besprijekornih: 3.785 → 5.642 (26,3% → 39,2%).**
**Objavljenih: 13.537 → 12.507.**

Ostaje na Atlasu: **57 živih duplikat-grupa** (lokalno ih je 0) i 1.065 pjesama
koje dijele YouTube video. Oboje traži ručnu odluku.

### Urađeno lokalno, 2026-08-31 (backup: `octava-2026-08-31T05-27`)

| korak | učinak |
|---|---|
| `popravi --write` | 8.188 pjesama: razmaci, crtice, interpunkcija |
| prevod oznaka | 789 `[Chorus]`/`[Verse]` → `[Refren]`/`[Strofa]` |
| `popravi-oznake --write` | **600 pjesama**, 604 reda; provjereno: **0 akorada izgubljeno** |
| uklanjanje potpisa | 555 redova transkribenata (uklj. jednu tuđu e-mail adresu) |
| `doctor --write` | searchTitle 1.052, akordi 1.592, searchLyrics 4.497, tagovi 609, `searchName` 31 |
| `ocjeni --write` | ocjena na svih 14.388 |
| `skloni-nespremne --write` | 90 pjesama s objave u draft (11 praznih, 79 siročadi) |

**Besprijekornih: 1.789 → 5.950.**

### Ostaje

**Korak 1 — `sekcija-bez-akorda` (1.285) i `kratak-tekst` (1.364).**
Traži sadržaj, ne čišćenje. **Ne izmišljaj tekst ni akorde.** Radi po dionicama.

**Korak 2 — `nema-refren` (7.548).** Provjeri je li refren neoznačen ili pjesma
nema refren. Oboje postoji; ovo nije automatski popravljivo.

**Korak 3 — `prazna-pjesma` (1.286).** Naslov bez teksta. **1.275 je već u
draftu**, ne vide se javno; 11 objavljenih je sklonjeno. Odluka je Mirnesova:
napuniti ili obrisati.

**Korak 4 — `capo-u-tekstu` (32).** Namjerno neautomatizovano: uzorak pokazuje
da su pomiješani s pravim uputama za sviranje („svira samo ton B na bas žici,
8. prag"), pa bi automatsko uklanjanje pojelo stvarnu informaciju. Ručno, ili
uz parser koji seli u capo polje.

**Korak 5 — `ponovljena-sekcija` (102).** Prevod oznaka ih je otkrio: pjesme s
`Strofa 2 | Strofa 2 | Strofa 2`. Ponekad je namjerno ponavljanje, ponekad
pokvarena numeracija — mora se pogledati.

**Korak 6 — 1.061 pjesama dijeli YouTube video.** Ponekad ispravno (splet
uživo), ponekad pogrešno dodijeljen video. Ručno.

### Šta NE treba raditi

- **Duplikati pjesama: 0 živih grupa.** Onih 1.164/1.200 iz ranijih izvještaja
  bili su artefakt agregacije koja broji kantu (§5.12). Nema šta da se spaja.
- **Duplikati izvođača: 0 živih.** Nakon popravke `searchName` nijedna grupa
  nije ostala.

---

## 7b. Noćni rad (desktop)

```bash
npm run master        # 14 demona, cijelu noć — SVE NA LOKALNOJ BAZI
```

Nijedan noćni demon ne dodiruje Atlas. Svi čitaju `.env` i rade na lokalnom
katalogu desktopa.

**Prva noć poslije popravke kvadranata je posebna.** Do 2026-08-31 pola
kataloga nikad nije obrađeno (§5.16). Sada ide svih 14.389, pa prepisivač
gramatike i dijakritika prvi put dira ~7.190 pjesama odjednom. **Ne puštaj to
naslijepo** — pusti jedan kvadrant par minuta, prekini, pa uporedi:

```bash
node scripts/katalog.js > /tmp/prije.txt
node scripts/healers/healer_q1_top_down.js     # Ctrl+C poslije 2 min
node scripts/katalog.js > /tmp/poslije.txt
diff /tmp/prije.txt /tmp/poslije.txt
```

Dvije stvari su popravljene 2026-08-31 i moraju ostati takve:

1. **Kvadranti** — vidi §5.16. Prije popravke pola kataloga se nije diralo.
2. **`key_detector_healer.js`** traži `--daemon --write`; master mu ih sada
   prosljeđuje kroz `args`. Bez toga odradi jedan prazan prolaz i izađe.

**Baze:** `.env`/`.env.dev` gađaju lokalni Mongo, `.env.prod` gađa Atlas. Nisu
iste i razišle su se. Provjeri u koju pišeš prije `--write`.

---

## 8. Šta se ne dira

- **Skreperi.** Povlače tuđe tekstove i transkripcije. Ne dorađuju se.
- **Tekstovi se ne izmišljaju.** Ako fali strofa, fali.
- **Baza se ne dira bez `--write`,** a `--write` na 14.000 redova je Mirnesova
  odluka.
- **Backup prije svakog masovnog upisa.** `npm run backup`.
- **Ništa se ne stageuje i ne commituje.** Mirnes pregleda svaki diff u VS
  Code. Nikad `git add`, nikad commit, nikad `git push` bez izričitog „da".
