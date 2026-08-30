# Octava Song Quality Standard & Pre-Publish Quality Gate Rules (1–57)

This document contains the complete, canonical, and inviolable quality standards enforced across the entire Octava catalog (14,400+ songs, 2,800+ artists), ingestion pipelines, scrapers, visual editors, and autonomous healing daemons.

---

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

---

## 📜 Full Rules Registry (Rules 11–57)

11. **Obavezna zaglavlja sekcija za SVAKU strofu i refren (Mandatory Section Labels)**:
    - `[Intro / Uvod]:`, `[Strofa 1]`, `[Refren]`, `[Strofa 2]`, `[Refren]`, `[Prelaz / Solo]:`, `[Strofa 3]`, `[Outro / Finale]:`.
    - Zabranjene su "gole" strofe bez sekcijskog taga.

12. **Stanza Harmonizer & Aggressive Refrain Unroller**:
    - Neharmonizovane strofe automatski dobijaju akorde preslikane iz prve strofe liniju po liniju.
    - Svi skraćeni refreni (`Ref. 2x`) se raspisuju u puni studijski tekst i akorde.

13. **Line-Wrap Auto-Stitcher (Spajanje slomljenih stihova)**:
    - Kratki redovi prelomljeni u uskim tabovima se spajaju u jedan cjelovit stih.

14. **Modulation & Key Change Handler**:
    - Oznake modulacije se standardizuju u `[Modulacija / Key Change]:` ili `[Refren (+1)]:`.

15. **Parenthesis & Passing Chords Normalizer**:
    - Čisti ugniježđene akorde: `[Am(G)]` $\rightarrow$ `[Am] [G]`, bas prelaze na `G/H`.

16. **Anti-Troll & Uploader Comments Sanitizer**:
    - Uklanja in-line komentare (*"ovde ide harmonika"*, *"tiše"*, *"pozdrav svima"*).

17. **Minimum Song Completeness Validator**:
    - Isječci kraći od 6 stihova bez refrena se drže u `status: 'draft'`.

18. **Genre Auto-Tagging & Smart Classification**:
    - Dodjeljuje žanrove: `Domaća`, `Ex-Yu`, `Narodna`, `Folk`, `Rock`, `Pop`, `Zabavna`, `Sevdalinka`, `Starogradska`, `Hip hop`.

19. **Harmonic Key Auto-Detector & Key Sanity Validator**:
    - Detektuje toniku i postavlja tačan `originalKey` (`Am`, `Em`, `Gm`, `Dm`, `C`, `G`...).

20. **Auto-Difficulty Estimator**:
    - Računa težinu: `easy` (otvoreni akordi), `medium` (barre hvatovi), `hard` (jazz/dim/aug).

21. **Duet & Featuring Normalizer**:
    - Ekstraktuje primarnog solo izvođača, a gostujuće smješta u tagove.

22. **Chord Notation Standardizer & Slash-Bass Sanitizer**:
    - Standardizuje forumaške akorde (`Cadd9`, `F#m7b5`) i bas linije (`G/H`).

23. **Orphan & Double-Chorus Collapser**:
    - Spaja uzastopna zaglavlja `[Refren]\n[Refren]` i uklanja prazna zaglavlja.

24. **Scraper Priority Queue Feeder**:
    - Automatski ažurira `data/scraper_priority_queue.json` za harmonizaciju 0-chord pjesama.

25. **Canonical SEO Slug Sanitizer**:
    - Čisti slugove od duplih crtica (`--`) i sufiksa (`-2`).

26. **Mandatory Artist Portrait Policy (.webp <= 20 KB)**:
    - Svi izvođači moraju imati WebP sliku $\le 20\text{ KB}$.

27. **Zero-Cyrillic & Chord Homoglyph Elimination Policy**:
    - Stroga eliminacija ćirilice i ćiriličnih homoglifičnih akorda (`[Сm]` $\rightarrow$ `[Cm]`, `[Н]` $\rightarrow$ `[H]`).

28. **Sentence & Verse Punctuation Standardization**:
    - Automatsko tačkanje završetka stihova uz zaštitu akorada i bedževa.

29. **Syllabic Chord Snapping Policy**:
    - Pomjera akorde sa suglasničkih skupova na početak riječi (`D[Am]otak'o` $\rightarrow$ `[Am]Dotak'o`).

30. **Crawler Raw Artifacts & Forum Chatter Scrubber Policy**:
    - Čisti pozdrave, BBCode tagove (`[b]`), mojibake karaktere i zvjezdice.

31. **Accidental Shift-Caps & CamelCase Stutter Eliminator**:
    - Ispravlja duple kapitale (`PLavusa` $\rightarrow$ `Plavuša`, `CRvena` $\rightarrow$ `Crvena`).

32. **Forum Metadata Scrubber & Auto-Reindexing Policy**:
    - Briše linije `Izvodjac:`, `Album:`, `YT:` i reindeksira strofe redom.

33. **Cross-Origin WebP Delivery & Graceful UI Fallback Policy**:
    - Servira slike sa `Cross-Origin-Resource-Policy: cross-origin` i `@error` avatar fallbackom.

34. **Full Lyrics Completer & Zero-x2 Pure Repetition Policy**:
    - Odmotava `(2x)` i `x2` oznake u pune stihove sa akordima.

35. **Ghost Bracket & Stray URL Annihilator Policy**:
    - Briše prazne zagrade `[]` i zaostale web linkove/domene.

36. **Section Spacing Compressor (Max 1 Blank Line)**:
    - Sažima višestruke prazne redove na tačno 1 prazan red između sekcija.

37. **Crawler Exponential Backoff & Crash Immunity**:
    - Automatski `try/catch` i 3-5s pauza pri HTTP 429/503.

38. **Strict Artist Title Case Capitalization Policy**:
    - Veliko početno slovo za svaku riječ (`Mirnes Solak`), pretvara `Prezime, Ime` u `Ime Prezime`.

39. **Mandatory Artist Country & Origin Policy (ISO 3166-1 alpha-2)**:
    - 100% pokrivenost izvođača državama (`BA`, `RS`, `HR`, `ME`, `MK`, `SI`).

40. **Strict Canonical Artist Matching & Annotation Scrubber**:
    - Uklanja zagrade u imenima (`Pomaranca (peklenska)` $\rightarrow$ `Pomaranča`).

41. **Zero-Collision Chord Staggering & Spacing Policy**:
    - Razmiče susjedne akorde (`[Am][G]` $\rightarrow$ `[Am] [G]`) i sprječava frontend preklapanje bedževa.

42. **Universal Parenthesis & Suffix Noise Purge**:
    - Uklanja zagrade iz naslova (`Kopriva (verzija 2)` $\rightarrow$ `Kopriva`).

43. **Autonomous YouTube Studio Audio/Video Matcher**:
    - Automatski pretražuje i povezuje zvanične studio snimke (16 paralelnih workera).

44. **Smart Phonetic & Fuzzy Search with Diacritic/Compound Word Folding**:
    - Tolerancija na kucanje bez kvačica, spojene riječi i tipfelere.

45. **Overnight Master Supervisor & Automated Rolling Backup Daemon**:
    - Nadgleda 11 servisa paralelno sa auto-restartom i 2-satnim backupom.

46. **Inverted Song-Artist Auto-Rectification Policy**:
    - Ispravlja zamijenjena mjesta izvođača i naslova pjesme.

47. **Strict Primary Artist Policy for Duets & Collaborations**:
    - Spaja hibridne duete (`Aca Pejović i Aleksandra Prijović` $\rightarrow$ `Aco Pejović`).

48. **Total Polish & Anti-Tablature Standard**:
    - 100% eliminacija ASCII gitarskih tabova (`e|---`).

49. **Authentic Ex-Yu Apostrophe & Elision Standard**:
    - Rekonstruiše apostrofe: `Da l'`, `Je l'`, `Nek'`, `Al'`, `K'o`, `stig'o`, `dotak'o`, `rek'o`, `doć'`.

50. **Continuous Autonomous Anomaly Hunter & Quality Gate Sync**:
    - Autonomno lovi i uklanja zalutale godine (`2011`), ekstenzije (`.tab`) i anomalije.

51. **Harmonic Tonality & Key Detection Standard**:
    - Matematički tačno dodjeljuje `originalKey` i `difficulty` (`easy/medium/hard`).

52. **Real-Time Zero-Latency Quality Gate Watcher**:
    - MongoDB ChangeStreams watcher polira pjesme za $<10\text{ ms}$.

53. **Ghost Section & Broken Bracket Squeezer**:
    - Uklanja prazna zaglavlja `[Solo]`, spaja dupla `[Refren]` i popravlja `[[Am]`.

54. **Strict Genuine Studio Portrait Standard**:
    - Zabrana omota albuma, grbova, zastava i logotipa. Isključivo prave fotografije lica/benda.

55. **100% Guaranteed Artist Portrait Coverage Cascade**:
    - Kaskada u 5 nivoa (Deezer $\rightarrow$ TheAudioDB $\rightarrow$ Wikidata P18 $\rightarrow$ Wikipedia $\rightarrow$ Studio Avatar).

56. **Zero Text on WebP Images Policy**:
    - Strogo zabranjeno prisustvo bilo kakvog teksta, slova ili tipografije na WebP slikama izvođača.

57. **Junk / Inverted / Non-Existent Artist Purge Policy**:
    - Zabrana brojeva i lažnih imena (`123`, `Nepoznat`). Prazni profili sa 0 pjesama se automatski brišu, a strani izvođači se postavljaju na status `draft`.
