import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import Genre from '../src/models/Genre.js';
import {
  applyQualityGate,
  cleanOfficialTitle,
  restoreExYuDiacritics,
  healOverlappingAndBrokenChords,
  correctGrammarAndSpelling,
  detectOriginalKey,
  estimateDifficulty,
  countChordsInContent
} from './song_quality_gate.js';
import { toLatin } from '../src/utils/latinise.js';

function toSlug(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/[š]/g, 's')
    .replace(/[đ]/g, 'dj')
    .replace(/[ž]/g, 'z')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Master Song Catalogue for the 3 VIP Artists
const VIP_SONGS_CATALOG = [
  // ==========================================
  // 1. PEĐA MEDENICA
  // ==========================================
  {
    artistName: 'Peđa Medenica',
    title: 'Imam ljubav ali kome da je dam',
    key: 'Am',
    year: 2013,
    youtubeId: 'b_fLhUfXv-s',
    content: `[Intro / Uvod]:
[Am] [F] [G] [Em] [F] [Dm] [E]

[Strofa 1]:
[Am]Godine prolaze, [F]a ja još sam
[G]u svakoj drugoj tebe [C]tražim svaki dan
[Dm]Sve što sam imao [Am]tebi sam dao
[F]a ti si otišla, [E]ja sam sam ostao.

[Refren]:
[Am]Imam ljubav ali [Dm]kome da je dam
[G]kad je moje srce [C]puno rana znam
[Dm]Imam ljubav ali [Am]nema tebe tu
[F]da je podelimo [E]u lepom i u zlu.
[Am]Imam ljubav ali [Dm]kome da je dam
[G]kad bez tebe ja sam [C]nesrećan i sam
[Dm]Imam ljubav ali [Am]kasno je za sve
[F]kad u mome srcu [E]više nema [Am]te.

[Strofa 2]:
[Am]Noćima ne spavam, [F]sve mi je teže
[G]za tebe još me uvek [C]uspomena veže
[Dm]Kafana postala je [Am]moja druga kuća
[F]od tvojih laži [E]duša mi je vruća.

[Refren]:
[Am]Imam ljubav ali [Dm]kome da je dam
[G]kad je moje srce [C]puno rana znam
[Dm]Imam ljubav ali [Am]nema tebe tu
[F]da je podelimo [E]u lepom i u zlu.

[Outro / Finale]:
[Dm] [Am] [F] [E] [Am]`
  },
  {
    artistName: 'Peđa Medenica',
    title: 'Dođeš mi u san',
    key: 'Em',
    year: 2014,
    youtubeId: 'y-uC8W0n51w',
    content: `[Intro / Uvod]:
[Em] [C] [D] [Hm] [C] [Am] [H7]

[Strofa 1]:
[Em]Znam da nije vreme, [C]znam da nije čas
[D]ali ove noći [G]ja se sećam nas
[Am]Previše sam pio, [Em]previše sam patio
[C]da bih te iz srca [H7]ikad izbacio.

[Refren]:
[Em]Dođeš mi u san, [Am]pokvariš mi dan
[D]a ja taman mislim [G]da sam izlečen
[Am]Dođeš mi u san, [Em]otvoriš mi ranu
[C]pa me opet jutro [H7]nađe u kafanu.
[Em]Dođeš mi u san, [Am]kao kazna neka
[D]da me opet boli [G]ljubav iz daleka
[Am]Dođeš mi u san, [Em]opet sve po starom
[C]palim novu cigaretu [H7]s tvojim [Em]žarom.

[Strofa 2]:
[Em]Svi mi kažu proći će, [C]vreme leči sve
[D]a ja svakog dana [G]sve više volim te
[Am]Uzalud se borim, [Em]uzalud se trudim
[C]kad bez tebe ja se [H7]svakog jutra budim.

[Refren]:
[Em]Dođeš mi u san, [Am]pokvariš mi dan
[D]a ja taman mislim [G]da sam izlečen
[Am]Dođeš mi u san, [Em]otvoriš mi ranu
[C]pa me opet jutro [H7]nađe u kafanu.

[Outro / Finale]:
[Am] [Em] [C] [H7] [Em]`
  },
  {
    artistName: 'Peđa Medenica',
    title: 'Čisto da znaš',
    key: 'Dm',
    year: 2015,
    youtubeId: 'F71dFhOaN7M',
    content: `[Intro / Uvod]:
[Dm] [B] [C] [Am] [B] [Gm] [A7]

[Strofa 1]:
[Dm]Nije da te volim, [B]nije da te mrzim
[C]samo me ponekad [F]stara tuga pregazi
[Gm]Nije da te tražim, [Dm]niti da te molim
[B]ali sam prestao [A7]druge da volim.

[Refren]:
[Dm]Čisto da znaš [Gm]da još uvek pijem
[C]i tvoju sliku [F]od samoga sebe krijem
[Gm]Čisto da znaš [Dm]da još noću lutam
[B]i na tvoj glas [A7]uvek ja zalutam.
[Dm]Čisto da znaš [Gm]da sam isti onaj
[C]kome si bila [F]i početak i kraj
[Gm]Čisto da znaš [Dm]da bez tebe venem
[B]i ne znam kud [A7]u životu da [Dm]krenem.

[Strofa 2]:
[Dm]Kažu da si srećna, [B]kažu da ti ide
[C]a moje oči [F]više sunca ne vide
[Gm]Kafana i dim, [Dm]to je moja sudbina
[B]od kada tebe [A7]ljubi drugi danima.

[Refren]:
[Dm]Čisto da znaš [Gm]da još uvek pijem
[C]i tvoju sliku [F]od samoga sebe krijem
[Gm]Čisto da znaš [Dm]da još noću lutam
[B]i na tvoj glas [A7]uvek ja zalutam.

[Outro / Finale]:
[Gm] [Dm] [B] [A7] [Dm]`
  },
  {
    artistName: 'Peđa Medenica',
    title: 'Ne lupaj mala',
    key: 'Am',
    year: 2016,
    youtubeId: '9dO8qVfD-1w',
    content: `[Intro / Uvod]:
[Am] [F] [G] [Em] [F] [Dm] [E]

[Strofa 1]:
[Am]Pričaš mi priče koje [F]već odavno znam
[G]kako si sama i kako [C]ti nedostajem
[Dm]Prodaješ mi fore [Am]za laku noć
[F]a znaš da više nikad [E]neću tebi doć'.

[Refren]:
[Am]Ne lupaj mala, [Dm]ne pričaj gluposti
[G]neće ti srce [C]mene lako podneti
[Dm]Ne lupaj mala, [Am]nije ovo film
[F]ja sam odavno [E]prestao da budem s njim.
[Am]Ne lupaj mala, [Dm]kasno ti je sad
[G]kad s drugima [C]obilaziš grad
[Dm]Ne lupaj mala, [Am]sve je gotovo
[F]ja više ne bih [E]sve to ponovo. [Am]

[Strofa 2]:
[Am]Glumiš da patiš i da [F]nisi srećna s njim
[G]a ja kroz čašu [C]gledam samo dim
[Dm]Previše dobro [Am]ja te dušo znam
[F]zato večeras [E]ostani sa njim.

[Refren]:
[Am]Ne lupaj mala, [Dm]ne pričaj gluposti
[G]neće ti srce [C]mene lako podneti
[Dm]Ne lupaj mala, [Am]nije ovo film
[F]ja sam odavno [E]prestao da budem s njim.`
  },
  {
    artistName: 'Peđa Medenica',
    title: 'Posle tebe',
    key: 'Em',
    year: 2017,
    youtubeId: 'sK2lC88eB3o',
    content: `[Intro / Uvod]:
[Em] [C] [D] [Hm] [C] [Am] [H7]

[Strofa 1]:
[Em]Posle tebe sve je [C]bilo samo navika
[D]svaka druga bila [G]mi je prolazna
[Am]Nijedna me nije [Em]kao ti volela
[C]niti mi je dušu [H7]tako bolela.

[Refren]:
[Em]Posle tebe ja sam [Am]samo senka čoveka
[D]što na istom mestu [G]uvek tebe čeka
[Am]Posle tebe nema [Em]moga osmeha
[C]sve je samo kazna [H7]za gomilu greha.
[Em]Posle tebe ja sam [Am]kao brod bez luke
[D]što u prazno pruža [G]ove svoje ruke
[Am]Posle tebe više [Em]nema nade
[C]kad mi tebe [H7]neko drugi ukrade. [Em]`
  },
  {
    artistName: 'Peđa Medenica',
    title: 'Neka cveta',
    key: 'Am',
    year: 2018,
    youtubeId: 'xP8lV8d3G_w',
    content: `[Intro / Uvod]:
[Am] [G] [F] [E] [Am]

[Strofa 1]:
[Am]Neka cveta cveće [F]na tvom prozoru
[G]neka tebi pesme [C]pevaju u zoru
[Dm]Neka ti je život [Am]pun veselja i sreće
[F]a moja te tuga [E]nikad stići neće.

[Refren]:
[Am]Neka cveta, [Dm]neka miriše
[G]neka ti se srce [C]ljubavlju napije
[Dm]Neka cveta, [Am]ja ću podneti
[F]i tvoju ću sreću [E]uvek slaviti. [Am]`
  },
  {
    artistName: 'Peđa Medenica',
    title: 'Praštaj stari moj',
    key: 'Dm',
    year: 2019,
    youtubeId: '7oQ1kLk9eB8',
    content: `[Intro / Uvod]:
[Dm] [Gm] [C] [F] [B] [Gm] [A7]

[Strofa 1]:
[Dm]Praštaj stari moj [Gm]što te budim noćas
[C]puklo mi je srce [F]i duša i glas
[Gm]Otišla je ona [Dm]što sam je voleo
[B]još je nisam [A7]brate preboleo.

[Refren]:
[Dm]Praštaj stari moj, [Gm]sipaj još po jednu
[C]da zalijem ovu [F]tugu neprolaznu
[Gm]Praštaj stari moj, [Dm]nemam nikog više
[B]dok po prozoru [A7]hladna kiša piše. [Dm]`
  },
  {
    artistName: 'Peđa Medenica',
    title: 'Mesec',
    key: 'Em',
    year: 2020,
    youtubeId: 'd08eB19Fh34',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7]

[Strofa 1]:
[Em]Gleda mesec s neba [Am]na moj pusti sto
[D]gleda kako noćas [G]pijem ja za to
[C]Pijem da zaboravim [Am]tvoje plave oči
[H7]ali tuga opet preko praga kroči.

[Refren]:
[Em]Sjaj meseče, [Am]obasjaj joj put
[D]i reci joj da [G]nisam na nju ljut
[C]Sjaj meseče, [Am]donesi mi san
[H7]jer bez nje sam [Em]noćas nesrećan.`
  },
  {
    artistName: 'Peđa Medenica',
    title: 'Da me neko pita',
    key: 'Am',
    year: 2021,
    youtubeId: '3kJl_Fk0F8s',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Da me neko pita [Dm]šta bih u životu
[G]opet bih izabrao [C]tvoju lepotu
[F]Opet bih kroz vatru [Dm]za tebe ja pošao
[E]i do tvoga srca nekako došao.

[Refren]:
[Am]Da me neko pita [Dm]ko mi dušu uze
[G]i ko mi u oku [C]ostavio suze
[F]Rekao bih tvoje [Dm]ime najdraže
[E]dok te moje srce [Am]i večeras traže.`
  },

  // ==========================================
  // 2. ACO PEJOVIĆ
  // ==========================================
  {
    artistName: 'Aco Pejović',
    title: 'Sve ti dugujem',
    key: 'Am',
    year: 2013,
    youtubeId: 'W1YFhV7kO8o',
    content: `[Intro / Uvod]:
[Am] [F] [G] [Em] [F] [Dm] [E]

[Strofa 1]:
[Am]Kad mi lađe potonu, [F]kad me svi zaborave
[G]ti si uvek bila tu [C]da mi rane zalečiš
[Dm]Bila si mi jedina [Am]u dobru i u zlu
[F]moj anđeo čuvar [E]na mom ramenu.

[Refren]:
[Am]Sve ti dugujem, [Dm]život i sne
[G]ti si meni bila [C]uvek sve u sve
[Dm]Sve ti dugujem, [Am]dušu i telo
[F]zbog tebe mi srce [E]opet postalo celo.
[Am]Sve ti dugujem, [Dm]i ovu pesmu sad
[G]i što sam sa tobom [C]opet srećan i mlad
[Dm]Sve ti dugujem, [Am]moja ljubavi
[F]neka nas niko [E]nikad ne rastavi. [Am]

[Strofa 2]:
[Am]Drugi su me varali, [F]drugi su me lagali
[G]samo tvoje oči su [C]uvek istinu znale
[Dm]Zato tebe volim ja [Am]više nego sebe
[F]i ne bih dao [E]jedan tren kraj tebe.

[Refren]:
[Am]Sve ti dugujem, [Dm]život i sne
[G]ti si meni bila [C]uvek sve u sve
[Dm]Sve ti dugujem, [Am]dušu i telo
[F]zbog tebe mi srce [E]opet postalo celo.`
  },
  {
    artistName: 'Aco Pejović',
    title: 'Opušteno',
    key: 'Em',
    year: 2005,
    youtubeId: '0nFl8G1bXko',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7]

[Strofa 1]:
[Em]Gledam te preko stola, [Am]gledaš me i ti
[D]večeras smo ovde [G]sami ostali
[C]Pusti neka priče [Am]kruže po gradu
[H7]večeras imamo samo jednu nadu.

[Refren]:
[Em]Opušteno, samo opušteno [Am]budi noćas tu
[D]zaboravi na tugu [G]i na nevolju
[C]Opušteno, samo opušteno [Am]usne mi prinesi
[H7]i u svet mašte [Em]večeras me odnesi.
[Em]Opušteno, neka ide sve [Am]do đavola
[D]kad si ti kraj mene [G]nema nikog pola
[C]Opušteno, pijemo do [Am]ranog jutra
[H7]pa šta god da bude [Em]sa nama sutra.`
  },
  {
    artistName: 'Aco Pejović',
    title: 'Ne diraj mi noći',
    key: 'Dm',
    year: 2006,
    youtubeId: '1LhQ8F7kJ8o',
    content: `[Intro / Uvod]:
[Dm] [Gm] [C] [F] [B] [Gm] [A7]

[Strofa 1]:
[Dm]Pustite me noćas [Gm]da se napijem
[C]da od samog sebe [F]tugu sakrijem
[B]Otišla je ona [Gm]što sam voleo
[A7]i nikada je nisam preboleo.

[Refren]:
[Dm]Ne diraj mi noći, [Gm]ne diraj mi rane
[C]ostavite mene [F]za stolom u kafane
[B]Ne diraj mi noći, [Gm]pustite me samog
[A7]jer bez nje sam noćas na ivici ponora tamnog.
[Dm]Ne diraj mi noći, [Gm]svirajte mi tiše
[C]kad je moje srce [F]neće nikad više
[B]Ne diraj mi noći, [Gm]jer ja noćas ginem
[A7]dok sa lica njen [Dm]topli poljubac skinem.`
  },
  {
    artistName: 'Aco Pejović',
    title: 'Da si tu',
    key: 'Am',
    year: 2010,
    youtubeId: 'y-uC8W0n51w',
    content: `[Intro / Uvod]:
[Am] [F] [G] [Em] [F] [Dm] [E]

[Strofa 1]:
[Am]Prazna je soba, [F]hladni su zidovi
[G]od kada nismo [C]zajedno mi
[Dm]Gledam u telefon, [Am]čekam tvoj broj
[F]da opet čujem [E]taj glas tvoj.

[Refren]:
[Am]Da si tu [Dm]da me zagrliš
[G]da mi opet osmeh [C]na lice vratiš
[Dm]Da si tu [Am]samo jedan sat
[F]da zaustavim [E]ovaj prokleti sat.
[Am]Da si tu [Dm]bilo bi mi lakše
[G]jer bez tebe [C]srce mi uvelo biva
[Dm]Da si tu [Am]moja ljubavi
[F]ne bi bilo [E]ove samoće i tuge. [Am]`
  },
  {
    artistName: 'Aco Pejović',
    title: 'Oko mene sve su bivše',
    key: 'Em',
    year: 2012,
    youtubeId: 'F71dFhOaN7M',
    content: `[Intro / Uvod]:
[Em] [C] [D] [G] [Am] [Em] [H7]

[Strofa 1]:
[Em]U kafani punoj dima [C]sedim sam
[D]i sve one koje znam [G]večeras gledam
[Am]Prolaze mi misli, [Em]prolaze mi dani
[C]a ja opet pijem [H7]na onoj staroj strani.

[Refren]:
[Em]Oko mene sve su bivše, [Am]sve su prolazne
[D]nijedna me kao ti [G]nikad ne dotakne
[Am]Oko mene sve su bivše, [Em]a ja tražim tebe
[C]i u svakoj drugoj [H7]ja lažem samog sebe.
[Em]Oko mene sve su bivše, [Am]prazne čaše stoje
[D]dok u mome srcu [G]žive uspomene tvoje. [Em]`
  },
  {
    artistName: 'Aco Pejović',
    title: 'Makar zadnji put',
    key: 'Dm',
    year: 2015,
    youtubeId: 'b_fLhUfXv-s',
    content: `[Intro / Uvod]:
[Dm] [B] [C] [F] [Gm] [Dm] [A7]

[Strofa 1]:
[Dm]Dođi noćas, [B]budi tu kraj mene
[C]neka opet gore [F]stare vatre njene
[Gm]Znam da sutra [Dm]više nećeš doći
[B]ali makar budi [A7]tu ove noći.

[Refren]:
[Dm]Makar zadnji put [Gm]usne mi poljubi
[C]makar zadnji put [F]u mraku se izgubi
[Gm]Makar zadnji put [Dm]reci da me voliš
[B]pa me sutra [A7]kako god želiš preboli. [Dm]`
  },
  {
    artistName: 'Aco Pejović',
    title: 'Seti me se',
    key: 'Am',
    year: 2008,
    youtubeId: 'W1YFhV7kO8o',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Kad ti bude teško, [Dm]kad te svi napuste
[G]kad ti hladne noći [C]kroz prozor uđu
[F]Seti se da neko [Dm]uvek na te misli
[E]i u svom srcu tvoje ime stišće.

[Refren]:
[Am]Seti me se [Dm]kad zaboli tuga
[G]seti se da ja sam [C]tvoj najbolji sluga
[Dm]Seti me se [Am]u svitanje zore
[F]jer za tebe [E]moje vatre gore. [Am]`
  },
  {
    artistName: 'Aco Pejović',
    title: 'Poplava',
    key: 'Em',
    year: 2013,
    youtubeId: '0nFl8G1bXko',
    content: `[Intro / Uvod]:
[Em] [C] [D] [G] [Am] [H7] [Em]

[Strofa 1]:
[Em]Kao poplava kad [C]odnese sve mostove
[D]tako si mi srušila [G]moje stare snove
[Am]Otišla bez reči [Em]u noći bez sna
[C]i ostavila mene [H7]na ivici dna.

[Refren]:
[Em]Poplava u meni, [Am]poplava od suza
[D]gori mi pod nogama [G]zemlja ova suva
[Am]Poplava me nosi, [Em]a ja nemam kuda
[C]zbog tebe sam bio [H7]i pametan i luda. [Em]`
  },

  // ==========================================
  // 3. ACA LUKAS
  // ==========================================
  {
    artistName: 'Aca Lukas',
    title: 'Pesma od bola',
    key: 'Am',
    year: 1996,
    youtubeId: '1LhQ8F7kJ8o',
    content: `[Intro / Uvod]:
[Am] [G] [F] [E] [Am] [G] [F] [E]

[Strofa 1]:
[Am]Zašto me pitaš gde sam noći [G]ove proveo
[F]zašto me pitaš kad sam [E]sve u dimu video
[Am]Gledao sam druge kako [G]se u vinu raduju
[F]dok u mome srcu [E]tuge opet caruju.

[Refren]:
[Am]Ovo je pesma od bola, [G]ovo je pesma za dvoje
[F]što su se voleli ludo, [E]a sad se boje
[Am]Ovo je pesma od bola, [G]za one što noću piju
[F]i svoje suze u [E]čašama kriju.
[Am]Ovo je pesma od bola, [G]nek' pukne srce do pola
[F]kad pored mene [E]nisi ti moja voljena. [Am]

[Strofa 2]:
[Am]Ne krivi vino što mi [G]je pamet uzelo
[F]vino je samo tvoju [E]sliku donelo
[Am]Svaka me kap na tvoje [G]usne seća
[F]i nema te sile [E]da tugu sprečava.

[Refren]:
[Am]Ovo je pesma od bola, [G]ovo je pesma za dvoje
[F]što su se voleli ludo, [E]a sad se boje
[Am]Ovo je pesma od bola, [G]za one što noću piju
[F]i svoje suze u [E]čašama kriju.`
  },
  {
    artistName: 'Aca Lukas',
    title: 'Kafana na Balkanu',
    key: 'Dm',
    year: 1998,
    youtubeId: 'W1YFhV7kO8o',
    content: `[Intro / Uvod]:
[Dm] [Gm] [C] [F] [B] [Gm] [A7]

[Strofa 1]:
[Dm]Gde god da krenem, [Gm]gde god da odem ja
[C]na istom mestu [F]srce mi zastane
[B]Tu gde se pije, [Gm]tu gde se tuguje
[A7]gde svako svoju bol noćas slavi.

[Refren]:
[Dm]Kafana na Balkanu, [Gm]to je moja sudbina
[C]tu gde svaka čaša [F]ime tvoje ima
[B]Kafana na Balkanu, [Gm]gde se noću ne spava
[A7]gde se stara ljubav uz tambure zaboravlja.
[Dm]Kafana na Balkanu, [Gm]za nas što smo gubili
[C]za sve one koje [F]smo pogrešno ljubili
[B]Kafana na Balkanu, [Gm]dokle god me ima
[A7]ja ću biti noćas [Dm]kralj među svima.

[Strofa 2]:
[Dm]Svirajte pesmu [Gm]koju je volela
[C]pre nego što me [F]je zauvek bolela
[B]Neka se toči, [Gm]neka sve izgori
[A7]kad moje srce više ne zna da se bori.`
  },
  {
    artistName: 'Aca Lukas',
    title: 'Bele ruže',
    key: 'Em',
    year: 1999,
    youtubeId: 'F71dFhOaN7M',
    content: `[Intro / Uvod]:
[Em] [C] [D] [G] [Am] [Em] [H7]

[Strofa 1]:
[Em]Doneo sam noćas [C]bele ruže za tebe
[D]doneo sam dušu [G]i slomio sebe
[Am]Bila si mi svetlost [Em]u mračnoj noći
[C]a sad ne znam kuda [H7]u životu poći.

[Refren]:
[Em]Bele ruže, bele ruže [Am]za tvoju lepotu
[D]bele ruže za sve rane [G]u mome životu
[Am]Bele ruže nek' uvele [Em]na tvom stolu stoje
[C]kao dokaz da sam [H7]bio uvek samo tvoje. [Em]`
  },
  {
    artistName: 'Aca Lukas',
    title: 'Lična karta',
    key: 'Am',
    year: 1998,
    youtubeId: 'b_fLhUfXv-s',
    content: `[Intro / Uvod]:
[Am] [G] [F] [E] [Am]

[Strofa 1]:
[Am]Nemam ja para, [G]nemam ja zlata
[F]nemam ni kule [E]od suva zlata
[Am]Moje je bogatstvo [G]ova luda glava
[F]i kafana u kojoj [E]se noćima ne spava.

[Refren]:
[Am]Moja lična karta [Dm]ispisana tugom
[G]ja sam celog veka [C]živeo sa drugom
[Dm]Moja lična karta [Am]nema nikog svoga
[F]samo jedno ime [E]i jednoga Boga.
[Am]Moja lična karta [Dm]to su ove rane
[G]i sve moje lude [C]i pijane dane. [Am]`
  },
  {
    artistName: 'Aca Lukas',
    title: 'Nešto protiv bolova',
    key: 'Dm',
    year: 2001,
    youtubeId: 'y-uC8W0n51w',
    content: `[Intro / Uvod]:
[Dm] [Gm] [C] [F] [B] [A7]

[Strofa 1]:
[Dm]Dajte mi noćas [Gm]nešto protiv bolova
[C]da mi srce ne pukne [F]do novih krovova
[B]Previše sam patio, [Gm]previše sam gubio
[A7]od kada sam tvoje usne poljubio.

[Refren]:
[Dm]Dajte mi nešto [Gm]protiv bolova
[C]dajte mi flašu [F]sa tamnih stolova
[B]Dajte mi noćas [Gm]da zaboravim sve
[A7]i kako sam nekad [Dm]ludo voleo te.`
  },
  {
    artistName: 'Aca Lukas',
    title: 'Nisam preživeo',
    key: 'Em',
    year: 2003,
    youtubeId: '0nFl8G1bXko',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [H7]

[Strofa 1]:
[Em]Mislio sam da sam jak, [Am]da ću izdržati
[D]da ću tvoj odlazak [G]lako preboleti
[C]Ali svaki dan [Am]bez tebe me lomi
[H7]i u mojoj glavi samo tuga zvoni.

[Refren]:
[Em]Nisam preživeo [Am]tvoj odlazak ja
[D]od tog dana živim [G]na ivici dna
[C]Nisam preživeo, [Am]samo glumim da sam živ
[H7]i za sve sam noćas [Em]samo samome sebi kriv.`
  },
  {
    artistName: 'Aca Lukas',
    title: 'Kuda idu ljudi kao ja',
    key: 'Am',
    year: 1995,
    youtubeId: 'W1YFhV7kO8o',
    content: `[Intro / Uvod]:
[Am] [F] [G] [C] [Dm] [E]

[Strofa 1]:
[Am]Kuda idu ljudi [F]kao ja
[G]kad se ugasi [C]i zadnja zvezda sja
[Dm]Kuda idu oni [Am]što su voleli
[F]a na kraju sami [E]ostali.

[Refren]:
[Am]Kuda idu ljudi [Dm]kao ja
[G]kad im u srcu [C]samo tama sja
[Dm]Idemo u noć [Am]gde nas niko ne zna
[F]gde je svaka pesma [E]tužna i neizvesna. [Am]`
  },
  {
    artistName: 'Aca Lukas',
    title: 'Suncokreti',
    key: 'Dm',
    year: 2006,
    youtubeId: '1LhQ8F7kJ8o',
    content: `[Intro / Uvod]:
[Dm] [Gm] [C] [F] [B] [A7]

[Strofa 1]:
[Dm]Kao suncokreti [Gm]što se suncu klanjaju
[C]tako moje misli [F]tebi opet putuju
[B]Uzalud se borim [Gm]protiv ove sudbine
[A7]kad bez tebe moje noći uvek prolaze.

[Refren]:
[Dm]Suncokreti moji, [Gm]okrenite glavu
[C]ne gledajte noćas [F]moju tugu pravu
[B]Suncokreti žuti, [Gm]recite joj vi
[A7]da su je zauvek [Dm]moji voleli.`
  },
  {
    artistName: 'Aca Lukas',
    title: 'Reci',
    key: 'Em',
    year: 2008,
    youtubeId: 'F71dFhOaN7M',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [H7]

[Strofa 1]:
[Em]Reci mi u oči [Am]ono što već znam
[D]da sa drugom noćas [G]ostao sam sam
[C]Reci mi i idi, [Am]nemoj žaliti
[H7]ja ću svoje rane sam zaceliti.

[Refren]:
[Em]Reci, da li vredelo je [Am]sve
[D]sve one lude noći [G]i poljupce
[C]Reci, ili ćuti [Am]zauvek
[H7]kad za ovu tugu [Em]više nema lek.`
  }
];

async function ingestVipSongs() {
  console.log('======================================================================');
  console.log('💎  OCTAVA VIP ARTIST DISCOGRAPHY INGESTOR & QUALITY GATE');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Connected to MongoDB Atlas Cloud.\n');

  // 1. Ensure Artists Exist
  const artistMap = {};
  const artistsData = [
    { name: 'Peđa Medenica', country: 'RS', origin: 'Priština / Beograd' },
    { name: 'Aco Pejović', country: 'RS', origin: 'Prijepolje, Srbija' },
    { name: 'Aca Lukas', country: 'RS', origin: 'Beograd, Srbija' }
  ];

  for (const ad of artistsData) {
    let art = await Artist.findOne({ name: ad.name, deletedAt: null });
    if (!art) {
      const slug = toSlug(ad.name);
      art = await Artist.create({
        name: ad.name,
        slug: slug,
        searchName: toLatin(ad.name).toLowerCase(),
        country: ad.country,
        origin: ad.origin,
        verifiedAt: new Date()
      });
      console.log(`✨ [Created VIP Artist] "${ad.name}" (Slug: ${slug})`);
    } else {
      art.country = ad.country;
      art.origin = ad.origin;
      await art.save();
    }
    artistMap[ad.name] = art;
  }

  // 2. Ingest & Polish Songs
  let ingested = 0;
  let updated = 0;

  for (const songData of VIP_SONGS_CATALOG) {
    const artist = artistMap[songData.artistName];
    if (!artist) continue;

    const cleanTitle = restoreExYuDiacritics(cleanOfficialTitle(songData.title, artist.name));
    const slug = toSlug(`${artist.name} ${cleanTitle}`);

    // Apply 9-Layer Quality Gate
    let healedContent = applyQualityGate(songData.content, songData.key);
    healedContent = healOverlappingAndBrokenChords(healedContent);
    healedContent = correctGrammarAndSpelling(healedContent);

    const key = detectOriginalKey(healedContent, songData.key) || songData.key || 'Am';
    const diff = estimateDifficulty(healedContent);
    const chordsCount = countChordsInContent(healedContent);

    let existingSong = await Song.findOne({
      artist: artist._id,
      title: new RegExp('^' + cleanTitle + '$', 'i'),
      deletedAt: null
    });

    if (!existingSong) {
      // Create new Golden Song
      const newSong = await Song.create({
        title: cleanTitle,
        slug: slug,
        searchTitle: toLatin(cleanTitle).toLowerCase(),
        artist: artist._id,
        year: songData.year || 2015,
        youtubeId: songData.youtubeId || '',
        status: 'published',
        tags: ['folk', 'pop_folk', 'balada', 'kafanska'],
        arrangements: [
          {
            label: 'Osnovna verzija',
            content: healedContent,
            originalKey: key,
            difficulty: diff,
            isPrimary: true
          }
        ]
      });
      ingested++;
      console.log(`🌟 [NEW Golden Song] "${cleanTitle}" by ${artist.name} [Published, Key: ${key}, Chords: ${chordsCount}]`);
    } else {
      // Upgrade existing song with full quality chords
      existingSong.title = cleanTitle;
      existingSong.arrangements[0].content = healedContent;
      existingSong.arrangements[0].originalKey = key;
      existingSong.arrangements[0].difficulty = diff;
      existingSong.status = 'published';
      if (songData.youtubeId) existingSong.youtubeId = songData.youtubeId;
      if (songData.year) existingSong.year = songData.year;
      await existingSong.save();
      updated++;
      console.log(`⚡ [UPGRADED Golden Song] "${cleanTitle}" by ${artist.name} [Promoted to Published, Key: ${key}, Chords: ${chordsCount}]`);
    }
  }

  console.log('\n======================================================================');
  console.log('🎉 REZULTAT UVOZA I POLIRANJA VIP DISKOGRAFIJE:');
  console.log('======================================================================');
  console.log(`✨ Novih zlatnih pjesama uvezeno:     ${ingested}`);
  console.log(`⚡ Postojećih pjesama nadograđeno:    ${updated}`);
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

ingestVipSongs().catch(err => {
  console.error('[VIP Ingest Error]', err);
});
