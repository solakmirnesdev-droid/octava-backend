---
name: song-chords
description: >-
  Fully automated workflow triggered by any YouTube URL(s), uploaded screenshot/image of lyrics & chords, OR web scraping from pesmarica.rs / tacnaharmonija.rs. Incorporates a mandatory Pre-Publish Quality Gate Layer: scans for full text across all verses, automatically unrolls abbreviated refrains, projects/replicates chord progressions onto unharmonized stanzas, enforces 100% sharp (#) notation and slash-chord bassline standardization (G/B -> G/H), standardizes section headers [Strofa 1], [Refren], [Solo], [Outro] for Octava Dashboard visual editor, auto-encloses standalone Intro/Solo/Outro chords in brackets [Am] [G] [F] [E], eliminates ghost/empty section headers, eliminates all ALL-CAPS text (Anti-Caps Lock), auto-corrects grammatical mistakes (negation of verbs, clitics, futur I, prepositions) and restores authentic Ex-Yu diacritics (ć, č, š, đ, ž), strictly strips all suffixes/prefixes (COVER, obrada, remix, live, unofficial, original, ispravno, akordi, tabovi), strips all Capo / tuning annotations (Capo 1st, Kapodaster, Tuning), strips uploaders' watermarks/initials (e.g. Made by...), automatically overwrites all dummy / Lorem Ipsum and 0-chord placeholder data with real studio lyrics & chords (Grey Bar Eliminator), unpublishes non-Balkan / foreign music (status: 'draft', never deleted), normalizes duets/featuring artists to primary canonical artist, enforces strict artist and song deduplication (merges duplicate artists and duplicate songs), publishes through the octava-dashboard API/controller pipeline (never raw DB), maintains persistent memory in added-songs.json and CATALOG.md, and runs a continuous parallel regression healer daemon.
---

# Song Chords & Lyrics Extraction, DSP Audio Verification, Dashboard Publishing & Continuous Regression Healing Guide

## 🎯 The 10 Inviolable Quality Pillars (Zlatni Standard Kvaliteta i Prevencija Regresija)

1. **100% Tačnost i potpunost teksta (100% Full Lyrical Accuracy Across All Stanzas)**:
   - Tekst mora biti 100% kompletan i identičan originalnom studijskom audio snimku (riječ po riječ, slog po slog).
   - **Strogo zabranjeno skraćivanje**: Zabranjene su oznake poput *"Ref. 2x"*, *"Posljednja dva refrena:"* ili izostavljanje druge/treće strofe.
   - **Puni tekst i akordi na SVAKOJ strofi**: Ako se pjesma sastoji od 3 strofe i 3 refrena, sve 3 strofe i sva 3 refrena moraju biti ispisani u punom tekstu, a akordi moraju biti postavljeni na **SVAKOJ** strofi i svakom refrenu bez izuzetka.

2. **100% Tačnost harmonije i Slash akorada (Harmonic & Bassline Accuracy)**:
   - Autentični studijski akordi, originalni tonalitet, prelazni bas tonovi, dominante i septakordi (npr. `F#7`, `D#7`, `A#7`, `G#m7`, `C#maj7`, `H7`).
   - **Slash akordi & Bas linije**: Standardizovano vođenje bas tonova u Ex-Yu notaciji (`G/B` $\rightarrow$ `G/H`, `Am/Bb` $\rightarrow$ `Am/A#`, `D/F#`, `C/G#`).
   - Verifikovano kroz Audio DSP hromagram i teorijsku harmonijsku analizu.
   - Ukoliko postoji modulacija (npr. prelaz iz `Am` u `A#m`), akordi modulisanog dijela moraju biti raspisani u punoj dužini.

3. **100% Tačnost notacije (Notation Accuracy)**:
   - **Isključivo povisilice (`#`)** — snizilice (`b`) su strogo zabranjene (`Bb` $\rightarrow$ `A#`, `Eb` $\rightarrow$ `D#`, `Ab` $\rightarrow$ `G#`, `Db` $\rightarrow$ `C#`, `Gb` $\rightarrow$ `F#`, `Bm` $\rightarrow$ `A#m`, `B` $\rightarrow$ `A#` ili `H`).
   - Akordi su ugrađeni inline u uglastim zagradama `[Akord]` unutar riječi.
   - **Auto-Enclose Intro, Solo i Outro akorada**: Samostalni nizovi akorada ispod `[Intro / Uvod]:`, `[Prelaz / Solo]:` i `[Outro / Finale]:` (npr. `Am - G - F - E` ili `| Am | G | F | E |`) se automatski enkodiraju u uglaste zagrade: `[Am] [G] [F] [E]`.

4. **100% Formatiranje prilagođeno Octava Dashboard & Mobile App Visual Editoru**:
   - Format mora biti čist i standardizovan kako bi ga `octava-dashboard` i `octava-app` automatski prepoznali, obojili u narandžaste bedževe (`REFREN`, `STROFA 2`, `INTRO`) i omogućili vizuelno prevlačenje (drag & drop):
     - Zaglavlja sekcija u zagradama: `[Intro / Uvod]:`, `[Strofa 1]`, `[Pred-refren]`, `[Refren]`, `[Prelaz / Solo]:`, `[Strofa 2]`, `[Outro / Finale]:`.
     - **Bez "duh" sekcija**: Automatsko brisanje praznih zaglavlja bez stihova/akorada ispod njih (`Ghost Sections Cleanup`).
     - **Bez crtica i smeća**: Ukloniti sve crtice (`---`, `___`), tačkice (`...`) i suvišne razmake iz izvornih tabova.

5. **100% Tačna pozicija okinanja akorda (Micro-Rhythmic Chord Syllable Positioning)**:
   - **Akord se postavlja TAČNO na slogu / vokalu gdje se okida na gitari ili u ritmu (na '1' ili sinkopi)**.
   - Nema proizvoljnog pomjeranja akorda na početak riječi ako se promjena dešava na drugom ili trećem slogu (npr. `po[A#m]kla[F#]paju`).

6. **Zabranjen Caps Lock (Anti-Caps Lock Title & Lyrics Normalization)**:
   - **Nijedan naslov niti tekst ne smije biti ispisan velikim slovima (ALL CAPS)**.
   - Svi naslovi se formatiraju u Title/Sentence Case (npr. `Rekla si mi da ne voliš zimu`, `Noćna dama`, `Lipe cvatu`).
   - Tekst pjesme se formatira sa velikim početnim slovom svakog stiha, a ostatak malim slovima.

7. **100% Gramatička i pravopisna tačnost + kvačice (`ć, č, š, đ, ž, dž`)**:
   - **Odvojeno pisanje negacije uz glagole**: `ne znam` (a ne `neznam`), `ne mogu` (a ne `nemogu`), `ne želim`, `ne volim`, `ne daš`, `ne vidiš`, `ne čujem`, `ne brini`, `ne smiješ`, `ne dam` (izuzeci: `neću`, `nemam`, `nemoj`, `nisam`).
   - **Odvojeno pisanje rječce 'li' i predloga**: `da li` (a ne `dali`), `je l'` (a ne `jel`), `sa mnom` (a ne `samnom`), `u inat` (a ne `u inad`), `s tobom` (bez nepotrebnog apostrofa `s' tobom`), `ispočetka` (a ne `iz pocetka`).
   - **Pravilno pisanje futura I glagola na -ći**: `reći ću` (a ne `recicu`), `doći ću`, `naći ću`, `poći ću`, `otići ću`.
   - **Autentične Ex-Yu kvačice**: Primjenjuju se u nazivima izvođača, naslovima i stihovima (`Saša Kovačević`, `Halid Bešlić`, `Đorđe Balašević`, `Šešir profesora Koste Vujića`, `Počnimo ljubav ispočetka`, `Beti Đorđević`, `noćna`, `čuvam`, `život`, `duša`, `ruža`, `sreća`, `pamtiću`, `sjećaš`, `priča`, `oči`, `čaša`...).

8. **Strogo zabranjeni sufiksi, Capo/Tuning oznake i skidanje strane muzike sa objave**:
   - **Strogo je zabranjeno da u naslovu piše `(COVER)`, `COVER`, `(cover)`, `(obrada)`, `(remix)`, `(live)`, `(uzivo)`, `(official)`, `(unofficial)`, `(original)`, `(ispravno)`, `(akordi)`, `(tabovi)`, `(matrica)`, `(karaoke)`**.
   - **Strogo je zabranjeno da u tekstu pjesme piše `Capo 1st`, `Capo 2nd`, `Capo 3`, `Kapodaster 1`, `Tuning: Standard`, `Štim: Standard`**. Svi ovakvi redovi se automatski uklanjaju.
   - **Skidanje strane/međunarodne muzike sa objave (Foreign Music Unpublish Policy)**: Sva strana (non-Balkan / English / international) muzika (npr. *Queen, Metallica, Guns N' Roses, Sting, Abba, Bryan Adams, Eric Clapton...*) se **automatski skida sa objave (`status: 'draft'`)**, a nikada se ne briše fizički (`deletedAt: null`). Octava javni katalog ostaje 100% čist balkanski katalog.

9. **Grey Bar Eliminator & Automatsko prepisivanje Dummy / Placeholder podataka**:
   - Pjesme sa placeholder tekstom (npr. `{Tekst i akordi još nisu upisani.}`, `{Tekst još uvijek nije ažuriran.}`, `Lorem Ipsum`, `dolor sit amet`) ili pjesme bez akorada (lyrics-only zapis) se **tretiraju kao 100% prazne instance** i **automatski se zamjenjuju i prepisuju** čim se pronađe harmonizovana verzija sa pravim studijskim akordima i tekstom.
   - U sortiranju deduplikacije, verzija sa pravim akordima i punim tekstom **UVIJEK POBJEĐUJE** i popunjava prazne placeholder zapise.

10. **Stroga deduplikacija izvođača (Duet Normalization) i pjesama + Continuous Healer**:
    - **Normalizacija dueta**: Pjesme sa `feat.`, `ft.`, `featuring` se vežu za primarnog kanonskog izvođača kako se ne bi gomilali dupli hibridni izvođači.
    - **NEMA DUPLIH PJEVAČA**: Varijacije izvođača se automatski spajaju u jednog kanonskog izvođača sa kvačicama.
    - **NEMA DUPLIH PJESAMA**: Za svakog izvođača dozvoljen je samo **jedan autoritativni zapis po pjesmi**.
    - Paralelno radi `continuous_quality_healer.js` daemon koji u pozadini neprekidno skenira bazu i automatski ispravlja sve regresije.

11. **Obavezna zaglavlja sekcija za SVAKU strofu i refren (Mandatory Section Labels)**:
    - **SVAKA pjesma MORA imati jasne oznake sekcija za svaki blok**: `[Intro / Uvod]:`, `[Strofa 1]`, `[Refren]`, `[Strofa 2]`, `[Refren]`, `[Prelaz / Solo]:`, `[Strofa 3]`, `[Outro / Finale]:`.
    - **Zabranjene su neoznačene ("gole") strofe**: Ako u izvornom tekstu stihovi stoje bez bedža, Auto-Section Segmenter ih automatski prepoznaje (analizom refrena i strofa) i ubacuje odgovarajući bedž (`[Strofa 1]`, `[Refren]`, `[Strofa 2]`, `[Refren]`).
    - Svaka strofa i refren se uredno odvajaju kako se stihovi ne bi stopili pod jednim bedžom, a multi-column layout bio 100% savršen.
    - ASCII bar/takt notacija (`|D|Em|C|G|`) i `X2` oznake se automatski pretvaraju u standardne akorde `[D] [Em] [C] [G]`.

12. **Stanza Harmonizer & Aggressive Refrain Unroller**:
    - Sve neharmonizovane strofe (`[Strofa 2]`, `[Strofa 3]`) automatski dobijaju akorde preslikane iz prve strofe liniju po liniju.
    - Svi skraćeni refreni (`Ref. 2x`, `Refren 2x`, `Ref:`) se automatski raspisuju u puni studijski tekst i akorde.

13. **Line-Wrap Auto-Stitcher (Spajanje slomljenih stihova)**:
    - Ako red sadrži samo 1–2 riječi (bez akorda ili sa jednim završnim akordom) i logički se nastavlja na prethodni red (npr. prelomljeno u uskom tabu), algoritam ga automatski spaja u jedan cjelovit stih kako bi multi-column i mobilni layout izgledali savršeno.

14. **Modulation & Key Change Handler**:
    - Oznake poput `Modulacija za 1/2 tona`, `[Mod]`, `Key Change:`, `Prelaz u Fm:` se automatski pretvaraju u standardizovani bedž `[Modulacija / Key Change]:` ili `[Refren (+1)]:`.

15. **Parenthesis & Passing Chords Normalizer**:
    - Čisti ugniježđene i opcione akorde: `[Am(G)]` $\rightarrow$ `[Am] [G]`, `[(Em)]` $\rightarrow$ `[Em]`, a bas prelaze standardizuje na `G/H`.

16. **Anti-Troll & Uploader Comments Sanitizer**:
    - Čisti sve in-line komentare i upute koje nisu stihovi ili akordi (npr. *(ovde ide harmonika)*, *(tiše)*, *(nisam siguran za akord)*, *(oprez na ritam)*).

17. **Minimum Song Completeness Validator**:
    - Pjesme koje imaju manje od 6 stihova i nemaju refren (isječci/snippet) se automatski drže u `status: 'draft'` dok se ne pribavi kompletan studijski tekst.

18. **Genre Auto-Tagging & Smart Classification**:
    - Na osnovu kanonskog registra izvođača i naslova, pjesmama se automatski dodjeljuju tačni žanrovski bedževi (`Domaća`, `Ex-Yu`, `Narodna`, `Folk`, `Rock`, `Pop`, `Zabavna`, `Sevdalinka`, `Starogradska`, `Hip hop`).

19. **Harmonic Key Auto-Detector & Key Sanity Validator**:
    - Analizira harmonijsku progresiju, toniku, dominantu i krug kvinti unutar akorada pjesme i automatski detektuje i upisuje tačan `originalKey` (`Am`, `Em`, `Gm`, `Dm`, `C`, `G`, `D`...) čak i kada je u izvoru bio prazan ili pogrešan (`ADm` $\rightarrow$ `Dm`).

20. **Auto-Difficulty Estimator**:
    - Automatski računa težinu pjesme (`easy`, `medium`, `hard`):
      - `easy`: samo otvoreni akordi bez barre hvata (`Am, C, D, Em, G, E, A, Dm`).
      - `medium`: standardni barre akordi (`F, Hm, F#m, B, C#m, Gm`).
      - `hard`: prošireni, jazz i umanjeni akordi (`dim, aug, maj7, m7b5, 9, 11, 13`, slash akordi).

21. **Duet & Featuring Normalizer**:
    - Automatski prepoznaje duete i gostovanja (*"Halid Bešlić i Danijela Martinović"*, *"Aca Lukas ft. Ivana Selakov"*), postavlja primarnog izvođača na kanonsko ime, a gostujuće izvođače upisuje u `tags` niz radi filtriranja i pretrage.

22. **Chord Notation Standardizer & Slash-Bass Sanitizer**:
    - Standardizuje nestandardne akorde sa foruma (`Hsus`, `Hsus4`, `Cadd9`, `F#m7-5` $\rightarrow$ `F#m7b5`) i bas linije (`G/B` $\rightarrow$ `G/H`, `Am/F#`).

23. **Orphan & Double-Chorus Collapser**:
    - Automatski spaja uzastopna dupla zaglavlja (`[Refren]` odmah iza `[Refren]`) i uklanja prazna "ghost" zaglavlja.

24. **Scraper Priority Queue Feeder**:
    - Healer automatski generiše i ažurira `data/scraper_priority_queue.json` sa listom svih pjesama koje imaju `Lorem Ipsum` ili 0 akorada, omogućavajući crawleru da ciljano harmonizuje te pjesme.

25. **Canonical SEO Slug Sanitizer**:
    - Automatski čisti i normalizuje slugove pjesama, uklanja duple crtice (`--`) i sufikse (`-2`), obezbjeđujući čiste URL-ove.

26. **Mandatory Artist Portrait Policy (.webp <= 20 KB)**:
    - Svi izvođači (pjevači i bendovi) moraju imati autentičnu portretnu sliku.
    - Slika **mora biti u `.webp` formatu** i veličina **ne smije prelaziti 20 KB** (strogi limit `imageBytes <= 20480`).
    - Slike se automatski preuzimaju iz zvaničnih izvora (Deezer / Wikipedia Commons / Discogs), kropuju na 300x300 portret, kompresuju u WebP i čuvaju direktno u bazi (`Artist.image`, `imageType: 'image/webp'`).

27. **Zero-Cyrillic & Chord Homoglyph Elimination Policy**:
    - Ćirilica je **strogo zabranjena** u čitavoj bazi. Sva ćirilična slova se automatski transliteriraju u latinicu sa punim kvačicama (`č, ć, đ, š, ž`).
    - **Homoglyph Sanitizer:** Skener automatski detektuje i čisti sve ćirilične homoglifične akorde u prave latinične (`[С]` $\rightarrow$ `[C]`, `[В]` $\rightarrow$ `[B]`, `[Н]` $\rightarrow$ `[H]`, `[А]` $\rightarrow$ `[A]`, `[Е]` $\rightarrow$ `[E]`, `[Д]` $\rightarrow$ `[D]`, `[Г]` $\rightarrow$ `[G]`, `[Ф]` $\rightarrow$ `[F]`) kako transpozicija na mobilnoj aplikaciji nikada ne bi pukla.

28. **Sentence & Verse Punctuation Standardization**:
    - Svaki stih / rečenica koja se završava bez interpunkcije dobija urednu tačku (`.`) na kraju, dok se akordne zagrade `[Am]` i sekcijski bedževi `[Refren]` štite od oštećenja.

29. **Syllabic Chord Snapping Policy (Poravnanje akorda na slog/samoglasnik)**:
    - Ako je akord ubačen unutar suglasničkog skupa na početku riječi (npr. `D[Am]otak'o`, `k[C]ad`, `st[G]vore`, `sv[E]e`), algoritam automatski pomjera akord na **početak riječi** (`[Am]Dotak'o`, `[C]kad`, `[G]stvore`, `[E]sve`).
    - Sprečava lomljenje riječi i omogućava 100% prirodno pjevanje i sviranje na mobilnim i desktop ekranima.

30. **Crawler Raw Artifacts & Forum Chatter Scrubber Policy**:
    - **Čišćenje forumaških komentara:** Automatski uklanja sve pozdrave i komentare uploadera (*"Pozdrav muzičarima..."*, *"skidao sam po sluhu..."*, *"ocenite sa 5 zvezdica..."*, *"pišite u inbox/mail..."*).
    - **Mojibake & BBCode popravka:** Čisti forumaške BBCode tagove (`[b]`, `[i]`, `[u]`) i ispravlja oštećena slova iz 2000-ih (`ÄŤ` $\rightarrow$ `č`, `Ä‡` $\rightarrow$ `ć`, `Åˇ` $\rightarrow$ `š`, `Ä‘` $\rightarrow$ `đ`, `Ĺľ` $\rightarrow$ `ž`).
    - **Odmotavanje multiplikatora i zvjezdica:** Odmotava akordne multiplikatore (`[Am] [Dm] x2` $\rightarrow$ `[Am] [Dm] [Am] [Dm]`), uklanja ritmičke zvjezdice (`[Am]***` $\rightarrow$ `[Am]`) i eliminiše ASCII razdjelne linije (`--------`, `========`).

31. **Accidental Shift-Caps & CamelCase Stutter Eliminator (`PLavusa` $\rightarrow$ `Plavuša`)**:
    - Automatski ispravlja duple kapitale nastale greškom pri držanju Shift tastera (`PLavusa` $\rightarrow$ `Plavuša`, `CRvena` $\rightarrow$ `Crvena`, `PRevarena` $\rightarrow$ `Prevarena`).
    - Uklanja slučajna velika slova unutar riječi (`žIvot` $\rightarrow$ `život`, `sVoj` $\rightarrow$ `svoj`, `sIn` $\rightarrow$ `sin`).
    - Vraća autentične kvačice u naslovima i tekstu (`Plavusa` $\rightarrow$ `Plavuša`, `Plavuso` $\rightarrow$ `Plavušo`, `Kico` $\rightarrow$ `Kićo`).

32. **Forum Metadata Scrubber & Auto-Reindexing Policy**:
    - Automatski uklanja sve forumaške linije sa metapodacima iz teksta pjesme (`Izvodjac: ...`, `Pesma: ...`, `Godina: ...`, `Album: ...`, `YT: http://...`, `YouTube: https://...`, `Po zelji: ...`, `Transkripcija: ...`).
    - **Uklanjanje praznih "ghost" sekcija i reindeksiranje:** Ako uklanjanje metapodataka ostavi praznu sekciju `[Strofa 1]`, ona se automatski uklanja, a preostale strofe se reindeksiraju redom (`[Strofa 1]`, `[Strofa 2]`, `[Strofa 3]`).

33. **Cross-Origin WebP Delivery & Graceful UI Fallback Policy**:
    - Backend obavezno servira slike sa `Cross-Origin-Resource-Policy: cross-origin` i `Access-Control-Allow-Origin: *` zaglavljima, omogućavajući Vite dashboardu, mobilnim klijentima i web aplikaciji prikazivanje slika bez CORP blokade pregledača.
    - Dashboard implementira `@error` fallback na inicijale (`avatarStyle(a.name)`), osiguravajući da se slomljena ikonica slike nikada ne prikaže na korisničkom interfejsu.

34. **Full Lyrics Completer & Zero-`x2` Pure Repetition Policy**:
    - **Puni tekst bez skraćenica:** Tekst svake pjesme mora biti 100% kompletan sa svim strofama i refrenima.
    - **Strogo zabranjeno `(2x)`, `x2`, `2x`:** Sve oznake ponavljanja na nivou stiha (`[Am]Stih (2x)` $\rightarrow$ duplira stih u 2 puna reda) ili strofe (`[Refren (2x)]` $\rightarrow$ duplira čitav refren sa svim akordima) se odmotavaju u stvarne stihove.
    - **Upoređivanje i harmonizacija:** Skener i `scripts/lyrics_completer.js` upoređuju pjesme sa studijskim bazama (Genius, Tekstomanija, Tekstovi.net) i automatski projektuju harmonijsku progresiju na sve nedostajuće strofe.

35. **Ghost Bracket & Stray URL Annihilator Policy**:
    - Automatski briše prazne uglaste zagrade `[]`, sanira višestruke uglaste zagrade `[[Am]]` $\rightarrow$ `[Am]`, i uklanja sve zalutale linkove (`http://`, `https://`, `www.pesmarica.rs`, `2akordi.net`), domene i email adrese ostavljene unutar stihova.

36. **Section Spacing Compressor (Max 1 Blank Line)**:
    - Standardizuje razmake između sekcija — automatski sažima 3+ uzastopne prazne linije na tačno 1 prazan red između strofa i refrena.

37. **Crawler Exponential Backoff & Crash Immunity**:
    - Svi mrežni i scraping pozivi imaju automatski `try/catch` mehanizam i pauzu od 3–5 sekundi pri HTTP 429/503 odgovorima, garantujući stabilan rad tokom noći bez pucanja procesa.

38. **Strict Artist Title Case Capitalization Policy (`Firstname Lastname`)**:
    - Imena svih izvođača moraju strogo počinjati velikim početnim slovom za svaku pojedinačnu riječ (npr. `Mirnes Solak`, a ne `mirnes solak` ili `Mirnes solak`).
    - Automatski formatira i pretvara forumaški format `Prezime, Ime` $\rightarrow$ `Ime Prezime` (`Solak, Mirnes` $\rightarrow$ `Mirnes Solak`).
    - Vraća autentične kvačice (`Šaban Šaulić`, `Đorđe Balašević`, `Željko Samardžić`, `Petar Grašo`, `Mejaši`, `Usnija Redžepova`).
    - Spaja sve varijacije i duplikate malih/velikih slova pod jedinstvenog kanonskog izvođača.

39. **Mandatory Artist Country & Origin Policy (`country: ISO 3166-1 alpha-2`)**:
    - Svaki izvođač u bazi obavezno dobija dvoslovnu ISO 3166-1 alpha-2 oznaku svoje matične države:
      - `BA` 🇧🇦: Bosna i Hercegovina (Dino Merlin, Halid Bešlić, Hari Mata Hari, Bijelo Dugme, Plavi Orkestar, Crvena Jabuka, Indexi, Zdravko Čolić, Kemal Monteno...)
      - `RS` 🇷🇸: Srbija (Toma Zdravković, Šaban Šaulić, Riblja Čorba, Miroslav Ilić, Lepa Brena, Aca Lukas, Bajaga, Saša Matić, Đorđe Balašević...)
      - `HR` 🇭🇷: Hrvatska (Oliver Dragojević, Gibonni, Mišo Kovač, Petar Grašo, Parni Valjak, Prljavo Kazalište, Severina, Tony Cetinski, Magazin...)
      - `ME` 🇲🇪: Crna Gora (Sergej Ćetković, Vlado Georgiev, Boban Rajović, Šako Polumenta, Dado Polumenta, Daniel Popović, Knez, Rambo Amadeus...)
      - `MK` 🇲🇰: Severna Makedonija (Toše Proeski, Vlatko Stefanovski, Leb i Sol, Kaliopi, Tijana Dapčević, Esma Redžepova...)
      - `SI` 🇸🇮: Slovenija (Vlado Kreslin, Magnifico, Siddharta, Laibach, Zoran Predin, Lačni Franz, Joker Out...)
      - `SE` 🇸🇪: Švedska (Ace of Base, ABBA, Roxette...)
    - Country Engine automatski prepoznaje državu iz baze znanja, porijekla grada ili Wikipedia extract API-ja (`scripts/detect_artist_country.js` & `scripts/artist_country_enricher.js`).

40. **Strict Canonical Artist Matching & Annotation Scrubber (`Anti-Parentheses / Anti-Duplicate Policy`)**:
    - Strogo zabranjene forumaške zagrade i anotacije u imenima izvođača:
      - `(peklenska) Pomaranca` $\rightarrow$ **`Pomaranča`**
      - `Riblja Corba(rajko Kojić)` $\rightarrow$ **`Riblja Čorba`**
      - `Šaban Šaulić (m)` $\rightarrow$ **`Šaban Šaulić`**
      - `Goran Karan [live]` $\rightarrow$ **`Goran Karan`**
      - `Bijelo Dugme (Bregović)` $\rightarrow$ **`Bijelo Dugme`**
    - `Artist.findOrCreateByName` provjerava i `name`, `searchName` i `slug` — ako izvođač već postoji u bazi, **nikada ne kreira duplikat**, već automatski povezuje pjesmu sa postojećim kanonskim izvođačem.

41. **Zero-Collision Chord Staggering & Spacing Policy**:
    - **Backend Sanitization Gate (`cleanOverlappingAndDuplicateChords`)**:
      - Uklanja duple uzastopne akorde: `[G#m][G#m]` $\rightarrow$ `[G#m]`.
      - Automatski razmiče različite uzastopne akorde: `[Am][G]` $\rightarrow$ `[Am] [G]`.
      - Sprječava gomilanje akorda na istom slogu riječi: `[Am][E]Riječ` $\rightarrow$ `[Am] [E]Riječ`.
    - **Frontend Visual Editor Anti-Collision Staggering (`ChordLineEditor.vue`)**:
      - `getChordChipStyle` dinamički računa položaje akorda na liniji i osigurava minimalnu horizontalnu distancu (`minChipWidth + 4px`) između susjednih bedževa, sprječavajući fizičko preklapanje bedževa na ekranu.

42. **Universal Parenthesis & Suffix Noise Purge (`Anti-Bracket / Anti-Version Suffix Policy`)**:
    - `cleanOfficialTitle` automatski uklanja sve zagrade na kraju naslova:
      - `Skitnik(moja verzija)` $\rightarrow$ **`Skitnik`**
      - `Kopriva (verzija 2, ispravka)` $\rightarrow$ **`Kopriva`**
      - `Poslednji dani (puna verzija)` $\rightarrow$ **`Poslednji dani`**
      - `Bacila je sve niz rijeku (Nitro)` $\rightarrow$ **`Bacila je sve niz rijeku`**
    - Uklanja samostalne forumaške oznake: ` solo`, ` uvod`, ` intro`, ` outro`, ` forspil`, ` akordi`, ` tabovi`, ` uživo`...
    - Automatski ispravlja tipfelere u naslovima (`Bstra voda` $\rightarrow$ `Bistra voda`).

43. **Autonomous YouTube Studio Audio/Video Matcher**:
    - `scripts/youtube_matcher_daemon.js` automatski pretražuje i povezuje zvanične studio audio/video snimke (`youtubeId`) za svaku pjesmu u bazi, omogućavajući reprodukciju originalne numere u uglu ekrana tokom sviranja.

44. **Smart Phonetic & Fuzzy Search with Diacritic/Compound Word Folding**:
    - Algoritam u `src/utils/fuzzy.js` podržava kucanje bez kvačica (`saban saulic` $\rightarrow$ `Šaban Šaulić`), spojene riječi (`bjelodugme` $\rightarrow$ `Bijelo Dugme`, `ribljacorba` $\rightarrow$ `Riblja Čorba`) i tipfelere (`dino merln` $\rightarrow$ `Dino Merlin`).

45. **Overnight Master Supervisor & Automated Rolling Backup Daemon**:
    - `scripts/start_overnight_master.js` paralelno nadgleda 9 specijalizovanih servisa sa 3-sekundnim auto-restartom pri grešci.
    - `scripts/auto_backup_daemon.js` automatski kreira kompletan JSON snapshot baze svaka 2 sata u `backups/`.

46. **Inverted Song-Artist Auto-Rectification Policy (`Anti-Inversion Policy`)**:
    - Ako forumaški unos zamijeni mjesta izvođaču i pjesmi (npr. naslov pjesme je `S. isović (ii verzija)`, a izvođač `Zvijezda Tjera Mjeseca`):
      - Ingestion Gate i Healer automatski prepoznaju skraćenog ili stvarnog izvođača (`S. isović` $\rightarrow$ **`Safet Isović`**, `N. fosili` $\rightarrow$ **`Novi Fosili`**, `P.orkestar` $\rightarrow$ **`Plavi Orkestar`**).
      - Zamjenjuju polja: Izvođač postaje **`Safet Isović`**, a naslov pjesme **`Zvijezda tjera mjeseca`**.
      - Automatski brišu lažnog/praznog "izvođača" koji je zapravo bio naslov pjesme i spajaju duplikate.

47. **Strict Primary Artist Policy for Duets & Collaborations (`No-Composite-Artist Rule`)**:
    - **Strogo je zabranjeno kreiranje zajedničkih hibridnih profila izvođača** sa `&`, `i`, `feat.`, `ft.`, `duet sa`, `x`, `×` (npr. `Aca Zivanović & Gabrijela Pejčev`, `Kemal Monteno & Oliver Dragojević`, `Devito X Bajaga`, `Breskvica & Peđa Jovanović`).
    - Sistem **uvijek ekstraktuje primarnog solo izvođača** (`Aca Živanović`, `Kemal Monteno`, `Devito`, `Breskvica`), dodjeljuje pjesmu primarnom profilu, a gostujućeg izvođača smješta u tagove pjesme.
    - Izuzetak su isključivo stvarni bendovi sa fiksnim imenom (npr. `Pips, Chips & Videoclips`, `Guns N' Roses`, `Kanda, Kodža i Nebojša`, `Bajaga i Instruktori`).

48. **Total Polish & Anti-Tablature Standard (`Pure-Chords & No-Tabs Policy`)**:
    - **Strogo je zabranjeno prisustvo ASCII gitarskih tabova u pjesmama** (`e|---`, `h---`, `g---`, `d---`, `a---`, `e---`, `1|--` ili horizontalne trake sa brojevima pragova).
    - `isTabLine` detektuje i automatski eliminiše sve gitarske tabove iz tekstova pjesama, ostavljajući isključivo čiste, harmonizovane akorde (`[Am] [G] [F] [E]`) iznad pravih stihova.
    - Svi spoljni crawler-i za novo skidanje tekstova su ugašeni — 100% resursa i pozadinskih servisa je preusmjereno na **dubinski polish postojećih 14.470+ pjesama i 2.800+ izvođača** (Ex-Yu dijakritici, eliminacija zagrada/sufiksa, bogaćenje državama, WebP slikama, YouTube video ID-evima i deduplikaciji).

49. **Authentic Ex-Yu Apostrophe & Elision Standard (`Apostrophe & Elision Policy`)**:
    - Sistem automatski prepoznaje i rekonstruiše autentične apostrofe kod skraćenih riječi i elizija u naslovima i stihovima:
      - Upitne i odrične čestice: `Da l'`, `Je l'`, `Il'`, `Nek'`, `Al'`, `K'o` (umjesto spojenih `dal`, `jel`, `il`, `nek`, `ko`).
      - Glagolski oblici i krnji infinitivi/participi: `stig'o`, `dotak'o`, `rek'o`, `vid'o`, `uz'o`, `otiš'o`, `naš'o`, `doć'`, `imat'`.
      - Imena i nazivi: `Al'Dino`, `Čija si, nisi`, `Bez časti`.

50. **Continuous Autonomous Anomaly Hunter & Quality Gate Sync (`Self-Improving Healer Daemon`)**:
    - `scripts/anomaly_discovery_healer.js` kontinuirano i periodično skenira bazu u potrazi za novim forumaškim anomalijama:
      - Uklanja zalutale godine (`2011`, `1984`), ekstenzije (`.tab`, `.crd`, `.txt`) i duplu interpunkciju (`???`, `...`).
      - Automatski prepoznaje i popravlja nepotpune akorde i prazne sekcije bez stihova.
      - Sve nove uočene greške se automatski kodiraju u `scripts/song_quality_gate.js` i dokumentuju u `SKILL.md`.

51. **Harmonic Tonality & Key Detection Standard (`Harmonic Tonality Policy`)**:
    - `scripts/key_detector_healer.js` analizira distribuciju akorada, kadence (I-IV-V stepeni), toniku i prve/posljednje akorde.
    - Automatski i matematički tačno dodjeljuje pravi tonalitet (`originalKey`) i težinu sviranja (`easy`, `medium`, `hard` na bazi barre hvatova) za svaku numeru.

52. **Real-Time Zero-Latency Quality Gate Watcher (`RealTime Watcher Standard`)**:
    - `scripts/realtime_gate_watcher.js` se kači na MongoDB ChangeStreams / reaktivni event loop.
    - Čim se pjesma kreira ili izmijeni na Dashboardu, Quality Gate je polira u roku od <10ms prije nego što je bilo koji korisnik otvori.

53. **Ghost Section & Broken Bracket Squeezer (`Ghost Header Purge Standard`)**:
    - `scripts/ghost_section_purger.js` eliminiše prazne sekcije bez stihova (`[Solo]`, `[Outro]`), spaja uzastopna dupla zaglavlja (`[Refren]\n[Refren]`), popravlja polomljene zagrade (`[[Am]`) i renumeriše strofe u strogi sekvencijalni niz (`[Strofa 1]`, `[Strofa 2]`, `[Strofa 3]`).

54. **Strict Genuine Studio Portrait Standard (`Strict Portrait Policy`)**:
    - **Strogo je zabranjeno čuvanje nasumičnih slika, omota albuma, grbova, zastava, karata ili logotipa umjesto lica izvođača.**
    - `scripts/artist_portrait_enricher.js` koristi striktan filter sa crnom listom (`coat_of_arms`, `grb`, `zastava`, `flag`, `map`, `logo`, `cover`, `album`, `cd`, `vinyl`, `stadium`).
    - Koristi isključivo **verifikovane studio fotografije izvođača i članova benda** sa Deezer Artist API-ja, TheAudioDB API-ja, Wikidata P18 entiteta i biografskih slika sa Wikipedije.
    - Validira proporcije lica ($0.5 \le \text{ratio} \le 2.0$), automatski centrira kadar i kompresuje u WebP format $\le 20\text{ KB}$.

55. **100% Guaranteed Artist Portrait Coverage Cascade (`Total Portrait Coverage Standard`)**:
    - Nijedan izvođač u bazi ne smije ostati bez vizuelnog identiteta (`imageBytes > 0`).
    - Sistem primjenjuje kaskadnu pretragu u 5 nivoa:
      1. **Deezer Artist Photo API** (zvanična studio slika pjevača/benda).
      2. **TheAudioDB HD Thumbnail** (`strArtistThumb`).
      3. **Wikidata P18 entitet** (zvanična fotografija).
      4. **Wikipedia višejezični OpenSearch** (`sr`, `hr`, `bs`, `sh`, `sl`, `mk`, `en`).
      5. **Octava Text-Free Studio Avatar** (minimalistička tamna vektorska silueta muzičara bez ijednog slova).
    - Garantuje **100.0% pokrivenost izvođača** u cijelom katalogu.

56. **Zero Text on WebP Images Policy (`Anti-Text & Pure Visual Standard`)**:
    - **Strogo je zabranjeno prisustvo bilo kakvog teksta, slova, inicijala, vodenih žigova ili tipografije na WebP slikama izvođača.**
    - `generateStudioAvatar` u `scripts/artist_portrait_enricher.js` generiše isključivo čiste, elegantne, tamne apstraktne siluete i akustične talase bez `<text>` elemenata.
    - Svi postojeći avatari u bazi se automatski konvertuju u 100% beztekstualne vizuale.

57. **Junk / Inverted / Non-Existent Artist Purge Policy (`Artist Sanitization Standard`)**:
    - **Strogo je zabranjeno čuvanje brojeva, nasumičnih stringova ili naziva pjesama kao imena izvođača** (npr. `123`, `Nepoznat`, `21 Vjek`, `Noćas Mi Srce Pati`, `Dušo Moja`).
    - Skener i `scripts/heal_nonexistent_and_foreign_artists.js` automatski prepoznaju invertovane unose, preusmjeravaju pjesmu na stvarnog izvođača (`Miligram`, `Toma Zdravković`, `Kemal Monteno`), a lažni profil trajno brišu.
    - Svi prazni profili sa 0 pjesama se automatski uklanjaju.
    - Strani / zapadni izvođači dobijaju tačnu matičnu državu (`US`, `GB`, `SE`, `DE`, `IT`) i status `draft` kako ne bi zagađivali balkanski javni katalog.



