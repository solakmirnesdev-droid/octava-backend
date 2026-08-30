# Song Chords & Lyrics Extraction + Auto-Publish Rules

## 🎯 The 10 Inviolable Quality Pillars (Zlatni Standard Kvaliteta i Prevencija Regresija):

1. **100% Tačnost i potpunost teksta (100% Full Lyrical Accuracy Across All Stanzas)**:
   - Tekst mora biti 100% kompletan i identičan originalnom studijskom audio snimku (riječ po riječ, slog po slog).
   - **Strogo zabranjeno skraćivanje**: Zabranjene su oznake poput *"Ref. 2x"*, *"Posljednja dva refrena:"* ili izostavljanje druge/treće strofe.
   - **Puni tekst i akordi na SVAKOJ strofi**: Ako se pjesma sastoji od 3 strofe i 3 refrena, sve 3 strofe i sva 3 refrena moraju biti ispisani u punom tekstu, a akordi moraju biti postavljeni na **SVAKOJ** strofi i svakom refrenu bez izuzetka.

2. **100% Tačnost harmonije (Harmonic Accuracy)**:
   - Autentični studijski akordi, originalni tonalitet, prelazni bas tonovi, dominante i septakordi (npr. `F#7`, `D#7`, `A#7`, `G#m7`, `C#maj7`, `H7`).
   - Verifikovano kroz Audio DSP hromagram i teorijsku harmonijsku analizu.
   - Ukoliko postoji modulacija (npr. prelaz iz `Am` u `A#m`), akordi modulisanog dijela moraju biti raspisani u punoj dužini.

3. **100% Tačnost notacije (Notation Accuracy)**:
   - **Isključivo povisilice (`#`)** — snizilice (`b`) su strogo zabranjene (`Bb` $\rightarrow$ `A#`, `Eb` $\rightarrow$ `D#`, `Ab` $\rightarrow$ `G#`, `Db` $\rightarrow$ `C#`, `Gb` $\rightarrow$ `F#`, `Bm` $\rightarrow$ `A#m`, `B` $\rightarrow$ `A#` ili `H`).
   - Akordi su ugrađeni inline u uglastim zagradama `[Akord]` unutar riječi.

4. **100% Formatiranje prilagođeno Octava Dashboard & Mobile App Visual Editoru**:
   - Format mora biti čist i standardizovan kako bi ga `octava-dashboard` i `octava-app` automatski prepoznali, obojili u narandžaste bedževe (`REFREN`, `STROFA 2`, `INTRO`) i omogućili vizuelno prevlačenje (drag & drop):
     - Zaglavlja sekcija u zagradama: `[Intro / Uvod]:`, `[Strofa 1]`, `[Pred-refren]`, `[Refren]`, `[Prelaz / Solo]:`, `[Strofa 2]`, `[Outro / Finale]:`.
     - **Bez crtica i smeća**: Ukloniti sve crtice (`---`, `___`), tačkice (`...`) i suvišne razmake iz izvornih tabova.
     - Redovi sa akordima moraju biti ili inline unutar teksta `[Am]Tekst...` ili samostalni redovi `[Am] [G] [F]` (za uvod, solo, outro).

5. **100% Tačna pozicija okinanja akorda (Micro-Rhythmic Chord Syllable Positioning)**:
   - **Akord se postavlja TAČNO na slogu / vokalu gdje se okida na gitari ili u ritmu (na '1' ili sinkopi)**.
   - Nema proizvoljnog pomjeranja akorda na početak riječi ako se promjena dešava na drugom ili trećem slogu (npr. `po[A#m]kla[F#]paju`).

6. **Zabranjen Caps Lock (Anti-Caps Lock Title & Lyrics Normalization)**:
   - **Nijedan naslov niti tekst ne smije biti ispisan velikim slovima (ALL CAPS)**.
   - Svi naslovi se formatiraju u Title/Sentence Case (npr. `Rekla si mi da ne voliš zimu`, `Noćna dama`, `Lipe cvatu`).
   - Tekst pjesme se formatira sa velikim početnim slovom svakog stiha, a ostatak malim slovima.

7. **100% Gramatička i pravopisna tačnost + kvačice (`ć, č, š, đ, ž, dž`)**:
   - **Odvojeno pisanje negacije uz glagole**: `ne znam` (a ne `neznam`), `ne mogu` (a ne `nemogu`), `ne želim`, `ne volim`, `ne daš`, `ne vidiš`, `ne čujem`, `ne brini`, `ne smiješ`, `ne dam` (izuzeci: `neću`, `nemam`, `nemoj`, `nisam`).
   - **Odvojeno pisanje rječce 'li' i predloga**: `da li` (a ne `dali`), `je l'` (a ne `jel`), `sa mnom` (a ne `samnom`), `u inat` (a ne `u inad`), `s tobom` (bez nepotrebnog apostrofa `s' tobom`).
   - **Pravilno pisanje futura I glagola na -ći**: `reći ću` (a ne `recicu`), `doći ću`, `naći ću`, `poći ću`, `otići ću`.
   - **Autentične Ex-Yu kvačice**: Primjenjuju se u nazivima izvođača, naslovima i stihovima (`Saša Kovačević`, `Halid Bešlić`, `Đorđe Balašević`, `Šešir profesora Koste Vujića`, `noćna`, `čuvam`, `život`, `duša`, `ruža`, `sreća`, `pamtiću`, `sjećaš`, `priča`, `oči`, `čaša`...).

8. **Strogo zabranjeni sufiksi i Capo/Tuning oznake (Zero (COVER), (obrada), Capo 1st)**:
   - **Strogo je zabranjeno da u naslovu piše `(COVER)`, `COVER`, `(cover)`, `(obrada)`, `(remix)`, `(live)`, `(uzivo)`, `(official)`, `(unofficial)`, `(original)`, `(ispravno)`, `(akordi)`, `(tabovi)`, `(matrica)`, `(karaoke)`**.
   - **Strogo je zabranjeno da u tekstu pjesme piše `Capo 1st`, `Capo 2nd`, `Capo 3`, `Kapodaster 1`, `Tuning: Standard`, `Štim: Standard`**. Svi ovakvi redovi se automatski uklanjaju.
   - Naziv mora biti isključivo **čisto, zvanično studijsko ime pjesme**.

9. **Automatsko prepisivanje Dummy / Lorem Ipsum podataka (Dummy Overwrite Rule)**:
   - Sve pjesme u bazi koje sadrže `Lorem Ipsum`, `dolor sit amet`, `consectetur`, `mollit anim`, `ut labore` ili `"Tekst još uvijek nije ažuriran"` su privremeni **dummy/placeholder podaci**.
   - Čim se pronađe ili uveze verzija sa **pravim tekstom i akordima**, stvarni podaci **UVIJEK I OBAVEZNO PREPISUJU I ZAMJENJUJU** dummy/Lorem Ipsum sadržaj.

10. **Stroga deduplikacija izvođača i pjesama + Continuous Regression Healer**:
    - **NEMA DUPLIH PJEVAČA**: Varijacije izvođača se automatski spajaju u jednog kanonskog izvođača sa kvačicama.
    - **NEMA DUPLIH PJESAMA**: Za svakog izvođača dozvoljen je samo **jedan autoritativni zapis po pjesmi**.
    - Paralelno radi `continuous_quality_healer.js` daemon koji u pozadini neprekidno skenira bazu i automatski ispravlja sve regresije.

---

## 🔄 Automatizovani proces rada (Workflow):

### A. Ulaz: YouTube URL (jedan ili više)
1. **Audio DSP analiza**: `verify_audio_chords.py` (tonalitet, tempo, timeline).
2. **Harmonizacija**: Pozicioniranje na slogove uz puni tekst.
3. **Quality Gate Pass**: Validacija i auto-fix kroz `song_quality_gate.js`.
4. **Publish kroz Dashboard API**: `Song.save()`, `AuditLog.record()`.
5. **Trajna memorija**: `added-songs.json` i `CATALOG.md`.

### B. Ulaz: Screenshot / Slika teksta i akorada
1. **Obrada slike i konverzija**: Ekstrakcija teksta i akorada.
2. **Dopuna punog teksta i harmonije**: Repliciranje na sve strofe.
3. **Quality Gate Pass**: Validacija kroz `song_quality_gate.js`.
4. **Publish kroz Dashboard API** i upis u memoriju.

### C. Web Scraping & Ingestion (Pesmarica.rs / TacnaHarmonija.rs)
1. **Pre-Publish Quality Gate**: Svaka skrapovana pjesma prolazi kroz `applyQualityGate()` i `cleanOfficialTitle()`.
2. **Pravilo prioriteta i zamjene**: Pjesme sa `tacnaharmonija.rs` automatski prepisuju duplikate sa većom tačnošću.
3. **Pravilo prepisivanja Dummy podataka**: Autentične pjesme automatski prepisuju i zamjenjuju sve dummy / Lorem Ipsum placeholder zapise.
4. **Gramatička i pravopisna korekcija**: Automatsko ispravljanje negacija, predloga, futura i kvačica u letu.
5. **Čišćenje Capo i Tuning oznaka**: Uklanjanje `Capo 1st`, `Kapodaster`, `Tuning` iz teksta pjesme.
6. **Dashboard objavljivanje & Trajna memorija**: Evidentiranje u `AuditLog`, `added-songs.json` i `CATALOG.md`.
