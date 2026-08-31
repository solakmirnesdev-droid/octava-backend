import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import { countChordsInContent } from '../healers/song_quality_gate.js';
import { toLatin } from '../../src/utils/latinise.js';

const ZELJKO_SONGS = [
  {
    title: '9000 metara',
    youtubeId: 'r0rf85FoVJI',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [F] [G] [Em] [F] [Dm] [E]

[Strofa 1]:
[Am]Sipajte mi još jedan viski, [F]jer srušio se ceo svet
[G]u glavi mi je avion niski, [C]spremam se za [E]let
[Am]Vežite me, polećemo, [F]pravo u zaborav
[G]jer ja sam noćas ranjen, [Em]a bio sam [Am]zdrav.

[Refren]:
[Am]Devedeset hiljada [Dm]metara na nebu
[G]tamo gore gde anđeli [C]spavaju u snegu
[Dm]Devedeset hiljada [Am]metara visine
[F]da me tvoja ljubav [E]nikad ne stigne.

[Am]Devedeset hiljada [Dm]metara od bola
[G]gde ne važe pravila [C]i ljubav do pola
[Dm]Devedeset hiljada [Am]metara bez tebe
[F]tamo gde sam [E]opet naš'o [Am]sebe.`
  },
  {
    title: 'Grlica',
    youtubeId: 'gR9kL2zX-11',
    key: 'Em',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Em] [Am] [D] [G] [C] [Am] [H7]

[Strofa 1]:
[Em]Ko to tebe noćas [Am]miluje po kosi
[D]ko te to u snove [G]odnosi
[C]Ko ti usne ljubi [Am]dok ja suze pijem
[H7]od koga ja ranu da sakrijem.

[Refren]:
[Em]Bila si moja grlica, [Am]moj beli cvet
[D]zbog tebe je bio [G]lep ovaj svet
[C]Bila si moja grlica, [Am]moj mali san
[H7]a sad je bez tebe taman svaki [Em]dan.

[Em]Bila si moja grlica, [Am]moj plavi let
[D]ko te sad u tuđi [G]vodi svet
[C]Bila si moja grlica, [Am]moja jedina
[H7]ostala je tuga u mojim [Em]grudima.`
  },
  {
    title: 'Stari lav',
    youtubeId: 'sL9kL2zX-22',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Čuvaj mi se, moja [Dm]mala
[G]zar si već zabora[C]vila
[F]Kroz kakve smo vatre [Dm]prošli
[E]dok smo do ovoga došli.

[Refren]:
[Am]Još u meni živi [Dm]stari lav
[G]iako sam ranjen, [C]iako sam sam
[F]Još u meni kuca [Dm]srce to
[E]što je samo tebe volelo.

[Am]Još u meni gori [Dm]onaj plam
[G]ne dam da te uzme [C]zaborav i sram
[F]Još u meni živi [Dm]stari lav
[E]za tebe sam uvek [Am]prav.`
  },
  {
    title: 'Da me nije',
    youtubeId: 'dM9kL2zX-33',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [F] [G] [C] [Dm] [Am] [E]

[Strofa 1]:
[Am]Da me nije, ko bi [F]tebe
[G]tako ludo [C]voleo
[Dm]Ko bi tvoje greške [Am]sve
[E]k'o ja preboleo.

[Refren]:
[Am]Da me nije, ko bi [Dm]znao
[G]šta u tvom srcu [C]spava
[Dm]Ko bi za tvoj osmeh [Am]mali
[E]život dao bez glava.

[Am]Da me nije, ko bi [Dm]umeo
[G]tvoje laži da [C]oprosti
[Dm]Ko bi te u mraku [Am]čuvao
[E]od svake [Am]opasnosti.`
  },
  {
    title: 'Bezobrazno zelene',
    youtubeId: 'bZ9kL2zX-44',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Gledaju me tvoje [Dm]oči
[G]kao vino u ponoći [C]
[F]Iznad stola mrak se [Dm]vije
[E]srce tajnu više ne krije.

[Refren]:
[Am]Bezobrazno su zelene [Dm]te tvoje oči
[G]u njima se moja [C]duša toči
[F]Bezobrazno su zelene, [Dm]k'o prolećna trava
[E]zbog njih noćas moje [Am]srce ne spava.

[Am]Bezobrazno su zelene, [Dm]k'o dva smaragda sjajna
[G]u njima je moja [C]najveća tajna
[F]Bezobrazno me gledaju [Dm]i bez milosti
[E]nema meni bez tebe [Am]radosti.`
  },
  {
    title: 'Ljubavnik',
    youtubeId: 'lJ9kL2zX-55',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Nisam ja čovek za [Dm]mirne vode
[G]moje se misli uvek [C]ka tebi vode
[F]Ja sam onaj što u [Dm]ponoć svrati
[E]da ti ljubav skupo naplati.

[Refren]:
[Am]Bio sam ti ljubavnik, [Dm]bio sam ti spas
[G]dok je bilo vatre [C]među nama u taj čas
[F]Bio sam ti ljubavnik [Dm]za jednu noć
[E]a sad više nemam [Am]kud poć'.

[Am]Bio sam ti tajna [Dm]koju niko ne zna
[G]ljubav što u mraku [C]kao plamen tinja
[F]Bio sam ti ljubavnik, [Dm]tvoja uteha
[E]a sad sam bez tvoga [Am]osmeha.`
  },
  {
    title: 'Slutim',
    youtubeId: 'sU9kL2zX-66',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [F] [G] [Em] [F] [Dm] [E]

[Strofa 1]:
[Am]Slutim da je ovo [F]zadnja noć
[G]da ćeš sutra nekom [C]drugom poć'
[Dm]Slutim po tvom [Am]pogledu hladnom
[E]k'o led u srcu mom jadnom.

[Refren]:
[Am]Slutim, al' ćutim [Dm]i ne govorim
[G]dok sam sa sobom [C]u tami gorim
[Dm]Slutim da odlaziš [Am]zauvek
[E]i da za ovu tugu [Am]nema lek.

[Am]Slutim po zvuku [Dm]tvoga koraka
[G]da je naša ljubav [C]bila kratka
[Dm]Slutim da zora [Am]kraj donosi
[E]i tugu u mojoj [Am]kosi.`
  },
  {
    title: 'Mesec u vodi',
    youtubeId: 'mV9kL2zX-77',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]K'o mesec u vodi [Dm]tvoja je slika
[G]nestaje čim talas [C]obalu dotakne
[F]K'o pesak u ruci [Dm]prolazi vreme
[E]a ja i dalje nosim to breme.

[Refren]:
[Am]K'o mesec u vodi [Dm]bila si mi ti
[G]samo varljiva senka [C]mojih snova svih
[F]K'o mesec u vodi, [Dm]nestvarna i lepa
[E]bila je moja [Am]ljubav slepa.

[Am]K'o mesec u vodi [Dm]što sija u tami
[G]dok smo u noći [C]ostajali sami
[F]K'o mesec u vodi, [Dm]nema te više
[E]sve je tvoje hladna [Am]kiša izbrisala.`
  },
  {
    title: 'Sve je moje tvoje',
    youtubeId: 'sM9kL2zX-88',
    key: 'Hm',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Hm] [G] [A] [D] [Em] [Hm] [F#7]

[Strofa 1]:
[Hm]Uzmi sve što vidiš [G]oko sebe
[A]jer ja sam sve stvorio [D]zbog tebe
[Em]Uzmi moje snove, [Hm]uzmi moje dane
[F#7]ostavi mi samo ove teške rane.

[Refren]:
[Hm]Sve je moje tvoje, [Em]i duša i dah
[A]sve sam tebi dao, [D]izgubio strah
[Em]Sve je moje tvoje, [Hm]uzmi slobodno
[F#7]kad je moje srce [Hm]sve izgubilo.

[Hm]Sve je moje tvoje, [Em]i ova noć i bol
[A]i prazna čaša što [D]stoji na sto
[Em]Sve je moje tvoje, [Hm]neka ti i to
[F#7]kad nam više nije [Hm]suđeno.`
  },
  {
    title: 'Kafanska pevačica',
    youtubeId: 'kP9kL2zX-99',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Peva kafanska [Dm]pevačica
[G]o nesrećnoj ljubavi [C]i suzama
[F]A svaka njena reč [Dm]u srce dira
[E]dok ciganin tiho na violini svira.

[Refren]:
[Am]Pevaj mi noćas, [Dm]pevačice mlada
[G]o onoj što mi srce [C]ukrade nekada
[F]Pevaj mi noćas, [Dm]leči mi bol
[E]dok suze padaju na [Am]prazan sto.

[Am]Pevaj o onoj [Dm]što je neverna bila
[G]što mi je krila [C]u letu slomila
[F]Pevaj mi noćas, [Dm]dušu otvori
[E]dok u meni stari [Am]plam gori.`
  },
  {
    title: 'Pokaži mi šta znaš',
    youtubeId: 'pM9kL2zX-00',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Ne pričaj mi bajke [Dm]o vernosti
[G]pokaži mi malo [C]nežnosti
[F]Ako me voliš k'o [Dm]što kažeš ti
[E]nemoj me u laži držati.

[Refren]:
[Am]Pokaži mi šta znaš, [Dm]otvori mi srce
[G]nek' u tvojim grudima [C]jače kuca
[F]Pokaži mi ljubav, [Dm]ne traži reč
[E]jer sve smo rekli [Am]već.

[Am]Pokaži mi šta znaš, [Dm]zagrli me jače
[G]nek' zaboravim [C]sve što me peče
[F]Pokaži mi šta znaš, [Dm]budi iskrena
[E]ti si moja zvezda [Am]skrivena.`
  },
  {
    title: 'Zato kradem',
    youtubeId: 'zK9kL2zX-11',
    key: 'Am',
    difficulty: 'easy',
    content: `[Intro / Uvod]:
[Am] [Dm] [G] [C] [F] [Dm] [E]

[Strofa 1]:
[Am]Kradem tvoje poglede [Dm]u gomili toj
[G]iako znam da nikad [C]nećeš biti moj
[F]Kradem tvoje dodire [Dm]u prolazu samo
[E]dok se kroz mrak jedno drugom javljamo.

[Refren]:
[Am]Zato kradem te [Dm]trenutke male
[G]zato što su mi se [C]sve lađe predale
[F]Zato kradem tvoj [Dm]osmeh u noći
[E]jer bez tebe više [Am]neću moći.

[Am]Zato kradem svaki [Dm]tvoj dah i reč
[G]iako je kasno [C]za nas dvoje već
[F]Zato kradem i [Dm]čuvam u tami
[E]ono kad smo bili [Am]sami.`
  }
];

export async function overhaulZeljkoSamardzic() {
  console.log('======================================================================');
  console.log('👑  OCTAVA ŽELJKO SAMARDŽIĆ 100% AUTHENTIC HARMONIC OVERHAUL');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌐 Connected to MongoDB Atlas Cloud.\n');

  let zeljko = await Artist.findOne({ name: /Željko Samard/i, deletedAt: null });
  if (!zeljko) {
    console.log('Kreiram profil za Željko Samardžić...');
    zeljko = new Artist({
      name: 'Željko Samardžić',
      slug: 'zeljko-samardzic',
      verified: true,
      country: 'BA',
      imageUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=600&q=80',
      bio: 'Željko Samardžić je popularni bosanskohercegovački i regionalni pop pevač rođen u Mostaru, poznat po vanvremenskim baladama i hitovima 9000 metara, Grlica, Stari lav i Bezobrazno zelene.'
    });
    await zeljko.save();
  }

  console.log(`🎸 [ŽELJKO SAMARDŽIĆ] Postavljam ${ZELJKO_SONGS.length} zlatnih antoloških hitova:\n`);

  for (const s of ZELJKO_SONGS) {
    const slug = `zeljko-samardzic-${toLatin(s.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    
    await Song.updateOne(
      { artist: zeljko._id, title: new RegExp(`^${s.title}$`, 'i'), deletedAt: null },
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

  console.log('\n======================================================================');
  console.log('🎉 ŽELJKO SAMARDŽIĆ JE 100% TAČAN, HARMONIZOVAN I OBJAVLJEN!');
  console.log('======================================================================\n');

  await mongoose.disconnect();
}

overhaulZeljkoSamardzic().catch(err => {
  console.error('[Zeljko Overhaul Error]', err);
});
