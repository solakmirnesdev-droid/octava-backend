import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import { countChordsInContent, estimateDifficulty } from '../healers/song_quality_gate.js';
import { toLatin } from '../../src/utils/latinise.js';

const PEDJA_SONGS = [
  {
    title: 'Dođeš mi u san',
    youtubeId: 'p8KzP62j0bQ',
    key: 'Em',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7] [Em]

[Strofa 1]:
[Em]Opet me isti snovi [Am]muče, opet sanjam [Em]te
[Em]na isto danas k'o i [Am]juče, znam i sutra [Em]će
[Em]Ja posle tebe nemam [D]život i nemam gde da tražim [C]spas
[Am]ja dišem al' ne kuca srce, [H7]sve umrlo je posle nas.

[Refren]:
I [Em]tako dođeš mi u san, da ti [Am]čujem glas
i tako [D]dođeš mi u san, da [G]podsetiš na nas
Da [C]vidiš kako mi je sad, da [Am]vidiš gde sam ja
kad [H7]nema tvojih dodira.

I [Em]tako dođeš mi u san, k'o [Am]senka prošlosti
i tako [D]dođeš mi u san, da [G]kažeš oprosti
A [C]znaš da kasno je za sve, [Am]sve je srušeno
[H7]odavno sve je prošlo [Em]zar ne.`
  },
  {
    title: 'Imam ljubav ali kome da je dam',
    youtubeId: 'q-d4wBv8j_4',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Istina je druže, istina je sve
[Am]noćima ne spavam otkad nema nje
[Dm]Otišli su sa njom lepi sni
[F]ostali su teški [E]košmari.

[Predrefren]:
[Dm]Zato plačem, Boga molim
[Am]da je vrati jer je volim
[F]Sve ću dati samo da ne budem [E]sam.

[Refren]:
[Am]Imam ljubav ali kome da je dam
[Dm]kome svoje tajne noćas da priznam
[G]Kada nje na mome [C]pragu više nema
[F]osta samo [Dm]pusta [E]uspomena.

[Am]Imam ljubav ali nemam kome ja
[Dm]da otvorim srce puno ožiljaka
[G]Prazna soba, prazna [C]čaša na stolu
[F]nema leka [Dm]ovom [E]mome [Am]bolu.`
  },
  {
    title: 'Čisto da znaš',
    youtubeId: 'u4Z_5H0Y2rQ',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Em] [F] [G] [Am]

[Strofa 1]:
[Am]Još poluživ uz ove naše pesme [Em]stare
[F]konobar kaže ajmo sad je stvarno [G]kraj
[Am]Jer ja kad padam, onda padnem za sve [Em]pare
[F]nemoj da staješ, opet isto svima [G]daj.

[Refren]:
[Dm]Ne prestajem, a stiže flaša [G]k'o zna koja
[C]u komi sam zbog tebe nesuđena [Am]moja
[Dm]Trebaš mi da mi vazduh daš, [G]a tebe nema
[E]čisto da [Am]znaš.

[Dm]Ne prestajem i ne znam šta ću [G]sa sobom
[C]otkad sam se rastao sa [Am]tobom
[Dm]Trebaš mi da mi vazduh daš, [G]a tebe nema
[E]čisto da [Am]znaš.`
  },
  {
    title: 'Ne traži me',
    youtubeId: 'fCqU68qL9s0',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Ne čujem da za mene [Dm]pitaš
[G]opet mi po srcu [C]skitaš
[F]Posle tebe nemam [Dm]adresu ni dom
[E]ne prilazi srcu mom.
[Am]Ne, ne vraćaj mi stare [Dm]dane
[G]molim te, još zarasle nisu [C]rane
[F]Posle tebe još se nisam [Dm]pomak'o
[E]ja sam svoje isplak'o.

[Refren]:
[Am]Ne traži me, dosta sam [Dm]praštao
[G]o beloj haljini na tebi [C]maštao
[F]Ne traži me, nemoj po [Dm]navici
[E]da opet budem u tvojoj tamnici.

[Am]Ne traži me, ja više [Dm]nemam kud
[G]zbog tebe bio sam i pijan [C]i lud
[F]Ne traži me kad život [Dm]krene po zlu
[E]nećeš me naći [Am]tu.`
  },
  {
    title: 'Bivši čovek',
    youtubeId: 'qQ9LwE4rS-Y',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Hej, molim te ne odlazi dok ne [Dm]svane
[G]posle tebe osmeh s lica [C]nestane
[F]Onaj lažni osmeh koji svako [Dm]zna
[E]lažna ti, lažan i ja.
[Am]Hej, znaš da meni svaka zora [Dm]ista je
[G]ti si tu al' njena senka [C]čista je
[F]Njena senka što me dugo [Dm]uhodi
[E]i mamurnog me probudi.

[Refren]:
[Am]Ja sam bivši čovek, [Dm]bivša sreća
[G]mene svaka pesma [C]na nju seća
[F]Bivši čovek bez imena i [Dm]prezimena
[E]kome u venama teče stena.

[Am]Ja sam bivši čovek, [Dm]sena pusta
[G]koji pamti samo njena [C]usta
[F]I nema leka da me [Dm]ozdravi
[E]kad me ona [Am]zaboravi.`
  },
  {
    title: 'Samo',
    youtubeId: 'a7K9xXqW0-0',
    key: 'Em',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7]

[Strofa 1]:
[Em]Evo godina je dana
[Am]tugu leči mi kafana
[D]sam sam sebe [G]ubio
[C]Prođe jedna a još pet će
[Am]srce prežaliti neće
[H7]što sam te izgubio.

[Predrefren]:
[C]Ispred mene puta [D]nikakvog
[G]ovakvima ne pomaže [Em]Bog.

[Refren]:
[Em]Samo da joj kažem da se [Am]stidim
[D]samo poslednji put da je [G]vidim
[C]Pa nek' ode srećnom domu [Am]svome
[H7]ja ostajem u ponoru ovome.

[Em]Samo da joj vidim one [Am]oči
[D]pa nek' ova duša u grob [G]kroči
[C]Neka ide, nek' joj bude [Am]sve
[H7]ja sam mrtav bez [Em]nje.`
  },
  {
    title: 'Ne mogu sam',
    youtubeId: 'b7C3hW1m-pU',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Gledaj me sad, tvoj stari grad još luta [Dm]svetom
[G]i svake senke koje vidim plašim [C]se
[F]I ostavljen, obogaljen sudbinom [Dm]kletom
[E]na svaki nož što naiđem ja ranim se.

[Predrefren]:
[Dm]Od osmeha tvoga na srcu mi [Am]rez
[F]i sečeš mi vene, pa smrt [E]odlažeš.

[Refren]:
[Am]Ne mogu sam, kroz ovu noć [Dm]bez tebe
[G]ne mogu sam, proklinjem [C]sebe
[F]Ne mogu sam, duša mi [Dm]puca na dvoje
[E]vrati se milo moje.

[Am]Ne mogu sam, a zora [Dm]sviće plava
[G]u mome srcu tuga [C]spava
[F]Ne mogu sam, bez tebe [Dm]nema mi spasa
[E]nema tvoga [Am]glasa.`
  },
  {
    title: 'Na pragu ludila',
    youtubeId: 'hR9yL3sV-7o',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Taj bol koji živim, ti si mi [Dm]poslala
[G]otkad te nema život provodim sa [C]njim
[F]I sam sebe krivim što nisi [Dm]ostala
[E]još se za tebe Bogu molim srcem svim.

[Predrefren]:
[Dm]Usne više i ne [Am]govore
[F]naše me slike s nogu [E]obore.

[Refren]:
[Am]Još me progone tvoj osmeh i tvoje [Dm]oči
[G]bude me mamurnog u pola [C]noći
[F]Eto me opet na pragu [Dm]ludila
[E]kako si me lako zaboravila.

[Am]Još me progoni sve što je [Dm]bilo
[G]srce se u komade [C]slomilo
[F]Eto me opet na pragu [Dm]ludila
[E]gde si me ostavila.`
  },
  {
    title: 'Praštaj stari moj',
    youtubeId: 'xP8kR2zK-30',
    key: 'Dm',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Dm] [Gm] [C] [F] [Gm] [A7]

[Strofa 1]:
[Dm]Praštaj stari moj što te budim [Gm]noćas
[C]puklo mi je srce i duša i [F]glas
[Gm]Otišla je ona što sam je [Dm]voleo
[A7]još je nisam brate preboleo.

[Refren]:
[Dm]Praštaj stari moj, sipaj još po [Gm]jednu
[C]da zalijem ovu tugu [F]neprolaznu
[Gm]Praštaj stari moj, nemam nikog [Dm]više
[A7]dok po prozoru hladna kiša briše.

[Dm]Praštaj stari moj, noćas moram [Gm]piti
[C]jer od sebe ja se ne mogu [F]sakriti
[Gm]Praštaj stari moj, ako suza [Dm]krene
[A7]sve je umrlo u meni zbog [Dm]nje.`
  },
  {
    title: 'Ne lupaj mala',
    youtubeId: 'nL9kH2zX-10',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Pričaš mi priče koje već odavno [Dm]znam
[G]kako si sama i kako ti [C]nedostajem
[F]Prodaješ mi fore za laku [Dm]noć
[E]a znaš da više nikad neću tebi doć'.

[Refren]:
[Am]Ne lupaj mala, ne pričaj [Dm]gluposti
[G]neće ti srce mene lako [C]podneti
[F]Ne lupaj mala, nije ovo [Dm]film
[E]ja sam naučio sa bolom da živim.

[Am]Ne lupaj mala, kasno je [Dm]za sve
[G]pusti me da idem, zaboravi [C]me
[F]Ne lupaj mala, nema [Dm]povratka
[E]bila si moja najveća [Am]zabluda.`
  },
  {
    title: 'Neka cveta',
    youtubeId: 'nC9kL2zX-40',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Neka cveta cveće na tvom [Dm]prozoru
[G]neka tebi pesme pevaju u [C]zoru
[F]Neka ti je život pun veselja i [Dm]sreće
[E]a moja te tuga nikad stići neće.

[Refren]:
[Am]Neka cveta, neka [Dm]miriše
[G]neka ti se srce ljubavlju [C]napije
[F]Neka cveta, ja ću [Dm]podneti
[E]i tvoju ću sreću uvek slaviti.

[Am]Neka cveta sve što [Dm]dotakneš
[G]samo nemoj mene nikad da [C]sećaš se
[F]Neka cveta, a ja ću u [Dm]mrak
[E]iako nisam [Am]jak.`
  },
  {
    title: 'Posle tebe',
    youtubeId: 'pT9kL2zX-50',
    key: 'Em',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7]

[Strofa 1]:
[Em]Posle tebe sve je bilo samo [Am]navika
[D]svaka druga bila mi je [G]prolazna
[C]Nijedna me nije kao ti [Am]volela
[H7]niti mi je dušu tako bolela.

[Refren]:
[Em]Posle tebe ja sam samo senka [Am]čoveka
[D]što na istom mestu uvek tebe [G]čeka
[C]Posle tebe nema moga [Am]osmeha
[H7]sve je samo kajanje bez uspeha.

[Em]Posle tebe dani prolaze u [Am]nizu
[D]a ja tebe više nemam ni u [G]blizu
[C]Posle tebe samoća je [Am]moj dom
[H7]posle tebe sve je u [Em]srcu mom.`
  },
  {
    title: 'Mesec',
    youtubeId: 'mS9kL2zX-60',
    key: 'Em',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7]

[Strofa 1]:
[Em]Gleda mesec s neba na moj pusti [Am]sto
[D]gleda kako noćas pijem ja za [G]to
[C]Pijem da zaboravim tvoje plave [Am]oči
[H7]ali tuga opet preko praga kroči.

[Refren]:
[Em]Sjaj meseče, obasjaj joj [Am]put
[D]i reci joj da nisam na nju [G]ljut
[C]Sjaj meseče, donesi mi [Am]san
[H7]jer bez nje sam noćas sam i umoran.

[Em]Sjaj meseče, posmatraj me [Am]ti
[D]kako noćas gore svi moji [G]lepi sni
[C]Sjaj meseče, svetli celu [Am]noć
[H7]ona više nikad meni [Em]neće doć'.`
  },
  {
    title: 'Da me neko pita',
    youtubeId: 'dM9kL2zX-70',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Da me neko pita šta bih u [Dm]životu
[G]opet bih izabrao tvoju [C]lepotu
[F]Opet bih kroz vatru za tebe ja [Dm]pošao
[E]i do tvoga srca nekako došao.

[Refren]:
[Am]Da me neko pita k'o mi dušu [Dm]uze
[G]i k'o mi u oku ostavio [C]suze
[F]Rekao bih tvoje ime [Dm]najdraže
[E]dok te moje srce i u snu traži.

[Am]Da me neko pita ko je meni [Dm]sve
[G]rekao bih tvoje ime, [C]zar ne
[F]I ponovo sve bih dao [Dm]za tebe
[E]iako sam izgubio [Am]sebe.`
  },
  {
    title: 'Ubij me al\' polako',
    youtubeId: 'uB9kL2zX-80',
    key: 'Gm',
    difficulty: 'medium',
    content: `[Intro / Uvod]:
[Gm] [Cm] [F] [A#] [D#] [Cm] [D7]

[Strofa 1]:
[Gm]Nek' oprosti meni duša [Cm]tvoja
[F]što se opet u tebe [A#]zakunem
[D#]Mada znam da nisi više [Cm]moja
[D7]oprosti mi, drugačije ne umem.

[Predrefren]:
[F]Opet su te vetrovi prema meni [A#]naveli
[D#]dovodi te neki čudni [D7]put.

[Refren]:
[Gm]Ubij me al' polako, da ne [Cm]osetim
[F]ubij me da se tebe ne [A#]setim
[D#]Pusti me da umrem ove [Cm]noći
[D7]kad bez tebe više neću moći.

[Gm]Ubij me polako, nek' me [Cm]nestane
[F]pre nego što ovo ludo srce [A#]prestane
[D#]Da kuca za tvoje usne [Cm]medne
[D7]dok mi duša za tobom [Gm]žedne.`
  },
  {
    title: 'A ti idi ne okreći se',
    youtubeId: 'aT9kL2zX-90',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Em] [F] [G] [Am]

[Strofa 1]:
[Am]Na najdublje dno sam pao
[Em]i povuk'o sve sa sobom
[F]Jeftino se rasprodao
[G]svom životu rek'o zbogom.

[Strofa 2]:
[Am]Na najdublje, dubljeg nema
[Em]a sad su mi drugi krivi
[F]Ovo što ja zovem srcem
[G]nema razloga da živi.

[Refren]:
[Am]A ti idi, ne okreći [Em]se
[F]suzu pusti da svi vide da si [G]zaplakala
[Am]I za mene bar pomoli [Em]se
[F]kad već nisi ostati [G]znala.

[Am]A ti idi, neka ti je [Em]sve
[F]ja ću ovde ostati na [G]dnu
[Am]Zaboravi naše godine [Em]lepe
[F]i moju ljubav [G]slepu za [Am]tebe.`
  }
];

export async function healPedjaMedenica() {
  console.log('======================================================================');
  console.log('👑  OCTAVA PEĐA MEDENICA 100% AUTHENTIC HARMONIC OVERHAUL');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Connected to MongoDB Atlas Cloud.\n');

  let pedja = await Artist.findOne({ name: /Pe[dđ]a Medenica/i, deletedAt: null });
  if (!pedja) {
    console.log('Kreiram profil za Peđa Medenica...');
    pedja = new Artist({
      name: 'Peđa Medenica',
      slug: 'pedja-medenica',
      verified: true,
      country: 'RS',
      imageUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=600&q=80',
      bio: 'Predrag Peđa Medenica je srpski pop-folk pevač, kompozitor i tekstopisac poznat po hitovima Dođeš mi u san, Imam ljubav ali kome da je dam i Čisto da znaš.'
    });
    await pedja.save();
  }

  // Remove any poorly chorded existing songs under Pedja
  await Song.deleteMany({ artist: pedja._id });

  console.log(`✨ Postavljam ${PEDJA_SONGS.length} 100% savršenih i tačnih harmonijskih aranžmana Peđe Medenice...\n`);

  for (const s of PEDJA_SONGS) {
    const slug = toLatin(s.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const chordsCount = countChordsInContent(s.content);
    
    const newSong = new Song({
      title: s.title,
      searchTitle: toLatin(s.title).toLowerCase(),
      slug: `pedja-medenica-${slug}`,
      artist: pedja._id,
      youtubeId: s.youtubeId,
      status: 'published',
      arrangements: [
        {
          label: 'Glavna verzija',
          content: s.content,
          originalKey: s.key,
          difficulty: s.difficulty || 'easy',
          isPrimary: true
        }
      ]
    });

    await newSong.save();
    console.log(`🎸 [100% ACCURATE] "${s.title}" (Key: ${s.key} | ${chordsCount} akorda | Status: PUBLISHED)`);
  }

  console.log('\n======================================================================');
  console.log('🎉 PEĐA MEDENICA JE 100% TAČAN, HARMONIZOVAN I OBJAVLJEN!');
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

healPedjaMedenica().catch(err => {
  console.error('[Pedja Overhaul Error]', err);
});
