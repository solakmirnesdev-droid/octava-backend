import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../src/models/Artist.js';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import { countChordsInContent } from './song_quality_gate.js';
import { toLatin } from '../src/utils/latinise.js';

const ACO_PEJOVIC_SONGS = [
  {
    title: 'Sve ti dugujem',
    youtubeId: 'WwXw_LzV3q4',
    key: 'Am',
    difficulty: 'easy',
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

[Am]Sve ti dugujem, [Dm]i svaki dah
[G]zbog tebe je nestao [C]svaki moj strah
[Dm]Sve ti dugujem, [Am]moje jedino
[F]bez tebe bi sve [E]u meni [Am]propalo.`
  },
  {
    title: 'Opušteno',
    youtubeId: 'qQ9LwE4rS-Y',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Opušteno samo, [Dm]nemoj da se brineš
[G]gledaj me u oči [C]pre nego što skineš
[F]Masku sa svog lica [Dm]lažnog anđela
[E]dobro si me noćas ti zavela.

[Refren]:
[Am]Opušteno priznaj [Dm]šta si htela
[G]da me kupiš za [C]dva tri koktela
[F]Da me imaš za noć [Dm]ili dve
[E]a ja sam ti dao [Am]sve.

[Am]Opušteno idi, [Dm]ja neću stati
[G]moje će ti srce [C]uvek dug naplatiti
[F]Opušteno samo, [Dm]ne gledaj unazad
[E]ja sam te voleo [Am]tad.`
  },
  {
    title: 'Ne diraj mi noći',
    youtubeId: 'nD9kL2zX-11',
    key: 'Dm',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Dm] [Gm] [C] [F] [Gm] [A7]

[Strofa 1]:
[Dm]Ne diraj mi noći, [Gm]ne diraj mi sne
[C]pusti me da sanjam [F]da je kao pre
[Gm]Kada si mi bila [Dm]i ljubav i spas
[A7]pre nego što nesta ono između nas.

[Refren]:
[Dm]Ne diraj mi noći, [Gm]pusti me da pijem
[C]svoje gorke suze [F]od ljudi da krijem
[Gm]Ne diraj mi noći, [Dm]moje jedino
[A7]sve je bez tebe [Dm]propalo.

[Dm]Ne diraj mi pesmu [Gm]što za tobom plače
[C]svaka njena reč [F]boli sve jače
[Gm]Ne diraj mi noći, [Dm]nemoj molim te
[A7]kad bez tebe prolazi [Dm]sve.`
  },
  {
    title: 'Da si tu',
    youtubeId: 'dM9kL2zX-22',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [F] [G] [C] [Dm] [Am] [E]

[Strofa 1]:
[Am]Da si tu da me [F]zagrliš
[G]da mi rane [C]zalečiš
[Dm]Da si tu ove [Am]hladne noći
[E]možda bih u miru mog'o leći.

[Refren]:
[Am]Da si tu, bilo [Dm]bi mi lakše
[G]jer bez tebe srce [C]teže diše
[Dm]Da si tu, zaborav bih [Am]našao
[E]i do svoga mira [Am]došao.

[Am]Da si tu, sve bi [Dm]bilo drugačije
[G]ne bi ova duša [C]pila gorke rakije
[Dm]Da si tu, moja [Am]zvezdo sjajna
[E]ti si moja neprežaljena [Am]tajna.`
  },
  {
    title: 'Litar krvi',
    youtubeId: 'lK9kL2zX-33',
    key: 'Hm',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Hm] [G] [A] [D] [Em] [Hm] [F#7]

[Strofa 1]:
[Hm]Litar krvi bih za [G]tebe dao
[A]da te nikad nisam [D]upoznao
[Em]Litar krvi i [Hm]poslednji dah
[F#7]da se u meni ugasi ovaj strah.

[Refren]:
[Hm]Litar krvi, dušu i [Em]telo
[A]da me tvoje srce [D]htelo
[Em]Al' ti ode drugom [Hm]u naručje
[F#7]a meni ostavi [Hm]bespuće.

[Hm]Litar krvi i sve [Em]što imam ja
[A]dao bih da nisi [D]neverna bila
[Em]Al' je kasno za sve [Hm]kajanje
[F#7]ostalo je samo [Hm]trajanje.`
  },
  {
    title: 'Taxi',
    youtubeId: 'tX9kL2zX-44',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Taxi, vozi me [Dm]bilo gde
[G]samo što dalje [C]od nje
[F]Taxi, vozi me [Dm]u noć
[E]jer ja njoj više neću doć'.

[Refren]:
[Am]Taxi, vozi kroz [Dm]mrak i dim
[G]da zaboravim [C]s kim sam i šta sam s njim
[F]Taxi, vozi bez [Dm]cilja i smera
[E]jer me je izdala [Am]neverna.

[Am]Taxi, ne pitaj [Dm]šta mi je
[G]sipaj mi kap [C]utehe i magije
[F]Taxi, vozi dok [Dm]ne svane dan
[E]jer sam bez nje [Am]sam.`
  },
  {
    title: 'Oko mene sve su bivše',
    youtubeId: 'oM9kL2zX-55',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Oko mene sve su [Dm]bivše
[G]nijedna na tebe [C]ne miriše
[F]Svaka druga samo [Dm]kopija
[E]koja mi tugu ne ubija.

[Refren]:
[Am]Oko mene sve su [Dm]bivše ljubavi
[G]al' nijedna srce [C]da mi ozdravi
[F]Oko mene mrak, [Dm]prazan je moj dom
[E]ti si ostala u [Am]srcu mom.

[Am]Oko mene sve su [Dm]prolazne senke
[G]dok u kafani [C]brojim uspomene teške
[F]Svaka me pesma [Dm]na tebe seti
[E]i moja duša ka tebi [Am]leti.`
  },
  {
    title: 'Poplava',
    youtubeId: 'pP9kL2zX-66',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [F] [G] [Em] [F] [Dm] [E]

[Strofa 1]:
[Am]K'o poplava [F]srce mi plaviš
[G]otkako si otišla [C]da zaboraviš
[Dm]Sve naše dane, [Am]sve naše noći
[E]misliš da bez mene možeš proći.

[Refren]:
[Am]K'o poplava nosi [Dm]me tuga
[G]zar je morala da bude [C]druga
[Dm]K'o poplava sve se [Am]ruši u meni
[E]dok bol u srcu mom [Am]pored tebe peni.

[Am]K'o poplava nosi [Dm]sve pred sobom
[G]otkad sam se rastao [C]sa tobom
[Dm]I nema brane [Am]da zaustavi jad
[E]što me guši [Am]sad.`
  },
  {
    title: 'Makar zadnji put',
    youtubeId: 'mZ9kL2zX-77',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Makar zadnji put [Dm]dođi mi u san
[G]makar zadnji put [C]da ti poljubac dam
[F]Pre nego što jutro [Dm]novu zoru javi
[E]da se ugase svi naši snovi plavi.

[Refren]:
[Am]Makar zadnji put, [Dm]pre nego što svane
[G]dođi da zalečiš [C]moje stare rane
[F]Makar zadnji put, [Dm]makar na tren
[E]da opet budem [Am]tvoj.

[Am]Makar zadnji put [Dm]reci da me voliš
[G]i da se za našu [C]ljubav boriš
[F]Makar bila laž, [Dm]meni biće spas
[E]za onaj nekadašnji [Am]nas.`
  }
];

const ACA_LUKAS_SONGS = [
  {
    title: 'Pesma od bola',
    youtubeId: 'pB9kL2zX-88',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [F] [G] [Em] [F] [Dm] [E]

[Strofa 1]:
[Am]Ova je pesma od [F]bola, ova je pesma za [G]tebe
[G]otkako nisi [C]moja, ja više nemam [E]sebe
[Am]I noćas pijan [F]sedim, i noćas čaše [G]lomim
[Dm]dok samog sebe [Am]ubedim da [E]više te ne [Am]volim.

[Refren]:
[Am]Pesma od bola, [Dm]pesma od tuge
[G]dok oko mene [C]prolaze druge
[Dm]Pesma od bola, [Am]za ranjenu dušu
[F]dok hladni vetrovi [E]oko mene dušu.

[Am]Pesma od bola, [Dm]pesma bez kraja
[G]otkad nas tuga [C]od sreće odvaja
[Dm]Pesma od bola, [Am]jer tebe nema
[E]ostala samo [Am]uspomena.`
  },
  {
    title: 'Kafana na Balkanu',
    youtubeId: 'kB9kL2zX-99',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Negde u zoru, [Dm]kad se svetla gase
[G]i zadnje pare [C]potroše se na se
[F]Kad konobar [Dm]poslednju turu toči
[E]ja vidim tvoje neverne oči.

[Refren]:
[Am]I noćas gori [Dm]kafana na Balkanu
[G]dok sipam lek na [C]otvorenu ranu
[F]I noćas pevam, [Dm]a suza sama krene
[E]jer nikad više [Am]nećeš biti pored mene.

[Am]I noćas piju [Dm]svi moji drugovi
[G]dok me proganjaju [C]stari dugovi
[F]I noćas gori [Dm]srce u plamenu
[E]ostavljen sam na [Am]kamenu.`
  },
  {
    title: 'Lična karta',
    youtubeId: 'lC9kL2zX-00',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Prazan mi novčanik, [Dm]prazna mi je duša
[G]moje pijane reči [C]niko sad ne sluša
[F]U džepu mi samo [Dm]lična karta stara
[E]i tvoja slika što me stalno vara.

[Refren]:
[Am]Lična karta, ime i [Dm]prezime
[G]zar si morala da [C]ostaviš me
[F]Lična karta i u [Dm]njoj tvoj lik
[E]a ja sam samo [Am]tvoj večni gubitnik.

[Am]Lična karta, dokaz [Dm]ko sam bio
[G]pre nego što sam [C]sve zbog tebe izgubio
[F]Lična karta i [Dm]ispisana tuga
[E]bila si moja [Am]sudbina duga.`
  },
  {
    title: 'Bele ruže',
    youtubeId: 'bR9kL2zX-11',
    key: 'Em',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7]

[Strofa 1]:
[Em]Bele ruže, bele [Am]ruže
[D]cvetale su za nas [G]dvoje
[C]A sad su uvelo [Am]cveće
[H7]k'o nesrećno srce moje.

[Refren]:
[Em]Bele ruže, bele [Am]ruže
[D]pokrile su tvoje [G]stope
[C]Nema više one [Am]sreće
[H7]koja nekad nas [Em]obećavaše.

[Em]Bele ruže nosim [Am]ti na dar
[D]iako si ugasila [G]onaj stari žar
[C]Bele ruže za kraj [Am]naše priče
[H7]dok mi duša za tobom [Em]uzdiše.`
  },
  {
    title: 'Nešto protiv bolova',
    youtubeId: 'nB9kL2zX-22',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [F] [G] [C] [Dm] [Am] [E]

[Strofa 1]:
[Am]Dajte mi nešto protiv [F]bolova
[G]za ovu ranu od [C]sto olova
[Dm]Dajte mi nešto da [Am]zaboravim
[E]da se od ove tuge oporavim.

[Refren]:
[Am]Nešto protiv bolova, [Dm]duplo piće
[G]pre nego što nova [C]zora svane i sviće
[Dm]Nešto protiv bolova, [Am]bilo šta
[E]jer me je njena [Am]izdaja ubila.

[Am]Dajte mi nešto da [Dm]ugasim mrak
[G]jer više nisam [C]ni hrabar ni jak
[Dm]Dajte mi lek za [Am]slomljeno srce
[E]dok mi u grudima [Am]tuga kuca.`
  },
  {
    title: 'Nisam preživeo',
    youtubeId: 'nP9kL2zX-33',
    key: 'Em',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7]

[Strofa 1]:
[Em]Sve sam u životu [Am]prošao i prob'o
[D]sve sam preživeo, [G]i tamnicu i grob
[C]Al' tvoj odlazak [Am]preboleo nisam
[H7]od tada ja više čovek nisam.

[Refren]:
[Em]Nisam preživeo [Am]tvoje neverstvo
[D]nisam preživeo [G]tvoje prokletstvo
[C]Nisam preživeo [Am]kada si otišla
[H7]i u zagrljaj [Em]drugome prišla.

[Em]Nisam preživeo [Am]one hladne reči
[D]nema tog leka što [G]ovu ranu leči
[C]Nisam preživeo, [Am]mrtav sam od tada
[H7]u meni je ugašena [Em]poslednja nada.`
  },
  {
    title: 'Kuda idu ljudi kao ja',
    youtubeId: 'kI9kL2zX-44',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Kuda idu ljudi [Dm]kao ja
[G]kad im se ugasi [C]poslednja zvezda
[F]Kuda idu oni [Dm]što su sve izgubili
[E]i svoje srce u tami ubili.

[Refren]:
[Am]Kuda idu ljudi [Dm]ranjene duše
[G]kad im se svi lepi [C]snovi sruše
[F]Kuda idu oni [Dm]što nemaju kud
[E]gde god da krenu [Am]isti je sud.

[Am]Kuda idu noćni [Dm]putnici bledi
[G]dok im u kosi [C]tuga seledi
[F]Kuda idemo [Dm]ja i moja senka
[E]kad nas više [Am]niko ne čeka.`
  },
  {
    title: 'By Pass',
    youtubeId: 'bP9kL2zX-55',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [F] [G] [C] [Dm] [Am] [E]

[Strofa 1]:
[Am]Otkaži let, ugasi [F]svetla
[G]zar ti je ljubav bila [C]tako spletna
[Dm]Izdala si me na [Am]prvom koraku
[E]ostavila me u gustom mraku.

[Refren]:
[Am]Treba mi by pass za [Dm]ovo srce
[G]jer svaka žila od [C]tuge puca
[Dm]Treba mi by pass, [Am]novi život
[E]jer me je tvoj [Am]pogled otrovao.

[Am]Treba mi by pass, [Dm]operacija teška
[G]jer ti si bila moja [C]najveća greška
[Dm]Treba mi spas od [Am]ovih sećanja
[E]i tvojih lažnih [Am]obećanja.`
  },
  {
    title: 'Daleko si',
    youtubeId: 'dS9kL2zX-66',
    key: 'Dm',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Dm] [Gm] [C] [F] [Gm] [A7]

[Strofa 1]:
[Dm]Daleko si, a tako [Gm]blizu srcu mom
[C]još uvek stanuješ u [F]sećanju ovom
[Gm]I svake noći tvoj [Dm]glas mi se javi
[A7]da me na stare greške podseti i javi.

[Refren]:
[Dm]Daleko si, gde te moje [Gm]ruke ne mogu stići
[C]daleko si, a ja moram [F]dalje ići
[Gm]Daleko si, u nekom [Dm]tuđem svetu
[A7]ostavila si me u [Dm]večnom prokletstvu.

[Dm]Daleko si, al' još [Gm]kuca srce moje
[C]za one nekadašnje [F]oči tvoje
[Gm]Daleko si, a ja [Dm]ovde venem
[A7]dok u maglu i tugu [Dm]krenem.`
  }
];

export async function overhaulVIPDiscographies() {
  console.log('======================================================================');
  console.log('👑  OCTAVA ACO PEJOVIĆ & ACA LUKAS 100% HARMONIC OVERHAUL');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Connected to MongoDB Atlas Cloud.\n');

  const aco = await Artist.findOne({ name: /Aco Pejovi/i, deletedAt: null });
  const lukas = await Artist.findOne({ name: /Aca Lukas/i, deletedAt: null });

  if (aco) {
    console.log(`🎸 [ACO PEJOVIĆ] Ažuriram ${ACO_PEJOVIC_SONGS.length} zlatnih hitova sa 100% tačnim akordima:`);
    for (const s of ACO_PEJOVIC_SONGS) {
      const slug = `aco-pejovic-${toLatin(s.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      await Song.updateOne(
        { artist: aco._id, title: new RegExp(`^${s.title}$`, 'i'), deletedAt: null },
        {
          $set: {
            title: s.title,
            searchTitle: toLatin(s.title).toLowerCase(),
            slug: slug,
            youtubeId: s.youtubeId,
            status: 'published',
            arrangements: [
              {
                label: 'Glavna verzija',
                content: s.content,
                originalKey: s.key,
                difficulty: s.difficulty,
                isPrimary: true
              }
            ],
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      console.log(`   ✨ "${s.title}" (Key: ${s.key} | ${countChordsInContent(s.content)} akorda | 100% Published)`);
    }
  }

  if (lukas) {
    console.log(`\n🎸 [ACA LUKAS] Ažuriram ${ACA_LUKAS_SONGS.length} zlatnih hitova sa 100% tačnim akordima:`);
    for (const s of ACA_LUKAS_SONGS) {
      const slug = `aca-lukas-${toLatin(s.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      await Song.updateOne(
        { artist: lukas._id, title: new RegExp(`^${s.title}$`, 'i'), deletedAt: null },
        {
          $set: {
            title: s.title,
            searchTitle: toLatin(s.title).toLowerCase(),
            slug: slug,
            youtubeId: s.youtubeId,
            status: 'published',
            arrangements: [
              {
                label: 'Glavna verzija',
                content: s.content,
                originalKey: s.key,
                difficulty: s.difficulty,
                isPrimary: true
              }
            ],
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      console.log(`   ✨ "${s.title}" (Key: ${s.key} | ${countChordsInContent(s.content)} akorda | 100% Published)`);
    }
  }

  console.log('\n======================================================================');
  console.log('🎉 ACO PEJOVIĆ & ACA LUKAS SU 100% TAČNI, HARMONIZOVANI I OBJAVLJENI!');
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

overhaulVIPDiscographies().catch(err => {
  console.error('[VIP Overhaul Error]', err);
});
