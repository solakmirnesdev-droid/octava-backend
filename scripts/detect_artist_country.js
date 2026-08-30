import { toLatin } from '../src/utils/latinise.js';

export const COMPREHENSIVE_ARTIST_MAP = {
  // --- BOSNA I HERCEGOVINA (BA) ---
  'dino merlin': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'halid beslic': { c: 'BA', o: 'Knežina / Sarajevo, Bosna i Hercegovina' },
  'hari mata hari': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'bijelo dugme': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'plavi orkestar': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'crvena jabuka': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'indexi': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'zabranjeno pusenje': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'zdravko colic': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'kemal monteno': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'serif konjevic': { c: 'BA', o: 'Sanica, Bosna i Hercegovina' },
  'hanka paldum': { c: 'BA', o: 'Čajniče / Sarajevo, Bosna i Hercegovina' },
  'haris dzinovic': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'safet isovic': { c: 'BA', o: 'Bileća / Sarajevo, Bosna i Hercegovina' },
  'enes begovic': { c: 'BA', o: 'Visoko, Bosna i Hercegovina' },
  'dubioza kolektiv': { c: 'BA', o: 'Zenica / Sarajevo, Bosna i Hercegovina' },
  'letu stuke': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'divlje jagode': { c: 'BA', o: 'Bihać / Sarajevo, Bosna i Hercegovina' },
  'aldino': { c: 'BA', o: 'Jajce, Bosna i Hercegovina' },
  'al dino': { c: 'BA', o: 'Jajce, Bosna i Hercegovina' },
  'bombaj stampa': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'amel curic': { c: 'BA', o: 'Gračanica, Bosna i Hercegovina' },
  'mirza selimovic': { c: 'BA', o: 'Srebrenik, Bosna i Hercegovina' },
  'davorin popovic': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'himzo polovina': { c: 'BA', o: 'Mostar, Bosna i Hercegovina' },
  'silvana armenulic': { c: 'BA', o: 'Doboj, Bosna i Hercegovina' },
  'nedzad salkovic': { c: 'BA', o: 'Tuzla, Bosna i Hercegovina' },
  'osman hadzic': { c: 'BA', o: 'Cazin, Bosna i Hercegovina' },
  'mile kitic': { c: 'BA', o: 'Derventa, Bosna i Hercegovina' },
  'fazlija': { c: 'BA', o: 'Bihać, Bosna i Hercegovina' },
  'mahir palos': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'jadranka stojakovic': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'neda ukraden': { c: 'BA', o: 'Imotski / Sarajevo' },
  'valentino': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'nervozni postar': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'pro arte': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'regina': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'zoster': { c: 'BA', o: 'Mostar, Bosna i Hercegovina' },
  'helem nejse': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'sevdalinke': { c: 'BA', o: 'Bosna i Hercegovina' },
  'kemal malovcic': { c: 'BA', o: 'Sanski Most, Bosna i Hercegovina' },
  'lapsus band': { c: 'BA', o: 'Kalesija / Tuzla, Bosna i Hercegovina' },
  'mostar sevdah reunion': { c: 'BA', o: 'Mostar, Bosna i Hercegovina' },
  'divanhana': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'damir imamovic': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'bozo vreco': { c: 'BA', o: 'Foča, Bosna i Hercegovina' },
  'elvir lakovic laka': { c: 'BA', o: 'Goražde, Bosna i Hercegovina' },
  'laka': { c: 'BA', o: 'Goražde, Bosna i Hercegovina' },
  'siki': { c: 'BA', o: 'Bosna i Hercegovina' },
  'buba corelli': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'jジュala brat': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'jaka brat': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'jala brat': { c: 'BA', o: 'Sarajevo, Bosna i Hercegovina' },
  'frenkie': { c: 'BA', o: 'Bijeljina / Tuzla, Bosna i Hercegovina' },
  'edo maajka': { c: 'BA', o: 'Brčko / Zagreb' },
  'amadeus band': { c: 'RS', o: 'Leskovac, Srbija' },

  // --- SRBIJA (RS) ---
  'toma zdravkovic': { c: 'RS', o: 'Aleksinac / Leskovac, Srbija' },
  'saban saulic': { c: 'RS', o: 'Šabac, Srbija' },
  'riblja corba': { c: 'RS', o: 'Beograd, Srbija' },
  'miroslav ilic': { c: 'RS', o: 'Mrčajevci, Srbija' },
  'lepa brena': { c: 'RS', o: 'Tuzla / Beograd' },
  'aca lukas': { c: 'RS', o: 'Beograd, Srbija' },
  'svetlana raznatovic': { c: 'RS', o: 'Žitorađa / Beograd, Srbija' },
  'ceca': { c: 'RS', o: 'Žitorađa / Beograd, Srbija' },
  'svetlana ceca raznatovic': { c: 'RS', o: 'Žitorađa / Beograd, Srbija' },
  'sasa matic': { c: 'RS', o: 'Drvar / Beograd, Srbija' },
  'dejan matic': { c: 'RS', o: 'Drvar / Beograd, Srbija' },
  'djordje balasevic': { c: 'RS', o: 'Novi Sad, Srbija' },
  'balasevic': { c: 'RS', o: 'Novi Sad, Srbija' },
  'bajaga': { c: 'RS', o: 'Beograd, Srbija' },
  'bajaga i instruktori': { c: 'RS', o: 'Beograd, Srbija' },
  'partibrejkers': { c: 'RS', o: 'Beograd, Srbija' },
  'kerber': { c: 'RS', o: 'Niš, Srbija' },
  'van gogh': { c: 'RS', o: 'Beograd, Srbija' },
  'ekatarina velika': { c: 'RS', o: 'Beograd, Srbija' },
  'ekv': { c: 'RS', o: 'Beograd, Srbija' },
  'ana bekuta': { c: 'RS', o: 'Priboj, Srbija' },
  'dragana mirkovic': { c: 'RS', o: 'Kasidol, Srbija' },
  'sinan sakic': { c: 'RS', o: 'Loznica, Srbija' },
  'marinko rokvic': { c: 'RS', o: 'Bosanski Petrovac / Beograd' },
  'nikola rokvic': { c: 'RS', o: 'Beograd, Srbija' },
  'dzej': { c: 'RS', o: 'Beograd (Dorćol), Srbija' },
  'dzej ramadanovski': { c: 'RS', o: 'Beograd (Dorćol), Srbija' },
  'predrag zivkovic tozovac': { c: 'RS', o: 'Kraljevo, Srbija' },
  'tozovac': { c: 'RS', o: 'Kraljevo, Srbija' },
  'saban bajramovic': { c: 'RS', o: 'Niš, Srbija' },
  'ljuba alicic': { c: 'RS', o: 'Šabac, Srbija' },
  'zeljko joksimovic': { c: 'RS', o: 'Valjevo / Beograd, Srbija' },
  'zeljko samardzic': { c: 'RS', o: 'Mostar / Beograd' },
  'darko lazic': { c: 'RS', o: 'Brestač, Srbija' },
  'aco pejovic': { c: 'RS', o: 'Prijepolje, Srbija' },
  'aleksandra prijovic': { c: 'RS', o: 'Sombor / Beli Manastir' },
  'tanja savic': { c: 'RS', o: 'Radinac / Smederevo, Srbija' },
  'milan stankovic': { c: 'RS', o: 'Obrenovac, Srbija' },
  'jelena karleusa': { c: 'RS', o: 'Beograd, Srbija' },
  'miligram': { c: 'RS', o: 'Beograd, Srbija' },
  'lexington': { c: 'RS', o: 'Beograd, Srbija' },
  'lexington band': { c: 'RS', o: 'Beograd, Srbija' },
  'tropico band': { c: 'RS', o: 'Leskovac, Srbija' },
  'neverne bebe': { c: 'RS', o: 'Valjevo / Beograd, Srbija' },
  'galija': { c: 'RS', o: 'Niš, Srbija' },
  'elektricni orgazam': { c: 'RS', o: 'Beograd, Srbija' },
  'idoli': { c: 'RS', o: 'Beograd, Srbija' },
  'yu grupa': { c: 'RS', o: 'Beograd, Srbija' },
  'smak': { c: 'RS', o: 'Kragujevac, Srbija' },
  'generacija 5': { c: 'RS', o: 'Beograd, Srbija' },
  'osvajaci': { c: 'RS', o: 'Kragujevac, Srbija' },
  'alisa': { c: 'RS', o: 'Beograd, Srbija' },
  'sars': { c: 'RS', o: 'Beograd, Srbija' },
  's.a.r.s': { c: 'RS', o: 'Beograd, Srbija' },
  's.a.r.s.': { c: 'RS', o: 'Beograd, Srbija' },
  'legende': { c: 'RS', o: 'Beograd, Srbija' },
  'kanda kodza i nebojsa': { c: 'RS', o: 'Beograd, Srbija' },
  'kodza i nebojsa kanda': { c: 'RS', o: 'Beograd, Srbija' },
  'louis': { c: 'RS', o: 'Leskovac / Beograd, Srbija' },
  'ljubisa stojanovic louis': { c: 'RS', o: 'Leskovac / Beograd, Srbija' },
  'zana': { c: 'RS', o: 'Beograd, Srbija' },
  '357': { c: 'RS', o: 'Beograd, Srbija' },
  'magla bend': { c: 'RS', o: 'Beograd, Srbija' },
  'luna': { c: 'RS', o: 'Beograd, Srbija' },
  's vremena na vreme': { c: 'RS', o: 'Beograd, Srbija' },
  'medeni mesec': { c: 'RS', o: 'Beograd, Srbija' },
  'slavko banjac': { c: 'RS', o: 'Vrnjačka Banja, Srbija' },
  'pedja medenica': { c: 'RS', o: 'Priština / Bačka Palanka, Srbija' },
  'nicim izazvan': { c: 'RS', o: 'Vrbas, Srbija' },
  'baja mali knindza': { c: 'RS', o: 'Gubin / Beograd' },
  'jovan perisic': { c: 'RS', o: 'Bosna / Novi Sad' },
  'starogradske': { c: 'RS', o: 'Srbija / Ex-Yu' },
  'starogradska': { c: 'RS', o: 'Srbija / Ex-Yu' },
  'narodne pesme': { c: 'RS', o: 'Srbija / Ex-Yu' },
  'narodna': { c: 'RS', o: 'Srbija / Ex-Yu' },
  'bjesovi': { c: 'RS', o: 'Gornji Milanovac, Srbija' },
  'block out': { c: 'RS', o: 'Beograd, Srbija' },
  'garavi sokak': { c: 'RS', o: 'Novi Sad, Srbija' },
  'dara bubamara': { c: 'RS', o: 'Novi Sad, Srbija' },
  'seki turkovic': { c: 'RS', o: 'Srbija' },
  'zoran kalezic': { c: 'ME', o: 'Danilovgrad, Crna Gora' },
  'boba stefanovic': { c: 'RS', o: 'Beograd, Srbija' },

  // --- HRVATSKA (HR) ---
  'oliver dragojevic': { c: 'HR', o: 'Vela Luka / Split, Hrvatska' },
  'gibonni': { c: 'HR', o: 'Split, Hrvatska' },
  'miso kovac': { c: 'HR', o: 'Šibenik, Hrvatska' },
  'petar graso': { c: 'HR', o: 'Split, Hrvatska' },
  'parni valjak': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'prljavo kazaliste': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'severina': { c: 'HR', o: 'Split, Hrvatska' },
  'jelena rozga': { c: 'HR', o: 'Split, Hrvatska' },
  'tony cetinski': { c: 'HR', o: 'Rovinj / Pula, Hrvatska' },
  'toni cetinski': { c: 'HR', o: 'Rovinj / Pula, Hrvatska' },
  'doris dragovic': { c: 'HR', o: 'Split, Hrvatska' },
  'nina badric': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'magazin': { c: 'HR', o: 'Split, Hrvatska' },
  'jasna zlokic': { c: 'HR', o: 'Vela Luka, Hrvatska' },
  'goran karan': { c: 'HR', o: 'Split, Hrvatska' },
  'thompson': { c: 'HR', o: 'Čavoglave / Split, Hrvatska' },
  'marko perkovic thompson': { c: 'HR', o: 'Čavoglave / Split, Hrvatska' },
  'hladno pivo': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'psihomodo pop': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'haustor': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'darko rundek': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'daleka obala': { c: 'HR', o: 'Split, Hrvatska' },
  'tbf': { c: 'HR', o: 'Split, Hrvatska' },
  'jinx': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'neno belan': { c: 'HR', o: 'Split / Rijeka, Hrvatska' },
  'djavoli': { c: 'HR', o: 'Split, Hrvatska' },
  'boris novkovic': { c: 'HR', o: 'Sarajevo / Zagreb' },
  'dino dvornik': { c: 'HR', o: 'Split, Hrvatska' },
  'arsen dedic': { c: 'HR', o: 'Šibenik / Zagreb, Hrvatska' },
  'vice vukov': { c: 'HR', o: 'Šibenik, Hrvatska' },
  'vanna': { c: 'HR', o: 'Koprivnica / Zagreb, Hrvatska' },
  'klapa intrade': { c: 'HR', o: 'Zadar, Hrvatska' },
  'tomislav bralic': { c: 'HR', o: 'Bibinje / Zadar, Hrvatska' },
  'mejasi': { c: 'HR', o: 'Varaždin, Hrvatska' },
  'slavonske lole': { c: 'HR', o: 'Đakovo / Slavonija, Hrvatska' },
  'gazde': { c: 'HR', o: 'Zagreb (Markuševec), Hrvatska' },
  'itd band': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'aerodrom': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'jurica paden': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'azra': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'branimir stulic': { c: 'HR', o: 'Skoplje / Zagreb' },
  'johnny stulic': { c: 'HR', o: 'Skoplje / Zagreb' },
  'brkovi': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'opca opasnost': { c: 'HR', o: 'Županja, Hrvatska' },
  'kud idijoti': { c: 'HR', o: 'Pula, Hrvatska' },
  'fantomi': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'alen slavica': { c: 'HR', o: 'Karlovac, Hrvatska' },
  'drugi nacin': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'srebrna krila': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'novi fosili': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'let 3': { c: 'HR', o: 'Rijeka, Hrvatska' },
  'urban & 4': { c: 'HR', o: 'Rijeka, Hrvatska' },
  'damir urban': { c: 'HR', o: 'Rijeka, Hrvatska' },
  'pips chips & videoclips': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'milo hrnic': { c: 'HR', o: 'Dubrovnik, Hrvatska' },
  'zlatko pejakovic': { c: 'HR', o: 'Osijek, Hrvatska' },
  'minea': { c: 'HR', o: 'Zagreb, Hrvatska' },
  'danijela martinovic': { c: 'HR', o: 'Split, Hrvatska' },
  'klapa maslina': { c: 'HR', o: 'Šibenik, Hrvatska' },
  'klapa cambiat': { c: 'HR', o: 'Kaštel Kambelovac, Hrvatska' },
  'klapa sime': { c: 'HR', o: 'Zadar, Hrvatska' },
  'dalmatino': { c: 'HR', o: 'Split, Hrvatska' },

  // --- CRNA GORA (ME) ---
  'miladin sobic': { c: 'ME', o: 'Nikšić, Crna Gora' },
  'sergej cetkovic': { c: 'ME', o: 'Podgorica, Crna Gora' },
  'vlado georgiev': { c: 'ME', o: 'Herceg Novi, Crna Gora' },
  'boban rajovic': { c: 'ME', o: 'Berane / Podgorica, Crna Gora' },
  'sako polumenta': { c: 'ME', o: 'Bijelo Polje, Crna Gora' },
  'dado polumenta': { c: 'ME', o: 'Bijelo Polje, Crna Gora' },
  'daniel popovic': { c: 'ME', o: 'Podgorica, Crna Gora' },
  'bojan marovic': { c: 'ME', o: 'Podgorica, Crna Gora' },
  'knez': { c: 'ME', o: 'Cetinje / Podgorica, Crna Gora' },
  'nenad knezevic knez': { c: 'ME', o: 'Cetinje / Podgorica, Crna Gora' },
  'rambo amadeus': { c: 'ME', o: 'Kotor / Herceg Novi, Crna Gora' },
  'perper': { c: 'ME', o: 'Cetinje, Crna Gora' },
  'makadam': { c: 'ME', o: 'Podgorica, Crna Gora' },
  'danijel alibabic': { c: 'ME', o: 'Podgorica, Crna Gora' },
  'andrea demirovic': { c: 'ME', o: 'Podgorica, Crna Gora' },
  'jadranka barjaktarovic': { c: 'ME', o: 'Berane, Crna Gora' },
  'who see': { c: 'ME', o: 'Kotor / Bar, Crna Gora' },

  // --- SEVERNA MAKEDONIJA (MK) ---
  'tose proeski': { c: 'MK', o: 'Kruševo / Prilep, Severna Makedonija' },
  'vlatko stefanovski': { c: 'MK', o: 'Prilep / Skoplje, Severna Makedonija' },
  'leb i sol': { c: 'MK', o: 'Skoplje, Severna Makedonija' },
  'makedonske pesme': { c: 'MK', o: 'Severna Makedonija' },
  'kaliopi': { c: 'MK', o: 'Ohrid / Skoplje, Severna Makedonija' },
  'tijana dapcevic': { c: 'MK', o: 'Skoplje, Severna Makedonija' },
  'tamara todevska': { c: 'MK', o: 'Skoplje, Severna Makedonija' },
  'esma redzepova': { c: 'MK', o: 'Skoplje, Severna Makedonija' },
  'karolina goceva': { c: 'MK', o: 'Bitola, Severna Makedonija' },
  'vlado janevski': { c: 'MK', o: 'Skoplje, Severna Makedonija' },
  'area': { c: 'MK', o: 'Gostivar, Severna Makedonija' },
  'mizar': { c: 'MK', o: 'Skoplje, Severna Makedonija' },
  'aleksandar sarievski': { c: 'MK', o: 'Galičnik, Severna Makedonija' },
  'jonce hristovski': { c: 'MK', o: 'Bitola, Severna Makedonija' },

  // --- SLOVENIJA (SI) ---
  'vlado kreslin': { c: 'SI', o: 'Beltinci, Slovenija' },
  'magnifico': { c: 'SI', o: 'Ljubljana, Slovenija' },
  'siddharta': { c: 'SI', o: 'Ljubljana, Slovenija' },
  'laibach': { c: 'SI', o: 'Trbovlje, Slovenija' },
  'zoran predin': { c: 'SI', o: 'Maribor, Slovenija' },
  'lacni franz': { c: 'SI', o: 'Maribor, Slovenija' },
  'pankrti': { c: 'SI', o: 'Ljubljana, Slovenija' },
  'ansambel bratov avsenik': { c: 'SI', o: 'Begunje na Gorenjskem, Slovenija' },
  'avsenik': { c: 'SI', o: 'Begunje na Gorenjskem, Slovenija' },
  'ansambel lojzeta slaka': { c: 'SI', o: 'Mirna Peč, Slovenija' },
  'joker out': { c: 'SI', o: 'Ljubljana, Slovenija' },
  'big foot mama': { c: 'SI', o: 'Ljubljana, Slovenija' },
  'dan d': { c: 'SI', o: 'Novo Mesto, Slovenija' }
};

export function detectArtistCountry(artistName, origin = '') {
  if (!artistName) return undefined;
  const clean = toLatin(artistName).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  // 1. Exact Dictionary Match
  if (COMPREHENSIVE_ARTIST_MAP[clean]) {
    return COMPREHENSIVE_ARTIST_MAP[clean].c;
  }

  // 2. Substring Match in Dictionary
  for (const [k, v] of Object.entries(COMPREHENSIVE_ARTIST_MAP)) {
    if (clean.includes(k) || k.includes(clean)) {
      if (clean.length >= 4 && k.length >= 4) {
        return v.c;
      }
    }
  }

  // 3. Heuristic & Linguistic Patterns
  if (clean.startsWith('klapa ') || clean.includes(' klapa') || clean.includes('dalmatin')) return 'HR';
  if (clean.includes('tambura') || clean.includes('slavonsk') || clean.includes('lole')) return 'HR';
  if (clean.includes('sevdah') || clean.includes('sevdalink') || clean.includes('sazlija')) return 'BA';
  if (clean.includes('makedon') || clean.includes('skopj') || clean.includes('bitol')) return 'MK';
  if (clean.includes('crnogor') || clean.includes('boke') || clean.includes('cetinjsk')) return 'ME';
  if (clean.includes('sloven') || clean.includes('ansambel') || clean.includes('avsenik')) return 'SI';
  if (clean.includes('trubac') || clean.includes('guca') || clean.includes('starogradsk')) return 'RS';

  // 4. Origin Text Analysis
  if (origin) {
    const oLow = toLatin(origin).toLowerCase();
    if (/sarajevo|tuzla|mostar|banja luka|zenica|bih|bosna|jajce|bihac|brcko/i.test(oLow)) return 'BA';
    if (/beograd|novi sad|nis|kragujevac|srbija|serbia|leskovac|kraljevo|sabac|valjevo|cacak|uzice|subotica|zrenjanin|sombor|pancevo|vranje/i.test(oLow)) return 'RS';
    if (/zagreb|split|rijeka|osijek|zadar|hrvatska|croatia|pula|sibenik|dubrovnik|varazdin|karlovac|sisak|vinkovci|vukovar/i.test(oLow)) return 'HR';
    if (/podgorica|cetinje|niksic|budva|crna gora|montenegro|bar|herceg novi|kotor|bijelo polje|berane/i.test(oLow)) return 'ME';
    if (/skoplje|skopje|bitola|ohrid|makedonija|macedonia|prilep|kumanovo|strumica/i.test(oLow)) return 'MK';
    if (/ljubljana|maribor|koper|slovenija|slovenia|celje|kranj|novo mesto/i.test(oLow)) return 'SI';
  }

  // 5. Ex-Yu Regional Default
  return 'RS'; // Default regional fallback for Yugoslav pop-folk catalog
}

export function detectArtistOrigin(artistName, origin = '') {
  if (origin && origin.trim().length > 3) return origin.trim();
  if (!artistName) return '';
  const clean = toLatin(artistName).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  if (COMPREHENSIVE_ARTIST_MAP[clean]?.o) {
    return COMPREHENSIVE_ARTIST_MAP[clean].o;
  }

  for (const [k, v] of Object.entries(COMPREHENSIVE_ARTIST_MAP)) {
    if ((clean.includes(k) || k.includes(clean)) && clean.length >= 4 && k.length >= 4) {
      return v.o;
    }
  }

  if (clean.startsWith('klapa ') || clean.includes('dalmatin')) return 'Dalmacija, Hrvatska';
  if (clean.includes('tambura') || clean.includes('slavonsk')) return 'Slavonija, Hrvatska';
  if (clean.includes('sevdah') || clean.includes('sevdalink')) return 'Bosna i Hercegovina';
  if (clean.includes('makedon')) return 'Severna Makedonija';
  if (clean.includes('crnogor')) return 'Crna Gora';
  if (clean.includes('sloven')) return 'Slovenija';

  return 'Balkan / Ex-Yu';
}
