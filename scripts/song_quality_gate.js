import { toLatin, hasCyrillic } from '../src/utils/latinise.js';

export function convertCyrillicChordsAndText(content) {
  if (!content) return '';
  
  // 1. Convert Cyrillic chord tokens inside brackets: e.g. [Сm] -> [Cm], [Ам] -> [Am], [Дм] -> [Dm], [Е] -> [E], [Н] -> [H], [Г] -> [G], [Ф] -> [F], [В] -> [B]
  let text = content.replace(/\[([Ѐ-ӿԀ-ԯA-Za-z0-9#b\/\+\s\-]*)\]/g, (match, chordInner) => {
    let c = chordInner
      .replace(/С/g, 'C').replace(/с/g, 'c')
      .replace(/А/g, 'A').replace(/а/g, 'a')
      .replace(/В/g, 'B').replace(/в/g, 'b')
      .replace(/Н/g, 'H').replace(/н/g, 'h')
      .replace(/Е/g, 'E').replace(/е/g, 'e')
      .replace(/Д/g, 'D').replace(/д/g, 'd')
      .replace(/Г/g, 'G').replace(/г/g, 'g')
      .replace(/Ф/g, 'F').replace(/ф/g, 'f')
      .replace(/м/g, 'm').replace(/М/g, 'M')
      .replace(/диз/gi, '#')
      .replace(/мол/gi, 'm')
      .replace(/дур/gi, '');
    return `[${c}]`;
  });

  // 2. Convert all remaining Cyrillic text to Latin with proper Gaj diacritics
  text = toLatin(text);

  return text;
}

export function snapChordsToSyllables(line) {
  if (!line || !line.includes('[')) return line;
  const trimmed = line.trim();
  if (/^\[.*\]:?$/.test(trimmed) && !/[a-z]{4,}/i.test(trimmed)) return line;

  // Case 1: Consonant cluster at start of word before chord: "D[Am]otak" -> "[Am]Dotak", "k[C]ad" -> "[C]kad", "st[G]vore" -> "[G]stvore"
  let result = line.replace(/(^|\s)([bcdfghjklmnpqrstvwxzčćšđžBCDFGHJKLMNPQRSTVWXZČĆŠĐŽ]{1,3})\[([A-H][b#]?[^\]]*)\]([a-zA-ZčćšđžČĆŠĐŽ]+)/gu, (match, prefix, consonants, chord, rest) => {
    return `${prefix}[${chord}]${consonants}${rest}`;
  });

  // Case 2: Short 1-2 letter word with embedded trailing chord: "D[Am]a li" -> "[Am]Da li"
  result = result.replace(/(^|\s)([a-zA-ZčćšđžČĆŠĐŽ]{1,2})\[([A-H][b#]?[^\]]*)\](?=\s|$)/gu, (match, prefix, letters, chord) => {
    return `${prefix}[${chord}]${letters}`;
  });

  return result;
}

export function healOverlappingAndBrokenChords(content) {
  if (!content) return '';
  let text = content;

  // 1. Fix nested or double brackets: [[Am]] -> [Am], [[[C]]] -> [C], [Am [G]] -> [Am] [G]
  text = text.replace(/\[\[+([A-H][b#]?[^\]]*)\]\]+/g, '[$1]');
  text = text.replace(/\[([A-H][b#]?[^\]]*)\s*\[([A-H][b#]?[^\]]*)\]\]/g, '[$1] [$2]');
  text = text.replace(/\[\[([A-H][b#]?[^\]]*)\s*([A-H][b#]?[^\]]*)\]/g, '[$1] [$2]');

  // 2. Fix adjacent stuck chords: [Am][F] -> [Am] [F], [Am][G][Em] -> [Am] [G] [Em]
  while (/\[([A-H][b#]?[^\]]*)\]\[([A-H][b#]?[^\]]*)/.test(text)) {
    text = text.replace(/\[([A-H][b#]?[^\]]*)\]\[([A-H][b#]?[^\]]*)/g, '[$1] [$2]');
  }

  // 3. Deduplicate exact same repeated adjacent chords: [Am] [Am] -> [Am]
  text = text.replace(/\[([A-H][b#]?[^\]]*)\]\s+\[\1\]/g, '[$1]');

  // 4. Fix punctuation sticking directly to chord start without space: "tekst,[Am]" -> "tekst, [Am]"
  text = text.replace(/([,\.\!\?\:\;])\[([A-H][b#]?[^\]]*)\]/g, '$1 [$2]');

  // 5. Fix stuck chord before opening section header: "[Am][Refren]" -> "[Am]\n[Refren]"
  text = text.replace(/\[([A-H][b#]?[^\]]*)\]\[(Strofa|Refren|Intro|Uvod|Solo|Outro|Prelaz|Pred-refren)/gi, '[$1]\n[$2]');

  // 6. Ensure standalone chord lines have clean single spaces between chords
  const lines = text.split('\n');
  const cleaned = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    // Standalone chords line (e.g. intro/solo)
    if (/^(?:\[[A-H][b#]?[^\]]*\]\s*)+$/.test(trimmed)) {
      const chords = [...trimmed.matchAll(/\[([A-H][b#]?[^\]]*)\]/g)].map(m => `[${m[1].trim()}]`);
      return chords.join(' ');
    }
    return line;
  });

  return cleaned.join('\n');
}

export function enforceHarmonicStanzaSymmetry(content) {
  if (!content) return '';
  const sections = content.split(/\n\s*\n/);
  
  // Find Stanza 1 chord matrix
  let stanza1Matrix = [];
  for (const sec of sections) {
    const lines = sec.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0 && /^\[Strofa\s*1\]/i.test(lines[0])) {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const chordMatches = [...line.matchAll(/\[([A-H][b#]?[^\]]*)\]/g)];
        const textOnly = line.replace(/\[[^\]]+\]/g, '');
        const chordPositions = chordMatches.map(m => ({
          chord: m[1],
          ratio: textOnly.length > 0 ? (m.index / Math.max(1, line.length)) : 0
        }));
        stanza1Matrix.push(chordPositions);
      }
      break;
    }
  }

  if (stanza1Matrix.length === 0) return content;

  // Apply matrix to subsequent stanzas (Strofa 2, Strofa 3, etc.) if they lack chords
  const processedSections = sections.map(sec => {
    const lines = sec.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && /^\[Strofa\s*[2-9]\]/i.test(lines[0])) {
      const header = lines[0];
      const stanzaLines = lines.slice(1);
      const totalChordsInSec = (sec.match(/\[[A-H][b#]?[^\]]*\]/g) || []).length;
      
      // If stanza has fewer than half the expected chords from Stanza 1
      if (totalChordsInSec < stanza1Matrix.flat().length * 0.5) {
        const chordedLines = stanzaLines.map((line, idx) => {
          if ((line.match(/\[[A-H][b#]?[^\]]*\]/g) || []).length >= 2) return line;
          
          const targetChords = stanza1Matrix[idx % stanza1Matrix.length] || [];
          if (targetChords.length === 0) return line;

          let cleanText = line.replace(/\[[^\]]+\]/g, '').trim();
          if (!cleanText) return line;

          let res = '';
          const words = cleanText.split(/\s+/);
          if (targetChords.length === 1) {
            res = `[${targetChords[0].chord}]${cleanText}`;
          } else {
            const step = Math.max(1, Math.floor(words.length / targetChords.length));
            const wordsWithChords = words.map((w, wIdx) => {
              const chordIdx = Math.floor(wIdx / step);
              if (wIdx % step === 0 && targetChords[chordIdx]) {
                return `[${targetChords[chordIdx].chord}]${w}`;
              }
              return w;
            });
            res = wordsWithChords.join(' ');
          }
          return snapChordsToSyllables(res);
        });

        return [header, ...chordedLines].join('\n');
      }
    }
    return sec;
  });

  return processedSections.join('\n\n');
}

export function formatSentencePunctuation(content) {
  if (!content) return '';
  const lines = content.split('\n');
  const formatted = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^\[.*\]:?$/.test(trimmed)) return line; // Header or solo
    if (/^(?:\[[A-H][b#]?[^\]]*\]\s*)+$/.test(trimmed)) return line; // Standalone chords line
    
    // If line has words and ends without punctuation or ends with trailing dash
    const textOnly = trimmed.replace(/\[[^\]]+\]/g, '').trim();
    if (textOnly.length > 3 && !/[\.\,\!\?\:\;]$/.test(textOnly)) {
      return line.trimEnd() + '.';
    }
    return line;
  });
  return formatted.join('\n');
}

export function isDummyContent(content) {
  if (!content || typeof content !== 'string') return true;
  const t = content.toLowerCase();
  return (
    t.includes('lorem ipsum') ||
    t.includes('dolor sit amet') ||
    t.includes('consectetur adipiscing') ||
    t.includes('mollit anim') ||
    t.includes('do eiusmod') ||
    t.includes('ut labore') ||
    t.includes('magna aliqua') ||
    t.includes('tekst i akordi još nisu upisani') ||
    t.includes('tekst i akordi jos nisu upisani') ||
    t.includes('tekst još uvijek nije ažuriran') ||
    t.includes('tekst jos uvijek nije azuriran') ||
    t.includes('tekst još nije upisan') ||
    t.includes('tekst jos nije upisan') ||
    t.includes('još nisu upisani') ||
    t.includes('jos nisu upisani') ||
    t.includes('tekst i akordi uskoro') ||
    t.includes('uskoro tekst i akordi') ||
    t.length < 40
  );
}

export function cleanAccidentalCaps(str) {
  if (!str) return '';
  let t = str;
  // 1. Initial double-cap stutter: "PLavusa" -> "Plavusa", "CRvena" -> "Crvena", "PRevarena" -> "Prevarena"
  t = t.replace(/\b([A-ZČĆŠĐŽ])([A-ZČĆŠĐŽ]+)([a-zčćšđž]{2,})\b/gu, (m, c1, c2, rest) => c1 + c2.toLowerCase() + rest);
  
  // 2. Mid-word accidental cap: "žIvot" -> "život", "sVoj" -> "svoj", "sIn" -> "sin"
  t = t.replace(/\b([a-zčćšđž]+)([A-ZČĆŠĐŽ]+)([a-zčćšđž]*)\b/gu, (m, p1, c, p2) => p1 + c.toLowerCase() + p2);
  
  return t;
}

const DIACRITIC_MAP = {
  // Plavuša / Garavuša / Kićo
  'plavusa': 'plavuša', 'plavuse': 'plavuše', 'plavusi': 'plavuši', 'plavuso': 'plavušo', 'plavusom': 'plavušom',
  'garavusa': 'garavuša', 'garavuse': 'garavuše', 'garavusi': 'garavuši', 'garavuso': 'garavušo',
  'kico': 'kićo', 'kica': 'kića', 'kicu': 'kiću',
  'dusman': 'dušman', 'dusmani': 'dušmani', 'dusmana': 'dušmana', 'dusmanu': 'dušmanu',
  'mladic': 'mladić', 'mladica': 'mladića', 'mladicu': 'mladiću', 'mladici': 'mladići',
  'kafic': 'kafić', 'kafica': 'kafića', 'kaficu': 'kafiću', 'kafici': 'kafići',
  'kosulja': 'košulja', 'kosulje': 'košulje', 'kosulju': 'košulju', 'kosulji': 'košulji',
  'papuce': 'papuče', 'papuca': 'papuča', 'papuci': 'papuči', 'papucama': 'papučama',

  // Dž
  'dzaba': 'džaba', 'dzabe': 'džabe', 'dzep': 'džep', 'dzepa': 'džepa', 'dzepu': 'džepu', 'dzepom': 'džepom', 'dzepovi': 'džepovi',
  'dzemper': 'džemper', 'dzemperom': 'džemperom', 'dzempera': 'džempera', 'dzamija': 'džamija', 'dzamije': 'džamije', 'dzamiji': 'džamiji',
  'dzungla': 'džungla', 'dzungle': 'džungle', 'dzungli': 'džungli', 'dzez': 'džez', 'dzezva': 'džezva', 'dzezve': 'džezve',
  'dzelat': 'dželat', 'dzelata': 'dželata', 'dzumbus': 'džumbus', 'dzuboks': 'džuboks', 'dzukela': 'džukela',

  // Šaban / Šaulić / Šašić / Šerifović / Šobić / Šerfezi / Šabić / Šerbedžija
  'saban': 'šaban', 'sabana': 'šabana', 'sabane': 'šabane', 'sabanu': 'šabanu',
  'saulic': 'šaulić', 'sasic': 'šašić', 'serifovic': 'šerifović', 'sobic': 'šobić', 'serfezi': 'šerfezi',
  'sabic': 'šabić', 'serbedzija': 'šerbedžija',

  // Tuga / Tužan / Tužna / Tužno / Tužni / Tužne / Tužiti
  'tuzan': 'tužan', 'tuzna': 'tužna', 'tuzno': 'tužno', 'tuzni': 'tužni', 'tuzne': 'tužne', 'tuznim': 'tužnim', 'tuznih': 'tužnih', 'tuziti': 'tužiti',

  // Ući / Uđi / Uđem / Uđeš / Uđe / Uđite / Uđu / Ušao / Ušla / Ušli
  'uci': 'ući', 'udji': 'uđi', 'udjem': 'uđem', 'udjes': 'uđeš', 'udje': 'uđe', 'udjite': 'uđite', 'udju': 'uđu', 'usao': 'ušao', 'usla': 'ušla', 'usli': 'ušli',

  // Želela / Želeo / Želeli / Željela / Želio / Željeli
  'zelela': 'želela', 'zeleo': 'želeo', 'zeleli': 'želeli', 'zeljela': 'željela', 'zelio': 'želio', 'zeljeli': 'željeli',

  // Služim / Služiš / Služi / Služiti / Služba
  'sluzim': 'služim', 'sluzis': 'služiš', 'sluzi': 'služi', 'sluzimo': 'služimo', 'sluzite': 'služite', 'sluze': 'služe', 'sluziti': 'služiti', 'sluzba': 'služba',

  // Šta / Što / Zašto / Pošto / Nešto / Svašta / Ništa
  'sta': 'šta', 'sto': 'što', 'zasto': 'zašto', 'posto': 'pošto', 'nesto': 'nešto', 'svasta': 'svašta', 'nista': 'ništa',

  // Muči / Mučim / Mučiš / Muče / Mučenje
  'muci': 'muči', 'mucim': 'mučim', 'mucis': 'mučiš', 'muce': 'muče', 'mucenje': 'mučenje',

  // Čemu / Čime / Čega / Čak / Često
  'cemu': 'čemu', 'cime': 'čime', 'cega': 'čega', 'cak': 'čak', 'cesto': 'često',

  // Kočnice / Kočnica / Kočnicu
  'kocnica': 'kočnica', 'kocnice': 'kočnice', 'kocnicu': 'kočnicu', 'kocnicom': 'kočnicom',

  // Šešir / Odeća / Tkanine
  'sesir': 'šešir', 'sesira': 'šešira', 'sesiru': 'šeširu', 'sesirom': 'šeširom', 'sesiri': 'šeširi',
  'kosulja': 'košulja', 'kosulje': 'košulje', 'kosulju': 'košulju', 'dzemper': 'džemper', 'dzep': 'džep', 'dzepu': 'džepu', 'dzepovi': 'džepovi',
  'haljina': 'haljina', 'haljine': 'haljine', 'haljinu': 'haljinu', 'odelo': 'odelo', 'odijelo': 'odijelo',
  
  // Vujić / Imena / Prezimena / Autori
  'vujic': 'vujić', 'vujica': 'vujića', 'vujicu': 'vujiću', 'vujicem': 'vujićem',
  'kosta': 'kosta', 'koste': 'koste', 'kostu': 'kostu',
  'jovanovic': 'jovanović', 'petrovic': 'petrović', 'kovacevic': 'kovačević', 'beslic': 'bešlić', 'colic': 'čolić',
  'dragojevic': 'dragojević', 'balasevic': 'balašević', 'joksimovic': 'joksimović', 'kitic': 'kitić', 'zdravkovic': 'zdravković',
  'dzaferovic': 'džaferović', 'hadzic': 'hadžić', 'curkovic': 'ćurković', 'curcic': 'ćurčić', 'pejovic': 'pejović',
  'dzej': 'džej', 'sabic': 'šabić', 'serbedzija': 'šerbedžija', 'bajic': 'bajić', 'lukas': 'lukas', 'vasic': 'vasić',
  
  // Početak / Početi / Počnimo / Započeti
  'pocetak': 'početak', 'pocetka': 'početka', 'pocetku': 'početku', 'pocetkom': 'početkom',
  'pocetni': 'početni', 'pocetna': 'početna', 'pocetno': 'početno', 'pocetnici': 'početnici',
  'pocnem': 'počnem', 'pocnes': 'počneš', 'pocne': 'počne', 'pocnemo': 'počnemo', 'pocnimo': 'počnimo', 'pocnete': 'počnete', 'pocnu': 'počnu',
  'poceti': 'početi', 'poceo': 'počeo', 'pocela': 'počela', 'pocelo': 'počelo', 'poceli': 'počeli',
  'ispocetka': 'ispočetka',
  'zapoceti': 'započeti', 'zapocnem': 'započnem', 'zapocnes': 'započneš', 'zapocne': 'započne', 'zapocnemo': 'započnemo', 'zapocnu': 'započnu', 'zapoceo': 'započeo', 'zapocela': 'započela', 'zapoceli': 'započeli',

  // Noć / Vreme / Dani
  'nocna': 'noćna', 'nocni': 'noćni', 'nocno': 'noćno', 'noc': 'noć', 'noci': 'noći', 'nocu': 'noću', 'nocas': 'noćas',
  'ponoc': 'ponoć', 'ponoci': 'ponoći', 'ponocna': 'ponoćna', 'ponocni': 'ponoćni',
  'vece': 'veče', 'veceras': 'večeras', 'veceri': 'večeri', 'predvecerje': 'predvečerje',
  'jutros': 'jutros', 'danas': 'danas', 'svitanje': 'svitanje', 'ponoc': 'ponoć',
  'zora': 'zora', 'zore': 'zore', 'zori': 'zori', 'zoru': 'zoru',
  'subota': 'subota', 'nedelja': 'nedelja', 'nedjelja': 'nedjelja',
  
  // Glagoli / Kretanje / Stanje
  'doci': 'doći', 'dodji': 'dođi', 'dodjem': 'dođem', 'dodjes': 'dođeš', 'dodje': 'dođe', 'dodjite': 'dođite', 'dodju': 'dođu', 'dosao': 'došao', 'dosla': 'došla', 'dosli': 'došli',
  'poci': 'poći', 'podji': 'pođi', 'podjem': 'pođem', 'podjes': 'pođeš', 'podje': 'pođe', 'podjite': 'pođite', 'podju': 'pođu', 'posao': 'pošao', 'posla': 'pošla', 'posli': 'pošli',
  'otici': 'otići', 'otidji': 'otiđi', 'otisao': 'otišao', 'otisla': 'otišla', 'otisli': 'otišli', 'ode': 'ode', 'odes': 'odeš', 'odem': 'odem',
  'naci': 'naći', 'nadji': 'nađi', 'nadjemo': 'nađemo', 'nadjite': 'nađite', 'nadjem': 'nađem', 'nadjes': 'nađeš', 'nadje': 'nađe', 'nasao': 'našao', 'nasla': 'našla', 'nasli': 'našli',
  'proci': 'proći', 'prodji': 'prođi', 'prodje': 'prođe', 'prosao': 'prošao', 'prosla': 'prošla', 'prosli': 'prošli',
  'reci': 'reći', 'rekao': 'rekao', 'rekla': 'rekla', 'rekli': 'rekli', 'rec': 'reč', 'rijec': 'riječ', 'reci': 'reči', 'rijeci': 'riječi',
  'moci': 'moći', 'mogu': 'mogu', 'mozes': 'možeš', 'moze': 'može', 'mozemo': 'možemo', 'mozete': 'možete',
  'hocu': 'hoću', 'hoces': 'hoćeš', 'hoce': 'hoće', 'hocemo': 'hoćemo', 'hocete': 'hoćete',
  'necu': 'neću', 'neces': 'nećeš', 'nece': 'neće', 'necemo': 'nećemo', 'necete': 'nećete',
  'cu': 'ću', 'ces': 'ćeš', 'ce': 'će', 'cemo': 'ćemo', 'cete': 'ćete',
  'bicu': 'biću', 'bices': 'bićeš', 'bice': 'biće', 'bicemo': 'bićemo', 'bicete': 'bićete',
  'shvaticu': 'shvatiću', 'shvatices': 'shvatićeš', 'shvatice': 'shvatiće',
  'znacu': 'znaću', 'znaces': 'znaćeš', 'znace': 'znaće',
  'videcu': 'videću', 'videces': 'videćeš', 'videce': 'videće', 'vidjecu': 'vidjeću', 'vidjeces': 'vidjećeš', 'vidjece': 'vidjeće',
  'pamticu': 'pamtiću', 'pamtices': 'pamtićeš', 'pamtice': 'pamtiće', 'pamtit': 'pamtit',
  'ljubicu': 'ljubiću', 'ljubices': 'ljubićeš', 'ljubice': 'ljubiće',
  'umrecu': 'umreću', 'umreces': 'umrećeš', 'umrece': 'umreće',
  'gorecu': 'goreću', 'goreces': 'gorećeš', 'gorece': 'goreće',
  
  // Čuvati / Željeti / Reći / Tražiti / Stići / Bežati / Držati / Zvati
  'cuvam': 'čuvam', 'cuvaj': 'čuvaj', 'cuva': 'čuva', 'cuvamo': 'čuvamo', 'cuvate': 'čuvate', 'cuvaju': 'čuvaju', 'cuvati': 'čuvati', 'sacuvaj': 'sačuvaj',
  'zelim': 'želim', 'zelis': 'želiš', 'zeli': 'želi', 'zelimo': 'želimo', 'zelite': 'želite', 'zele': 'žele', 'zelja': 'želja', 'zelje': 'želje', 'zeljo': 'željo', 'zelju': 'želju',
  'kazu': 'kažu', 'kaze': 'kaže', 'kazem': 'kažem', 'kazi': 'kaži',
  'zivot': 'život', 'zivota': 'života', 'zivotu': 'životu', 'zivote': 'živote', 'zivim': 'živim', 'zivis': 'živiš', 'zivi': 'živi', 'zivimo': 'živimo', 'zivite': 'živite', 'zive': 'žive',
  'laz': 'laž', 'lazi': 'laži', 'lazem': 'lažem', 'lazes': 'lažeš', 'laze': 'laže', 'lazni': 'lažni', 'lazna': 'lažna', 'lazno': 'lažno',
  'zasto': 'zašto', 'zato': 'zato',
  'trazim': 'tražim', 'trazi': 'traži', 'trazis': 'tražiš', 'traze': 'traže', 'trazio': 'tražio', 'trazila': 'tražila',
  'stize': 'stiže', 'stizem': 'stižem', 'stizes': 'stižeš', 'stizu': 'stižu', 'stigli': 'stigli',
  'bezi': 'beži', 'bjezi': 'bježi', 'bezim': 'bežim', 'bjezim': 'bježim', 'bjeze': 'bježe',
  'drzi': 'drži', 'drzim': 'držim', 'drzis': 'držiš', 'drze': 'drže',
  'tesko': 'teško', 'teska': 'teška', 'teski': 'teški', 'teske': 'teške',
  'ludje': 'luđe', 'sladje': 'slađe', 'mladje': 'mlađe', 'sladja': 'slađa', 'sladji': 'slađi', 'mladji': 'mlađi', 'ludji': 'luđi',
  'tudjina': 'tuđina', 'tudjini': 'tuđini', 'tudje': 'tuđe', 'tudji': 'tuđi', 'tudja': 'tuđa', 'tudj': 'tuđ',
  'cuti': 'ćuti', 'cutim': 'ćutim', 'cutis': 'ćutiš', 'cutanje': 'ćutanje',
  'secas': 'sećaš', 'sjecas': 'sjećaš', 'sjecam': 'sjećam', 'secam': 'sećam', 'secanja': 'sećanja', 'sjecanja': 'sjećanja',
  'lepse': 'lepše', 'ljepse': 'ljepše', 'lepsi': 'lepši', 'ljepsi': 'ljepši', 'lepsa': 'lepša', 'ljepsa': 'ljepša', 'lepota': 'lepota', 'ljepota': 'ljepota', 'lepotica': 'ljepotica',
  'cujem': 'čujem', 'cujes': 'čuješ', 'cuje': 'čuje', 'cujemo': 'čujemo', 'cujete': 'čujete', 'cuju': 'čuju', 'cuo': 'čuo', 'cula': 'čula', 'culo': 'čulo', 'culi': 'čuli', 'cuj': 'čuj', 'cujte': 'čujte',
  'prolece': 'proleće', 'proljece': 'proljeće', 'proljeca': 'proljeća', 'proleca': 'proleća',
  'placem': 'plačem', 'places': 'plačeš', 'place': 'plače', 'placu': 'plaču', 'placi': 'plači', 'zaplacem': 'zaplačem',
  'zalost': 'žalost', 'zali': 'žali', 'zalim': 'žalim', 'zalis': 'žališ',
  'djavol': 'đavo', 'djavo': 'đavo', 'djavola': 'đavola', 'djavole': 'đavole', 'djavoli': 'đavoli',
  'andjeo': 'anđeo', 'andjela': 'anđela', 'andjele': 'anđele', 'andjeli': 'anđeli',
  'djurdjevdan': 'đurđevdan', 'djurdjica': 'đurđica',
  'djevojka': 'djevojka', 'devojka': 'devojka', 'djevojko': 'djevojko', 'devojko': 'devojko',
  'oce': 'oče', 'caca': 'ćaća', 'cace': 'ćaće', 'caci': 'ćaći', 'cacu': 'ćaću', 'caco': 'ćaćo',
  'braca': 'braća', 'brace': 'braće', 'braci': 'braći', 'bracu': 'braću',
  'druze': 'druže', 'dusman': 'dušman', 'dusmani': 'dušmani', 'drustvo': 'društvo',
  'dacu': 'daću', 'daces': 'daćeš', 'dace': 'daće', 'dacemo': 'daćemo', 'dacete': 'daćete',
  'progledacu': 'progledaću', 'progledaces': 'progledaćeš', 'progledace': 'progledaće',
  'los': 'loš', 'losa': 'loša', 'lose': 'loše', 'losoj': 'lošoj', 'losim': 'lošim', 'losih': 'loših', 'losima': 'lošima',
  'pogresan': 'pogrešan', 'pogresna': 'pogrešna', 'pogresno': 'pogrešno', 'pogresne': 'pogrešne', 'pogresnima': 'pogrešnima', 'pogresnim': 'pogrešnim',
  'ledja': 'leđa', 'ledjima': 'leđima',
  'napola': 'napola',
  'gresan': 'grešan', 'gresna': 'grešna', 'gresno': 'grešno', 'gresni': 'grešni', 'greska': 'greška', 'greske': 'greške', 'gresku': 'grešku',
  'oprostaj': 'oproštaj', 'boze': 'Bože',
  'sreca': 'sreća', 'srece': 'sreće', 'srecu': 'sreću', 'sreci': 'sreći', 'srecan': 'srećan', 'srecna': 'srećna', 'srecno': 'srećno', 'srecni': 'srećni',
  'nesrecan': 'nesrećan', 'nesrecna': 'nesrećna', 'nesrecno': 'nesrećno',
  'dusa': 'duša', 'duse': 'duše', 'duso': 'dušo', 'dusi': 'duši', 'dusu': 'dušu', 'dusom': 'dušom',
  'srce': 'srce', 'srca': 'srca', 'srcu': 'srcu', 'srcem': 'srcem',
  'ruza': 'ruža', 'ruze': 'ruže', 'ruzo': 'ružo', 'ruzu': 'ružu', 'ruzama': 'ružama', 'ruzmarin': 'ružmarin',
  'kisa': 'kiša', 'kise': 'kiše', 'kisi': 'kiši', 'kisu': 'kišu', 'kisom': 'kišom', 'kisna': 'kišna',
  'tisina': 'tišina', 'tisine': 'tišine', 'tisini': 'tišini', 'tisinu': 'tišinu',
  'cvece': 'cveće', 'cvijece': 'cvijeće', 'cvet': 'cvet', 'cvijet': 'cvijet', 'cvjetic': 'cvjetić',
  'casa': 'čaša', 'case': 'čaše', 'casu': 'čašu', 'casom': 'čašom', 'caso': 'čašo',
  'flasa': 'flaša', 'flase': 'flaše', 'flasu': 'flašu',
  'krcma': 'krčma', 'krcme': 'krčme', 'krcmar': 'krčmar', 'krcmarica': 'krčmarica',
  'tamburasi': 'tamburaši', 'harmonikas': 'harmonikaš', 'trubaci': 'trubači', 'svirac': 'svirač', 'sviraci': 'svirači',
  'pevac': 'pevač', 'pjevac': 'pjevač', 'pevaci': 'pevači', 'pjevaci': 'pjevači', 'pevacica': 'pevačica', 'pjevacica': 'pjevačica',
  'igrac': 'igrač', 'igraci': 'igrači', 'igracica': 'igračica',
  'muzicar': 'muzičar', 'muzicari': 'muzičari',
  'cist': 'čist', 'cista': 'čista', 'cisto': 'čisto', 'cisti': 'čisti',
  'vruc': 'vruć', 'vruca': 'vruća', 'vruce': 'vruće', 'vruci': 'vrući',
  'kuca': 'kuća', 'kuce': 'kuće', 'kuci': 'kući', 'kucu': 'kuću', 'kucom': 'kućom', 'kucni': 'kućni',
  'covjek': 'čovjek', 'covik': 'čovik', 'covjeka': 'čovjeka', 'covek': 'čovek', 'coveka': 'čoveka',
  'bivsa': 'bivša', 'bivsi': 'bivši', 'bivse': 'bivše', 'bivsu': 'bivšu',
  'zena': 'žena', 'zene': 'žene', 'zeno': 'ženo', 'zenu': 'ženu',
  'oci': 'oči', 'ociju': 'očiju', 'ocima': 'očima', 'celo': 'čelo', 'cela': 'čela',
  'prica': 'priča', 'price': 'priče', 'pricu': 'priču', 'pricaj': 'pričaj', 'pricam': 'pričam', 'pricas': 'pričaš', 'pricaju': 'pričaju',
  'poljubac': 'poljubac', 'poljupci': 'poljupci', 'poljubi': 'poljubi', 'poljubac': 'poljubac',
  'zagrljaj': 'zagrljaj', 'zagrli': 'zagrli', 'zagrlim': 'zagrlim', 'zagrlis': 'zagrliš',
  'prazno': 'prazno', 'prazna': 'prazna', 'prazan': 'prazan',
  'zvezda': 'zvezda', 'zvijezda': 'zvijezda', 'zvezde': 'zvezde', 'zvijezde': 'zvijezde'
};

const NON_EXYU_WORDS = new Set([
  'epic', 'magic', 'music', 'classic', 'toxic', 'basic', 'panic', 'sonic', 'logic', 'comic',
  'topic', 'optic', 'traffic', 'public', 'plastic', 'static', 'electronic', 'acoustic', 'electric'
]);

export function restoreExYuDiacritics(text) {
  if (!text) return '';
  return text.replace(/\b[a-zA-ZčćšđžČĆŠĐŽ]+\b/g, (word) => {
    const lower = word.toLowerCase();
    
    // Direct Dictionary Match
    if (DIACRITIC_MAP[lower]) {
      const repl = DIACRITIC_MAP[lower];
      if (word.charAt(0) === word.charAt(0).toUpperCase()) {
        return repl.charAt(0).toUpperCase() + repl.slice(1);
      }
      return repl;
    }

    // Ex-Yu Surnames ending in -ic (e.g. Vujic -> Vujić, Petrovic -> Petrović, Kovacevic -> Kovačević)
    if (lower.length > 4 && lower.endsWith('ic') && !NON_EXYU_WORDS.has(lower)) {
      let repl = lower.slice(0, -2) + 'ić';
      // If starts with Col -> Čol, Kovac -> Kovač
      if (repl.startsWith('col')) repl = 'čol' + repl.slice(3);
      if (repl.startsWith('kovac')) repl = 'kovač' + repl.slice(5);
      if (repl.startsWith('besl')) repl = 'bešl' + repl.slice(4);
      if (repl.startsWith('sulk')) repl = 'šulk' + repl.slice(4);
      if (word.charAt(0) === word.charAt(0).toUpperCase()) {
        return repl.charAt(0).toUpperCase() + repl.slice(1);
      }
      return repl;
    }

    // Ex-Yu Surnames genitive ending in -ica (e.g. Vujica -> Vujića, Petrovica -> Petrovića)
    if (lower.length > 5 && lower.endsWith('ica') && !NON_EXYU_WORDS.has(lower) && !['ptica', 'vučica', 'vucica', 'lisica', 'ulica', 'subotica', 'zenica', 'kraljica', 'varalica'].includes(lower)) {
      if (/[jvnrtk]ica$/.test(lower)) {
        let repl = lower.slice(0, -3) + 'ića';
        if (word.charAt(0) === word.charAt(0).toUpperCase()) {
          return repl.charAt(0).toUpperCase() + repl.slice(1);
        }
        return repl;
      }
    }

    return word;
  });
}

export function correctGrammarAndSpelling(text) {
  if (!text) return '';

  let t = text;

  // 1. Verb Negations (Odvojeno pisanje negacije uz glagole)
  const NEGATION_MAP = [
    [/\bneznam\b/gi, 'ne znam'],
    // Adjective and Adverb Negations (MUST ALWAYS BE TOGETHER in Bosnian grammar)
    [/\bne\s*mogu[cć]e\b/gi, 'nemoguće'],
    [/\bne\s*mogu[cć]a\b/gi, 'nemoguća'],
    [/\bne\s*mogu[cć]\b/gi, 'nemoguć'],
    [/\bne\s*mogu[cć]i\b/gi, 'nemogući'],
    [/\bne\s*mogu[cć]ih\b/gi, 'nemogućih'],
    [/\bne\s*mogu[cć]eg\b/gi, 'nemogućeg'],
    [/\bne\s*mogu[cć]nost\b/gi, 'nemogućnost'],
    [/\bne\s*poznat/gi, 'nepoznat'],
    [/\bne\s*sre[cć]/gi, 'nesreć'],
    [/\bne\s*vjerna\b/gi, 'nevjerna'],
    [/\bne\s*verna\b/gi, 'neverna'],
    [/\bne\s*vjeran\b/gi, 'nevjeran'],
    [/\bne\s*veran\b/gi, 'neveran'],
    [/\bne\s*pravda\b/gi, 'nepravda'],
    [/\bne\s*zaborav/gi, 'nezaborav'],
    [/\bne\s*odoljiv/gi, 'neodoljiv'],
    [/\bne\s*sigur/gi, 'nesigur'],
    [/\bne\s*povrat/gi, 'nepovrat'],
    [/\bne\s*prolaz/gi, 'neprolaz'],
    [/\bne\s*vidljiv/gi, 'nevidljiv'],
    [/\bne\s*mirn/gi, 'nemirn'],

    // Verb Negations (MUST BE SEPARATE, except neću, nemam, nemoj, nisam)
    [/\bneznas\b/gi, 'ne znaš'],
    [/\bnezna\b/gi, 'ne zna'],
    [/\bneznamo\b/gi, 'ne znamo'],
    [/\bneznate\b/gi, 'ne znate'],
    [/\bneznaju\b/gi, 'ne znaju'],
    [/\bnemogu\b(?!\s*[cć])/gi, 'ne mogu'],
    [/\bnemozes\b/gi, 'ne možeš'],
    [/\bnemoze\b/gi, 'ne može'],
    [/\bnemozemo\b/gi, 'ne možemo'],
    [/\bnemozete\b/gi, 'ne možete'],
    [/\bnevolim\b/gi, 'ne volim'],
    [/\bnevolis\b/gi, 'ne voliš'],
    [/\bnevoli\b/gi, 'ne voli'],
    [/\bnevolimo\b/gi, 'ne volimo'],
    [/\bnevolite\b/gi, 'ne volite'],
    [/\bnebrini\b/gi, 'ne brini'],
    [/\bnebrinite\b/gi, 'ne brinite'],
    [/\bnedas\b/gi, 'ne daš'],
    [/\bnedam\b/gi, 'ne dam'],
    [/\bneda\b/gi, 'ne da'],
    [/\bnedamo\b/gi, 'ne damo'],
    [/\bnedaju\b/gi, 'ne daju'],
    [/\bnevidim\b/gi, 'ne vidim'],
    [/\bnevidis\b/gi, 'ne vidiš'],
    [/\bnevidi\b/gi, 'ne vidi'],
    [/\bnevidimo\b/gi, 'ne vidimo'],
    [/\bnecujem\b/gi, 'ne čujem'],
    [/\bnecujes\b/gi, 'ne čuješ'],
    [/\bnecuje\b/gi, 'ne čuje'],
    [/\bnecujemo\b/gi, 'ne čujemo'],
    [/\bnezelim\b/gi, 'ne želim'],
    [/\bnezelis\b/gi, 'ne želiš'],
    [/\bnezeli\b/gi, 'ne želi'],
    [/\bnezelimo\b/gi, 'ne želimo'],
    [/\bnesmes\b/gi, 'ne smeš'],
    [/\bnesmem\b/gi, 'ne smem'],
    [/\bnesme\b/gi, 'ne sme'],
    [/\bnesmijes\b/gi, 'ne smiješ'],
    [/\bnesmijem\b/gi, 'ne smijem'],
    [/\bnesmije\b/gi, 'ne smije'],
    [/\bnediraj\b/gi, 'ne diraj'],
    [/\bnedaj\b/gi, 'ne daj'],
    [/\bneboj\s+se\b/gi, 'ne boj se'],
    [/\bnevredi\b/gi, 'ne vredi'],
    [/\bnevrijedi\b/gi, 'ne vrijedi'],
    [/\bnemari\b/gi, 'ne mari'],
    [/\bneplaci\b/gi, 'ne plači'],
    [/\bnepitajte\b/gi, 'ne pitajte'],
    [/\bnepitaj\b/gi, 'ne pitaj'],
    [/\bnestani\b/gi, 'ne stani'],
    [/\bneidi\b/gi, 'ne idi'],
    [/\bnecekaj\b/gi, 'ne čekaj']
  ];

  for (const [pattern, repl] of NEGATION_MAP) {
    t = t.replace(pattern, (match) => {
      if (match.charAt(0) === match.charAt(0).toUpperCase()) {
        return repl.charAt(0).toUpperCase() + repl.slice(1);
      }
      return repl;
    });
  }

  // 1b. Restore Authentic Apostrophes and Contractions
  t = t
    .replace(/\b(?:da\s*l|dal)[\x27\u2018\u2019]?(?=\s+|$)/gi, (m) => m[0] === m[0].toUpperCase() ? "Da l\x27" : "da l\x27")
    .replace(/\b(?:je\s*l|jel)[\x27\u2018\u2019]?(?=\s+|$)/gi, (m) => m[0] === m[0].toUpperCase() ? "Je l\x27" : "je l\x27")
    .replace(/\b(?:i\s*l|il)[\x27\u2018\u2019]?(?=\s+|$)/gi, (m) => m[0] === m[0].toUpperCase() ? "Il\x27" : "il\x27")
    .replace(/\b(?:ne\s*k|nek)[\x27\u2018\u2019]?(?=\s+|$)/gi, (m) => m[0] === m[0].toUpperCase() ? "Nek\x27" : "nek\x27")
    .replace(/\b(?:a\s*l|al)[\x27\u2018\u2019]?(?=\s+|$)/gi, (m) => m[0] === m[0].toUpperCase() ? "Al\x27" : "al\x27")
    .replace(/\b(?:k\s*o)[\x27\u2018\u2019]?(?=\s+|$)/gi, (m) => m[0] === m[0].toUpperCase() ? "K\x27o" : "k\x27o")
    .replace(/\b(stig|dotak|rek|vid|uz|otis|nas|pros)o\b/gi, (m, root) => `${root}\x27o`)
    .replace(/\b(stig|dotak|rek|vid|uz|otiš|naš|proš)o\b/gi, (m, root) => `${root}\x27o`);

  // Collapse multiple consecutive apostrophes/quotes
  t = t.replace(/['’`]{2,}/g, "'");

  // 2. Clitic and Preposition Grammar (Predlozi i čestice)
  const GRAMMAR_FIXES = [
    [/\bsamnom\b/gi, 'sa mnom'],
    [/\bs'\s*tobom\b/gi, 's tobom'],
    [/\bs'\s*njim\b/gi, 's njim'],
    [/\bs'\s*njom\b/gi, 's njom'],
    [/\bs'\s*nama\b/gi, 's nama'],
    [/\bs'\s*vama\b/gi, 's vama'],
    [/\bs'\s*mene\b/gi, 's mene'],
    [/\bbezveze\b/gi, 'bez veze'],
    [/\bu\s*stvari\b/gi, 'u stvari'],
    [/\bu\s*inad\b/gi, 'u inat'],
    [/\binat\b/gi, 'inat'],
    [/\bkodkuce\b/gi, 'kod kuće'],
    [/\biz\s+pocetka\b/gi, 'ispočetka'],
    [/\biz\s+početka\b/gi, 'ispočetka'],
    
    // Future tense of verbs ending in -ći
    [/\brecicu\b/gi, 'reći ću'],
    [/\brecices\b/gi, 'reći ćeš'],
    [/\brecice\b/gi, 'reći će'],
    [/\brecicemo\b/gi, 'reći ćemo'],
    [/\brecicete\b/gi, 'reći ćete'],
    [/\bdocicu\b/gi, 'doći ću'],
    [/\bdocices\b/gi, 'doći ćeš'],
    [/\bdocice\b/gi, 'doći će'],
    [/\bnacicu\b/gi, 'naći ću'],
    [/\bnacices\b/gi, 'naći ćeš'],
    [/\bnacice\b/gi, 'naći će'],
    [/\bpocicu\b/gi, 'poći ću'],
    [/\bpocices\b/gi, 'poći ćeš'],
    [/\bpocice\b/gi, 'poći će'],
    [/\bna\s*pola\b/gi, 'napola'],
    [/\bprogle[- ]*dace+[e]*\b/gi, 'progledaće'],
    [/\bprogle[- ]*daće+[e]*\b/gi, 'progledaće'],
    [/\bprogle[- ]*dacu+[u]*\b/gi, 'progledaću'],
    [/\boticicu\b/gi, 'otići ću'],
    [/\boticices\b/gi, 'otići ćeš'],
    [/\boticice\b/gi, 'otići će']
  ];

  for (const [pattern, repl] of GRAMMAR_FIXES) {
    t = t.replace(pattern, (match) => {
      if (match.charAt(0) === match.charAt(0).toUpperCase()) {
        return repl.charAt(0).toUpperCase() + repl.slice(1);
      }
      return repl;
    });
  }

  // 3. Restore all authentic Ex-Yu diacritics
  t = restoreExYuDiacritics(t);

  return t;
}

const INVERTED_ABBR_MAP = {
  's. isovic': 'Safet Isović',
  's. isović': 'Safet Isović',
  'n. fosili': 'Novi Fosili',
  'n.fosili': 'Novi Fosili',
  'p. orkestar': 'Plavi Orkestar',
  'p.orkestar': 'Plavi Orkestar',
  'b. dugme': 'Bijelo Dugme',
  'b.dugme': 'Bijelo Dugme',
  'c. jabuka': 'Crvena Jabuka',
  'c.jabuka': 'Crvena Jabuka',
  'r. corba': 'Riblja Čorba',
  'r.corba': 'Riblja Čorba',
  'p. valjak': 'Parni Valjak',
  'p.valjak': 'Parni Valjak',
  'd. merlin': 'Dino Merlin',
  'd.merlin': 'Dino Merlin',
  'h. beslic': 'Halid Bešlić',
  'h.beslic': 'Halid Bešlić',
  'z. colic': 'Zdravko Čolić',
  'z.colic': 'Zdravko Čolić',
  't. zdravkovic': 'Toma Zdravković',
  't.zdravkovic': 'Toma Zdravković',
  'm. ilic': 'Miroslav Ilić',
  'm.ilic': 'Miroslav Ilić',
  's. saulic': 'Šaban Šaulić',
  's.saulic': 'Šaban Šaulić'
};

export function detectAndFixInvertedSongAndArtist(rawTitle, rawArtist) {
  let title = (rawTitle || '').trim();
  let artist = (rawArtist || '').trim();
  const titleLower = title.toLowerCase();

  // If title is an abbreviation like "S. isović" or "N. fosili"
  if (INVERTED_ABBR_MAP[titleLower]) {
    const realArtist = INVERTED_ABBR_MAP[titleLower];
    const realTitle = cleanOfficialTitle(artist, realArtist);
    return { title: realTitle, artist: realArtist, wasInverted: true };
  }

  return { title, artist, wasInverted: false };
}

const KNOWN_BANDS_NORM = new Set([
  'gunsnroses', 'pipschipsvideoclips', 'kandakodzainebojsa', 'bajagainstruktori',
  'darkorundekcargoorkestar', 'kikilesendricpiloti', 'tomislavbralicklapaintrade',
  'vladadivljanoldstarsband', 'danicakrsticdivanhana', 'goatmarethehellspades',
  'rocknroll', 'flamingosi', 'prljavokazaliste', 'parnivaljak', 'crvenajabuka',
  'bijelodugme', 'plaviorkestar', 'ribljacorba', 'atomskoskloniste', 'yugrupa'
]);

export function cleanArtistName(rawName) {
  if (!rawName) return '';
  let n = toLatin(rawName).trim();
  n = cleanAccidentalCaps(n);

  // 1. Strip Parentheses and Brackets (Prefix, Suffix, or Inline annotations)
  n = n.replace(/^\s*[\(\[][^\)\]]*[\)\]]\s*/, '').trim();
  n = n.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').trim();
  n = n.replace(/[\.\-\_\,\:\;]+$/, '').trim();

  // 2. If in format "Lastname, Firstname" -> "Firstname Lastname"
  if (n.includes(',')) {
    const parts = n.split(',').map(p => p.trim());
    if (parts.length === 2 && parts[1].length > 0) {
      n = `${parts[1]} ${parts[0]}`;
    }
  }

  // 3. Handle Duets: Extract Primary Solo Artist (e.g. "Aca Zivanović & Gabrijela Pejčev" -> "Aca Živanović")
  const norm = n.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!KNOWN_BANDS_NORM.has(norm)) {
    const duetRegex = /\s*(?:&|\bfeat\.?|\bft\.?|\bfeaturing|\bduet\s+sa|\bx\b|\b×\b)\s*/i;
    if (duetRegex.test(n)) {
      const parts = n.split(duetRegex).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2 && parts[0].length >= 2) {
        n = parts[0];
      }
    }
  }

  // 4. Strict Title Case: Capitalize every single word (e.g. "mirnes solak" -> "Mirnes Solak", "Mirnes solak" -> "Mirnes Solak")
  const words = n.split(/(\s+|-)/);
  const lowercaseParticles = new Set(['i', 'u', 'na', 'o', 'po', 'sa', 'za', 'do', 'od', 'iz', 'k', 's', 'te', 'pa', 'ni', 'niti', '&']);

  const capitalizedWords = words.map((word, idx) => {
    if (/^\s+$/.test(word) || word === '-') return word;
    const lower = word.toLowerCase();
    if (idx > 0 && lowercaseParticles.has(lower)) {
      return lower;
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  n = capitalizedWords.join('');
  n = correctGrammarAndSpelling(n);

  const CANONICAL_ARTIST_OVERRIDES = {
    'bajaga': 'Bajaga i Instruktori',
    'bajaga i instruktori': 'Bajaga i Instruktori',
    'bajaga & instruktori': 'Bajaga i Instruktori',
    'bajaga i bebi dol': 'Bajaga i Instruktori',
    'bajaga i bora djordjević': 'Bajaga i Instruktori',
    'bajaga i bora djordjevic': 'Bajaga i Instruktori',
    'bajaga i loša': 'Bajaga i Instruktori',
    'bajaga i losa': 'Bajaga i Instruktori',
    'bajaga i miloš biković': 'Bajaga i Instruktori',
    'bajaga i milos bikovic': 'Bajaga i Instruktori',
    'bajaga, point blank, dragi jelić': 'Bajaga i Instruktori',
    'momčilo bajagić': 'Bajaga i Instruktori',
    'momcilo bajagic': 'Bajaga i Instruktori',
    'aca pejovic': 'Aco Pejović',
    'aca pejović': 'Aco Pejović',
    'aco pejovic': 'Aco Pejović',
    'aco lukas': 'Aca Lukas',
    'aldino': "Al'Dino",
    'al dino': "Al'Dino"
  };

  const overrideKey = n.toLowerCase();
  if (CANONICAL_ARTIST_OVERRIDES[overrideKey]) {
    return CANONICAL_ARTIST_OVERRIDES[overrideKey];
  }

  return n;
}

export function cleanOfficialTitle(title, artistName = '') {
  if (!title) return '';
  let t = toLatin(title).trim();
  t = cleanAccidentalCaps(t);

  // Normalize Unicode dashes (–, —, −) to regular hyphen
  t = t.replace(/[\u2013\u2014\u2212]/g, '-');

  // 1. Strip ALL Parenthesized/Bracketed text at the end of title (with or without leading space)
  // e.g. "Skitnik(moja verzija)" -> "Skitnik", "Kopriva (verzija 2, ispravka)" -> "Kopriva", "Marina [live]" -> "Marina"
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/g, '').trim();
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/g, '').trim();

  // 2. Strip trailing or leading dashes/plus forspil/solo/intro
  t = t.replace(/\s*[\+\-]\s*(?:forspil|foršpil|solo|uvod|intro|outro|akordi|tekst|pesmarica|tacnaharmonija|cover|obrada|live|uzivo|official|by\s+[a-zA-Z0-9\s]+).*$/gi, '').trim();

  // 3. Strip trailing standalone keywords at the end of title
  // e.g. "Bstra voda solo" -> "Bistra voda", "Kao ja da poludis intro" -> "Kao ja da poludis"
  t = t.replace(/\s+(?:solo|uvod|intro|outro|forspil|foršpil|prelaz|akordi|tekst|tabovi|tab|live|uzivo|uživo|cover|obrada|remix|akustik|matrica|karaoke|original|ispravno|ver\.?\s*\d+|verzija\s*\d+)\s*$/gi, '').trim();

  // 4. If starts with Artist e.g. "Dino Merlin - Moj je život Švicarska" or "Dino Merlin-Moj je život Švicarska"
  if (artistName && t.toLowerCase().startsWith(toLatin(artistName).toLowerCase())) {
    t = t.slice(artistName.length).replace(/^\s*-\s*/, '').trim();
  } else {
    // Check generic prefix "Artist - Title"
    const prefixMatch = t.match(/^([a-zA-ZčćšđžČĆŠĐŽ\s]{3,30})\s*-\s*(.+)$/);
    if (prefixMatch && artistName && prefixMatch[1].toLowerCase().includes(toLatin(artistName).toLowerCase().slice(0, 4))) {
      t = prefixMatch[2].trim();
    }
  }

  // 5. If ends with Artist e.g. "Ljubavna adresa-Zeljko Samardzić" or "Ljubavna adresa - Željko Samardžić"
  if (artistName) {
    const cleanA = toLatin(artistName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const parts = t.split(/\s*-\s*/);
    if (parts.length >= 2) {
      const lastPartNorm = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lastPartNorm && (cleanA.includes(lastPartNorm) || lastPartNorm.includes(cleanA))) {
        t = parts.slice(0, -1).join(' - ').trim();
      }
    }
  }

  // Generic trailing artist pattern e.g. "Title - Name Surname" or "Title-Name Surname"
  const suffixMatch = t.match(/^(.*?)\s*-\s*([a-zA-ZčćšđžČĆŠĐŽ\s]{3,35})$/);
  if (suffixMatch && suffixMatch[1].trim().length >= 3) {
    const afterDash = suffixMatch[2].trim();
    if (afterDash.split(/\s+/).length >= 2 || (artistName && toLatin(artistName).toLowerCase().includes(afterDash.toLowerCase().slice(0, 4)))) {
      t = suffixMatch[1].trim();
    }
  }

  // 6. Clean trailing punctuation
  t = t.replace(/[\s\.\-\_\,\:\;]+$/, '').trim();

  // 7. ANTI-CAPS LOCK: If entire title is in ALL CAPS, convert to proper Title/Sentence case
  const lettersOnly = t.replace(/[^a-zA-ZčćšđžČĆŠĐŽ]/g, '');
  const isAcronym = /^[A-ZČĆŠĐŽ]{1,4}$/.test(lettersOnly) || /^[A-ZČĆŠĐŽ]\.(?:\s*[A-ZČĆŠĐŽ]\.)+$/.test(t);
  if (lettersOnly.length > 4 && t === t.toUpperCase() && !isAcronym) {
    t = t.toLowerCase();
    t = t.replace(/\b[a-zA-ZčćšđžČĆŠĐŽ]/g, (c) => c.toUpperCase());
  }

  // 8. Restore authentic Ex-Yu grammar, spelling, and diacritics
  t = t.replace(/\bBstra\s+voda\b/gi, 'Bistra voda');
  t = correctGrammarAndSpelling(t);

  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }

  return t;
}

export function normalizeLineCasing(line) {
  if (!line || line.startsWith('[')) return line;
  line = cleanAccidentalCaps(line);
  
  const textOnly = line.replace(/\[[A-H][b#]?[^\]]*\]/g, '').trim();
  const letters = textOnly.replace(/[^a-zA-ZčćšđžČĆŠĐŽ]/g, '');
  if (letters.length > 5 && textOnly === textOnly.toUpperCase()) {
    let isFirstLetter = true;
    return line.replace(/(\[[^\]]+\])|([^\[\]]+)/g, (match, chord, text) => {
      if (chord) return chord;
      if (text) {
        let lowered = text.toLowerCase();
        if (isFirstLetter) {
          lowered = lowered.replace(/^(\s*)([a-zA-ZčćšđžČĆŠĐŽ])/, (m, spaces, char) => spaces + char.toUpperCase());
          isFirstLetter = false;
        }
        return lowered;
      }
      return match;
    });
  }
  return line;
}

export function normalizeTitleForDeduplication(t) {
  if (!t) return '';
  return t
    .replace(/\s*\((?:ispravno|original|cover|akordi|tabovi|live|ms|akordi i tekst|sa prelazima|[a-h][b#]?m?)[^\)]*\)/gi, '')
    .replace(/[\(\)\[\]\{\}\-\_\,\.\:\"]/g, ' ')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/đ/g, 'dj')
    .replace(/ž/g, 'z')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function countChordsInContent(content) {
  if (!content || typeof content !== 'string') return 0;
  const matches = content.match(/\[[A-H][b#]?[^\]]*\]/g);
  return matches ? matches.length : 0;
}

export function cleanTabLine(line) {
  if (!line) return '';
  return line.replace(/[-_]{2,}/g, (m) => ' '.repeat(m.length));
}

export function normalizeChord(chord, currentKey = '') {
  if (!chord) return '';
  let c = chord.trim();
  c = c.replace(/^[\[\(]+/, '').replace(/[\]\)\.,:]+$/, '');
  
  // Handle Slash Chords (Inversions / Bass notes e.g. G/B -> G/H, Am/F#)
  if (c.includes('/')) {
    const parts = c.split('/');
    if (parts.length === 2) {
      const rootChord = normalizeChord(parts[0], currentKey);
      let bass = parts[1].trim();
      bass = bass
        .replace(/^Bb/g, 'A#')
        .replace(/^Eb/g, 'D#')
        .replace(/^Ab/g, 'G#')
        .replace(/^Db/g, 'C#')
        .replace(/^Gb/g, 'F#')
        .replace(/^Cb/g, 'H');
      if (bass === 'B') {
        bass = (currentKey && (currentKey.startsWith('E') || currentKey.startsWith('A') || currentKey.startsWith('D') || currentKey.startsWith('G') || currentKey.startsWith('C'))) ? 'H' : 'A#';
      }
      return `${rootChord}/${bass}`;
    }
  }

  // Standard flat conversions to sharps (#)
  c = c
    .replace(/^Bb/g, 'A#')
    .replace(/^Eb/g, 'D#')
    .replace(/^Ab/g, 'G#')
    .replace(/^Db/g, 'C#')
    .replace(/^Gb/g, 'F#')
    .replace(/^Cb/g, 'H');

  // In Em/Am/Dm keys, B/B7 is often dominant H/H7
  if (currentKey && (currentKey.startsWith('E') || currentKey.startsWith('A') || currentKey.startsWith('D'))) {
    c = c
      .replace(/^B7/g, 'H7')
      .replace(/^Bm/g, 'Hm')
      .replace(/^B(?=[0-9]|$)/g, 'H');
  } else {
    // Default Ex-Yu B -> A#
    c = c
      .replace(/^Bm/g, 'A#m')
      .replace(/^B7/g, 'A#7')
      .replace(/^Bmaj/g, 'A#maj')
      .replace(/^Bdim/g, 'A#dim')
      .replace(/^Bsus/g, 'A#sus')
      .replace(/^B(?=[0-9]|$)/g, 'A#');
  }

  return c;
}

export function isChordToken(token) {
  if (!token) return false;
  const clean = token.replace(/^[\[\(]+/, '').replace(/[\]\)\.,:\*]+$/, '');
  const chordRegex = /^[A-H][b#]?(?:m|maj|min|dim|aug|sus|add|M)?[0-9]*(?:[\/][A-H][b#]?)?$/;
  return chordRegex.test(clean);
}

export function isChordLine(line) {
  const cleaned = cleanTabLine(line);
  const trimmed = cleaned.trim();
  if (!trimmed) return false;
  if (/^(intro|uvod|solo|prelaz|outro|kraj|ref|refren|strofa\s*\d*|bridge|chorus|verse\s*\d*)[:\.\s]/i.test(trimmed)) {
    const withoutHeader = trimmed.replace(/^(intro|uvod|solo|prelaz|outro|kraj|ref|refren|strofa\s*\d*|bridge|chorus|verse\s*\d*)[:\.\s]+/i, '').trim();
    if (!withoutHeader) return false;
    const tokens = withoutHeader.split(/[\s,]+/).filter(Boolean);
    const chordCount = tokens.filter(isChordToken).length;
    return tokens.length > 0 && chordCount / tokens.length >= 0.7;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordCount = tokens.filter(isChordToken).length;
  return chordCount / tokens.length >= 0.7;
}

export function mergeChordsIntoText(chordLine, textLine, key = '') {
  const cleanedChordLine = cleanTabLine(chordLine);
  const regex = /\S+/g;
  let match;
  const chords = [];
  while ((match = regex.exec(cleanedChordLine)) !== null) {
    if (isChordToken(match[0])) {
      chords.push({ col: match.index, chord: normalizeChord(match[0], key) });
    }
  }

  if (chords.length === 0) return textLine;

  let result = textLine;
  for (let i = chords.length - 1; i >= 0; i--) {
    const { col, chord } = chords[i];
    if (col < result.length) {
      result = result.slice(0, col) + '[' + chord + ']' + result.slice(col);
    } else {
      const padding = ' '.repeat(col - result.length);
      result = result + padding + '[' + chord + ']';
    }
  }
  return result;
}

export function formatStandaloneChords(line, key = '') {
  let cleaned = cleanTabLine(line);
  // Auto-enclose Intro/Solo/Outro chords separated by dashes or pipes: "| Am | G | F | E |" -> "[Am] [G] [F] [E]"
  cleaned = cleaned.replace(/[\|\-]+/g, ' ');
  const tokens = cleaned.split(/[\s,]+/).filter(Boolean);
  const formatted = tokens.map(t => {
    const clean = t.replace(/^[\[\(]+/, '').replace(/[\]\)\.,:\*]+$/, '');
    if (isChordToken(clean)) {
      return `[${normalizeChord(clean, key)}]`;
    }
    return t;
  });
  return formatted.join(' ');
}

export function stripWatermarksAndSignatures(lines) {
  const filtered = [];
  
  const watermarkRegex = /^(?:made\s*by|skinuo|skinula|skidao|obradio|obradila|tab\s*by|poslao|poslala|autor|by|uradio|uradila|akorde\s*postavio|transkripcija|transkribovao|tekst\s*i\s*akordi|uploader|postavio|chords\s*by|tabbed\s*by|arranged\s*by|kontakt|e-mail|mail|kontakt\s*mail|fb|facebook|instagram|pesmarica|tacnaharmonija|2akordi|gitare\.info|pozdrav|hvala|uzivajte|napomena)[:\s\-].*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line matches common uploader watermark pattern
    if (watermarkRegex.test(trimmed)) {
      continue;
    }

    // Check if line is a Capo / Tuning / Key annotation e.g. "Capo 1st", "Capo 2nd", "Kapodaster 1", "Tuning: Standard"
    if (/^[\(\[]?\s*(?:capo|kapo|kapodaster|tuning|stim|štim|tonalitet|original\s*iz)\b[^\n\]\)]*[\)\]]?$/i.test(trimmed)) {
      continue;
    }

    // Check if line is a standalone url or email
    if (/^(?:https?:\/\/|www\.)[^\s]+$/i.test(trimmed) || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      continue;
    }

    // If near the end of the song and line looks like initials or "by Name"
    if (i >= lines.length - 4) {
      if (/^(?:by\s+[a-zA-Z0-9\sčćšđžČĆŠĐŽ]+|[\(\[]?[a-zA-ZčćšđžČĆŠĐŽ]\.[a-zA-ZčćšđžČĆŠĐŽ]\.?[\)\]]?|[-–—\s]*[a-zA-ZčćšđžČĆŠĐŽ\s]{2,15}[-–—\s]*)$/i.test(trimmed) && !line.includes('[')) {
        if (!/^(intro|uvod|solo|prelaz|outro|kraj|ref|refren|strofa)/i.test(trimmed) && trimmed.length < 25 && !trimmed.includes(',')) {
          continue;
        }
      }
    }

    filtered.push(line);
  }

  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
    filtered.pop();
  }

  return filtered;
}

export function cleanSyllableHyphenation(text) {
  if (!text) return '';
  let t = text;

  // 1. Remove hyphens glued between syllables and chords:
  // e.g. "mu[G]-ko" -> "mu[G]ko", "tu[G]-go" -> "tu[G]go", "sr[G]-ce" -> "sr[G]ce"
  t = t.replace(/([a-zA-ZčćšđžČĆŠĐŽ])\s*(\[[A-H][b#]?[^\]]*\])\s*-\s*([a-zA-ZčćšđžČĆŠĐŽ])/g, '$1$2$3');
  t = t.replace(/([a-zA-ZčćšđžČĆŠĐŽ])\s*-\s*(\[[A-H][b#]?[^\]]*\])\s*([a-zA-ZčćšđžČĆŠĐŽ])/g, '$1$2$3');
  t = t.replace(/(\[[A-H][b#]?[^\]]*\])\s*-\s*([a-zA-ZčćšđžČĆŠĐŽ])/g, '$1$2');
  t = t.replace(/([a-zA-ZčćšđžČĆŠĐŽ])\s*-\s*(\[[A-H][b#]?[^\]]*\])/g, '$1$2');

  // 2. Remove syllable break hyphens inside words from tabs:
  // e.g. "za-bo-ra-vim" -> "zaboravim", "do-ta-ko" -> "dotako"
  t = t.replace(/\b([a-zA-ZčćšđžČĆŠĐŽ]{1,5})\s*-\s*([a-zA-ZčćšđžČĆŠĐŽ]{1,5})\b/g, (match, p1, p2) => {
    const compounds = new Set(['crno-bela', 'crno-bijela', 'crno-beli', 'crno-bijeli', 'dan-dva', 'kad-tad', 'malo-pomalo', 'hoces-neces', 'hoćeš-nećeš']);
    if (compounds.has(match.toLowerCase())) return match;
    return p1 + p2;
  });

  // 3. Fix nested or malformed brackets:
  // e.g. "[C[Dm]]" -> "[Dm]", "[A[E7]m]" -> "[E7]"
  t = t.replace(/\[[A-H][b#]?[^\]]*\[([A-H][b#]?[^\]]*)\][^\]]*\]/g, '[$1]');
  t = t.replace(/\[([A-H][b#]?[^\]]*)\[([A-H][b#]?[^\]]*)\]/g, '[$1] [$2]');

  // 4. Eliminate multiple consecutive identical or clashing chords on a single syllable
  t = t.replace(/(\[[A-H][b#]?[^\]]*\]){2,}/g, (match) => {
    const chords = [...match.matchAll(/\[([A-H][b#]?[^\]]*)\]/g)].map(m => m[0]);
    return chords[0];
  });

  // 5. Fix double-bracket hash corruptions: e.g. "[D]#]" -> "[D#]"
  t = t.replace(/\[([A-H])\]#\]/g, '[$1#]');

  // 6. Fix dangling "#]" after text words: e.g. "stra#]ne" -> "strane", "vidi#]" -> "vidi"
  t = t.replace(/([^\[A-H][a-zA-ZčćšđžČĆŠĐŽ]*)#\]/g, '$1');
  t = t.replace(/(?<!\[[A-H][a-z0-9]*)#\]/g, '');

  // 7. Snap chords inside words to word boundaries:
  // e.g. "v[D#]elika" -> "[D#]velika"
  t = t.replace(/(?<=\s|^)([a-zA-ZčćšđžČĆŠĐŽ]{1,3})(\[[A-H][b#]?[^\]]*\])([a-zA-ZčćšđžČĆŠĐŽ]+)(?=\s|[,\.!\?]|$)/g, '$2$1$3');
  // e.g. "živo[F]t" -> "[F]život"
  t = t.replace(/(?<=\s|^)([a-zA-ZčćšđžČĆŠĐŽ]+)(\[[A-H][b#]?[^\]]*\])([a-zA-ZčćšđžČĆŠĐŽ]{1,2})(?=\s|[,\.!\?]|$)/g, '$2$1$3');
  // e.g. "ja[A#] se" -> "ja [A#] se"
  t = t.replace(/([a-zA-ZčćšđžČĆŠĐŽ]+)(\[[A-H][b#]?[^\]]*\])(?=\s)/g, '$1 $2');
  // e.g. "p[F]a" -> "[F]pa", "n[D#]e" -> "[D#]ne"
  // 8. Parenthesis and passing chord normalizer: e.g. "[Am(G)]" -> "[Am] [G]", "(Em)" -> "[Em]"
  t = t.replace(/\[([A-H][b#]?[a-z0-9]*)\(([A-H][b#]?[a-z0-9\/]*)\)\]/gi, '[$1] [$2]');
  t = t.replace(/\[\(([A-H][b#]?[a-z0-9\/]*)\)\]/gi, '[$1]');
  t = t.replace(/\(([A-H][b#]?(?:m|maj|min|dim|aug|sus)?[0-9]*(?:[\/][A-H][b#]?)?)\)/g, '[$1]');

  return t;
}

export function stripUploaderComments(text) {
  if (!text) return '';
  let t = text;
  // Remove in-line parenthetical performance notes that aren't chords
  t = t.replace(/\s*\((?:ovde|ovdje|tu|ovamo|sada|ovde\s+ide|brzi|harmonika|solo|ti[sš]e|glasnije|3\s*puta|oprez|ritam|nisam\s+siguran|akord\s+je|pauza|stop|udarac|prelaz\s+na)[^\)]*\)/gi, '');
  // Remove full comment lines
  t = t.replace(/^\s*\((?:ovde|ovdje|tu|sada|brzi|harmonika|solo|ti[sš]e|glasnije|oprez|ritam|nisam\s+siguran|pauza|stop)[^\)]*\)\s*$/gmi, '');
  return t;
}

export function stitchBrokenLineWraps(lines) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (result.length > 0 && trimmed.length > 0 && trimmed.length <= 25 && !isSectionHeader(trimmed)) {
      const prevLine = result[result.length - 1];
      const prevTrimmed = prevLine.trim();

      if (prevTrimmed.length > 0 && !isSectionHeader(prevTrimmed)) {
        const words = trimmed.replace(/\[[^\]]+\]/g, '').trim().split(/\s+/).filter(Boolean);
        if (words.length <= 3) {
          result[result.length - 1] = prevLine + ' ' + trimmed;
          continue;
        }
      }
    }
    result.push(line);
  }
  return result;
}

export function fixMojibakeAndBBCode(text) {
  if (!text) return '';
  let t = text;
  // BBCode tags
  t = t.replace(/\[\/?(?:b|i|u|color|size|font|url|quote|code|img)[^\]]*\]/gi, '');
  
  // Windows-1250 / UTF-8 Mojibake artifacts
  t = t
    .replace(/ÄŤ/g, 'č').replace(/ÄŒ/g, 'Č')
    .replace(/Ä‡/g, 'ć').replace(/Ä†/g, 'Ć')
    .replace(/Åˇ/g, 'š').replace(/Å /g, 'Š')
    .replace(/Ä‘/g, 'đ').replace(/Ä\u0090/g, 'Đ')
    .replace(/Ĺľ/g, 'ž').replace(/Ĺ½/g, 'Ž');

  return t;
}

export function scrubForumChatter(text) {
  if (!text) return '';
  let lines = text.split('\n');
  const chatterRegex = /^(?:pozdrav|hvala|uzivajte|nemojte\s*zameriti|skidao\s*sam|skinuo\s*sam|pisite|ocenite|sretno|tekst\s*i\s*akordi\s*postavio|transkripcija|uploader|tabbed\s*by|chords\s*by|kontakt|mail|inbox|facebook|instagram|pesmarica|tacnaharmonija|2akordi|gitare\.info|ako\s*neko\s*ima|moja\s*prva\s*transkripcija)[:\s\-].*$/i;
  
  lines = lines.filter(l => {
    const trimmed = l.trim();
    if (!trimmed) return true;
    if (chatterRegex.test(trimmed)) return false;
    if (/^(?:pozdrav|hvala|uzivajte|nemojte zameriti|skidao po sluhu)[\!\.\s]*$/i.test(trimmed)) return false;
    if (/^(?:ocenite|glasajte|komentarisite|lajkujte|oceni)\b/i.test(trimmed)) return false;
    if (/^[\-\=\_\.\~\*]{4,}$/.test(trimmed)) return false; // ASCII dividers
    return true;
  });

  return lines.join('\n');
}

export function stripForumMetadataHeaders(text) {
  if (!text) return '';
  let lines = text.split('\n');
  
  const metaLineRegex = /^\s*(?:izvodja[cčć]|izvođač|izvodac|pesma|pjesma|album|godina|autor|tekst|muzika|aranzman|aranžman|transkripcija|poslao|obradio|obrada|tabovao|yt|youtube|link|audio|video|po\s*zelji|po\s*želji|narucio|naručio|skinuto\s*sa|forum|pesmarica|tacnaharmonija|2akordi|gitare\.info)\b/i;
  const urlRegex = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|pesmarica|2akordi|gitare|facebook|instagram)\S*/i;

  lines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    
    if (urlRegex.test(trimmed) && (trimmed.toLowerCase().includes('yt') || trimmed.toLowerCase().includes('youtube') || trimmed.toLowerCase().includes('watch?v='))) {
      return false;
    }
    
    if (metaLineRegex.test(trimmed)) {
      const chords = [...trimmed.matchAll(/\[[A-H][b#]?[^\]]*\]/g)];
      if (chords.length === 0) {
        return false;
      }
    }

    if (/^(?:yt|youtube|po\s*zelji|po\s*želji|godina|album|info)\s*[:\-]/i.test(trimmed)) {
      return false;
    }

    return true;
  });

  return lines.join('\n');
}

export function unrollLineMultipliers(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Check if line ends with (2x), (x2), [2x], 2x, (3x), 3x, (4x)
    const match = trimmed.match(/^(.*?)[\s\(\[]*(?:[xX]\s*([2-4])|([2-4])\s*[xX]|(?:dva|tri|cetiri)\s*puta)[\)\]]*$/i);
    if (match && !isSectionHeader(trimmed) && !/^\[.*\]:?$/.test(trimmed)) {
      const baseLine = match[1].trim();
      const count = parseInt(match[2] || match[3] || '2', 10);
      if (baseLine.length > 0) {
        for (let c = 0; c < count; c++) {
          result.push(baseLine);
        }
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

export function unrollStanzaMultipliers(text) {
  if (!text) return '';
  const sections = text.split(/\n\s*\n/);
  const unrolledSections = [];

  for (const section of sections) {
    const lines = section.trim().split('\n');
    if (lines.length === 0) continue;

    const firstLine = lines[0].trim();
    const lastLine = lines[lines.length - 1].trim();

    let repeatCount = 1;
    let cleanLines = [...lines];

    const headerMatch = firstLine.match(/^\[([a-zA-Z0-9\s\/\:\-]+?)\s*[\(\[]?(?:[xX]\s*([2-4])|([2-4])\s*[xX])[\)\]]?\]:?$/i);
    if (headerMatch) {
      repeatCount = parseInt(headerMatch[2] || headerMatch[3] || '2', 10);
      cleanLines[0] = `[${headerMatch[1].trim()}]`;
    } else if (/^[\(\[]\s*(?:[xX]\s*([2-4])|([2-4])\s*[xX]|(?:dva|tri)\s*puta)\s*[\)\]]$/i.test(lastLine)) {
      const match = lastLine.match(/([2-4])/);
      repeatCount = match ? parseInt(match[1], 10) : 2;
      cleanLines.pop();
    }

    if (repeatCount > 1) {
      const header = cleanLines[0];
      const bodyLines = cleanLines.slice(1);
      const combined = [header];
      for (let r = 0; r < repeatCount; r++) {
        combined.push(...bodyLines);
      }
      unrolledSections.push(combined.join('\n'));
    } else {
      unrolledSections.push(section);
    }
  }

  return unrolledSections.join('\n\n');
}

export function cleanRhythmSymbolsAndMultipliers(text) {
  if (!text) return '';
  let t = text;
  // Clean rhythm asterisks/tildes attached to chords: [Am]*** -> [Am]
  t = t.replace(/(\[[A-H][b#]?[^\]]*\])[\*\~\^\+]{1,5}/g, '$1');

  // Multiplier unroller for chords: "[Am] [Dm] x2" -> "[Am] [Dm] [Am] [Dm]"
  t = t.replace(/((?:\[[A-H][b#]?[^\]]*\]\s*){1,4})\s*[xX]\s*2\b/g, '$1 $1');
  t = t.replace(/((?:\[[A-H][b#]?[^\]]*\]\s*){1,4})\s*[xX]\s*3\b/g, '$1 $1 $1');
  t = t.replace(/((?:\[[A-H][b#]?[^\]]*\]\s*){1,4})\s*[xX]\s*4\b/g, '$1 $1 $1 $1');

  // Unroll stanza-level and line-level (2x)/(3x)
  t = unrollStanzaMultipliers(t);
  t = unrollLineMultipliers(t);

  // Clean empty brackets and redundant brackets
  t = t.replace(/\[\s*\]/g, '');
  t = t.replace(/\[\[+([A-H][b#]?[^\]]*)\]\]+/g, '[$1]');
  t = t.replace(/\[[—\-_]+\]/g, '');

  // Strip stray forum links, emails, and watermarks inside lyrics
  t = t.replace(/\b(?:https?:\/\/|www\.)\S+\b/gi, '');
  t = t.replace(/\b[a-zA-Z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|live|mail|email)\.[a-zA-Z]{2,}\b/gi, '');
  t = t.replace(/\b(?:pesmarica|2akordi|svakomedalje|gitare\.info)\.(?:rs|net|com|org|hr|ba)\b/gi, '');

  // Compress multiple blank lines to a single blank line
  t = t.replace(/\n{3,}/g, '\n\n');

  return t;
}

export function decodeHtmlEntities(str) {
  if (!str) return '';
  let s = fixMojibakeAndBBCode(str);
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/k&#244;/gi, "k'o")
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = parseInt(dec, 10);
      if (code === 244) return "k'o";
      return String.fromCharCode(code);
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      const code = parseInt(hex, 16);
      if (code === 0xf4) return "k'o";
      return String.fromCharCode(code);
    });
}

export function formatSectionHeader(line) {
  const t = line.trim();
  if (/^\[?(?:modulacija|modulacija\s*za\s*[1-2]\/?[1-2]?|key\s*change|prelaz\s*u\s*[a-h][b#]?m?|tonalitet\s*\+[1-2]|mod)\b[^\n\]]*\]?[:\.\s\-]*$/i.test(t)) {
    return '[Modulacija / Key Change]:';
  }
  if (/^\[?(intro|uvod|solo|prelaz|outro|kraj|ref|refren|strofa\s*\d*|pred-refren|bridge|chorus|verse\s*\d*|forspil|foršpil)\b[^\n\]]*\]?[:\.\s\-]*$/i.test(t) ||
      /^[0-9]\s*x\s*(?:ref|refren)/i.test(t)) {
    const clean = t.replace(/[\[\]:\.\-]+/g, ' ').trim();
    if (/^ref/i.test(clean) || /^[0-9]\s*x\s*ref/i.test(clean)) return '[Refren]';
    if (/^uvod/i.test(clean) || /^intro/i.test(clean)) return '[Intro / Uvod]:';
    if (/^solo/i.test(clean) || /^prelaz/i.test(clean) || /^for[sš]pil/i.test(clean)) return '[Prelaz / Solo]:';
    if (/^outro/i.test(clean) || /^kraj/i.test(clean)) return '[Outro / Finale]:';
    const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
    return `[${cap}]`;
  }
  return line;
}

export function isSectionHeader(line) {
  const t = line.trim();
  return /^\[?(intro|uvod|solo|prelaz|outro|kraj|ref|refren|strofa\s*\d*|pred-refren|bridge|chorus|verse\s*\d*|forspil|foršpil)\b[^\n\]]*\]?[:\.\s\-]*$/i.test(t) ||
         /^\[?(?:modulacija|modulacija\s*za\s*[1-2]\/?[1-2]?|key\s*change|prelaz\s*u\s*[a-h][b#]?m?|tonalitet\s*\+[1-2]|mod)\b[^\n\]]*\]?[:\.\s\-]*$/i.test(t) ||
         /^[0-9]\s*x\s*(?:ref|refren)/i.test(t);
}

export function reindexStanzas(content) {
  if (!content) return '';
  let lines = content.split('\n');
  let currentVerse = 0;
  
  lines = lines.map(line => {
    const trimmed = line.trim();
    if (/^\[Strofa\s*\d*\]$/i.test(trimmed)) {
      currentVerse++;
      return `[Strofa ${currentVerse}]`;
    }
    return line;
  });

  return lines.join('\n');
}

export function isTabLine(line) {
  if (!line) return false;
  const t = line.trim();
  if (t.length < 4) return false;

  // 1. String prefix followed by dashes/bars/numbers: e.g. "e----7-7-7--7-9-10-", "h--5--------", "E|-------0-2--|"
  if (/^[eEhHgGdDaAbB1-6]\s*[\:\|\-—=]{2,}[0-9\/\s\(\)hpsbrx\~\-—\|=]+/i.test(t)) {
    return true;
  }

  // 2. Pure dash/number lines without lyrics: e.g. "|--0--2--3--2--0--|", "-------------------------"
  if (/^[\:\|\-—=~0-9\/\s\(\)hpsbrx]{6,}$/i.test(t) && (t.match(/[-—=~]/g) || []).length >= 4) {
    const words = t.match(/[a-zA-ZčćšđžČĆŠĐŽ]{3,}/g) || [];
    if (words.length === 0) {
      return true;
    }
  }

  // 3. Tab chords with dashes e.g. "E---0---|", "A---2---|"
  if (/^[A-Ga-g1-6][\:\-\|]{2,}[0-9\-\|\s]+$/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * Quality Layer: Scans for missing stanzas, unrolls abbreviated refrains, 
 * replicates chord progressions onto unharmonized verses, and strips watermarks/signatures.
 */
export function applyQualityGate(rawContent, key = '') {
  let content = rawContent || '';
  if (content.length > 8000) {
    content = content.slice(0, 5000);
  }
  // 0. Convert all Cyrillic homoglyphs in chords and transliterate Cyrillic text to pure Latin
  content = convertCyrillicChordsAndText(content);
  // 0b. Scrub forum chatter & greetings
  content = scrubForumChatter(content);
  // 0c. Strip forum metadata lines (Izvodjac:, Pesma:, Godina:, YT: links, Po zelji:)
  content = stripForumMetadataHeaders(content);
  // 0d. Clean rhythm asterisks and expand chord multipliers
  content = cleanRhythmSymbolsAndMultipliers(content);

  const normalizedNewlines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const decodedContent = decodeHtmlEntities(normalizedNewlines);
  const rawLines = decodedContent.split('\n');
  let processed = [];

  // Pass 1: Parse lines & clean tabs / pipe notation
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    let trimmed = line.trim();

    // Strip Guitar Tablature lines and Tab headers
    if (isTabLine(line) || /^\[?(?:tab|tabulatura|solo\s*tab|intro\s*tab|gitar\s*tab)\b[^\n\]]*\]?[:\.\s\-]*$/i.test(trimmed)) {
      continue;
    }

    if (/^[\(\[]?\s*(?:capo|kapo|kapodaster|tuning|stim|štim|tonalitet|original\s*iz)\b[^\n\]\)]*[\)\]]?$/i.test(trimmed)) {
      continue;
    }

    if (/^[xX]\s*[1-9]$/i.test(trimmed) || /^[1-9]\s*[xX]$/i.test(trimmed)) {
      continue;
    }

    // Convert pipe notation: |D|Em|C|G| -> [D] [Em] [C] [G]
    if (/^\|?[A-H][b#]?[^\|]*(\||\s+)[A-H][b#]?/i.test(trimmed) && !/[a-z]{4,}/i.test(trimmed)) {
      const tokens = trimmed.split(/[\s\|]+/).filter(Boolean);
      const chords = tokens.filter(isChordToken).map(c => `[${normalizeChord(c, key)}]`);
      if (chords.length > 0) {
        processed.push(chords.join(' '));
        continue;
      }
    }

    const nextLine = rawLines[i + 1];
    if (isChordLine(line) && nextLine && !isChordLine(nextLine) && !isSectionHeader(nextLine) && nextLine.trim().length > 0) {
      const chordTokens = line.trim().split(/\s+/).filter(isChordToken);
      const textWords = nextLine.trim().match(/[a-zA-ZčćšđžČĆŠĐŽ]+/g) || [];
      if (chordTokens.length >= 4 && (textWords.length === 0 || chordTokens.length / textWords.length > 1.2)) {
        processed.push('[Prelaz / Solo]:');
        processed.push(formatStandaloneChords(line, key));
      } else {
        processed.push(mergeChordsIntoText(line, nextLine, key));
        i++;
      }
    } else if (isChordLine(line)) {
      processed.push(formatStandaloneChords(line, key));
    } else {
      const cleaned = line.replace(/^[-_\s]+$/, '');
      if (cleaned.length > 0) {
        processed.push(formatSectionHeader(cleaned));
      } else {
        processed.push('');
      }
    }
  }

  // Pass 2: Extract Verse 1 and Chorus models & Insert missing headers
  const structured = [];
  const verse1Lines = [];
  const chorusLines = [];
  let hasStrofa1 = false;
  let hasRefren = false;
  let inRefren = false;
  let currentSection = '';

  for (let i = 0; i < processed.length; i++) {
    const line = processed[i];
    const trimmed = line.trim();

    if (!trimmed) {
      inRefren = false;
      structured.push('');
      continue;
    }

    // Auto-detect Intro if song begins with standalone chords
    if (structured.filter(l => l.trim().length > 0).length === 0 && isChordLine(line)) {
      structured.push('[Intro / Uvod]:');
      structured.push(line);
      continue;
    }

    if (isSectionHeader(line) || /^\[([a-zA-Z0-9\s\/\:\-]+)\]:?$/.test(trimmed)) {
      currentSection = trimmed.toLowerCase();
      if (currentSection.includes('refren') || currentSection.includes('ref')) {
        hasRefren = true;
        inRefren = true;
      } else {
        inRefren = false;
      }
      if (currentSection.includes('strofa')) {
        hasStrofa1 = true;
      }
      structured.push(line);
      continue;
    }

    // First vocal line -> [Strofa 1] (only if not inside intro)
    if (!hasStrofa1 && !hasRefren && !currentSection.includes('intro') && !currentSection.includes('uvod') && /[a-zA-ZčćšđžČĆŠĐŽ]{3,}/.test(line)) {
      structured.push('[Strofa 1]');
      hasStrofa1 = true;
    }

    // Auto-detect Chorus start if unlabelled (instant linear match, 0 backtracking)
    const textWithoutChords = trimmed.replace(/\[[^\]]+\]/g, '').trim();
    if (hasStrofa1 && !hasRefren && (
      /^(?:kafana|kako da te|pesme moje|hej branka|danka|kazi|oprosti|bila je|znam|nocas|voli me|daleko si|lazes|prazne|svima|moj zivot)\b/i.test(textWithoutChords) ||
      (verse1Lines.length >= 4 && textWithoutChords.length > 5 && (textWithoutChords.includes('kafana') || textWithoutChords.includes('moja sudbina')))
    )) {
      structured.push('[Refren]');
      hasRefren = true;
      inRefren = true;
    }

    if (inRefren) {
      if (line.includes('[')) chorusLines.push(line);
    } else if (hasStrofa1 && !hasRefren && line.includes('[')) {
      verse1Lines.push(line);
    }

    structured.push(line);
  }

  function normalizeLyricStr(str) {
    return (str || '').replace(/\[[^\]]+\]/g, '').toLowerCase().replace(/[^a-z0-9čćšđž]/gi, '').trim();
  }

  // Pass 3: Replicate chords onto unharmonized verses & unroll chorus
  const finalLines = [];
  let verseCount = 1;
  let verseLineIdx = 0;
  let inUnharmonizedSection = false;

  for (let i = 0; i < structured.length; i++) {
    const line = structured[i];
    const trimmed = line.trim();

    if (!trimmed) {
      finalLines.push('');
      continue;
    }

    if (isSectionHeader(line) || /^\[([a-zA-Z0-9\s\/\:\-]+)\]:?$/.test(trimmed)) {
      const secName = trimmed.toLowerCase();
      if (secName.includes('refren')) {
        let hasChordsAhead = false;
        for (let j = i + 1; j < Math.min(i + 5, structured.length); j++) {
          if (isSectionHeader(structured[j])) break;
          if (structured[j].includes('[')) {
            hasChordsAhead = true;
            break;
          }
        }

        if (!hasChordsAhead && chorusLines.length > 0) {
          finalLines.push('[Refren]');
          for (const cl of chorusLines) {
            finalLines.push(cl);
          }
          inUnharmonizedSection = false;
          continue;
        }
      }

      inUnharmonizedSection = secName.includes('strofa') && !secName.includes('1');
      if (inUnharmonizedSection) verseLineIdx = 0;
      finalLines.push(line);
      continue;
    }

    // Auto-detect Strofa 2 or Strofa 3 or Refren repeat when a block of lyrics appears without section header
    const prevLine = finalLines.length > 0 ? finalLines[finalLines.length - 1].trim() : '';
    if (prevLine === '' && /[a-zA-ZčćšđžČĆŠĐŽ]{3,}/.test(line)) {
      const curNorm = normalizeLyricStr(line);
      const isChorusMatch = chorusLines.length > 0 && normalizeLyricStr(chorusLines[0]) === curNorm;

      if (isChorusMatch) {
        finalLines.push('[Refren]');
        inUnharmonizedSection = false;
      } else {
        verseCount++;
        finalLines.push(`[Strofa ${verseCount}]`);
        inUnharmonizedSection = true;
        verseLineIdx = 0;
      }
    }

    if (inUnharmonizedSection && !line.includes('[') && verse1Lines.length > 0) {
      const v1Line = verse1Lines[verseLineIdx % verse1Lines.length];
      const chordsInV1 = [...v1Line.matchAll(/\[([A-H][b#]?[^\]]*)\]/g)].map(m => m[1]);
      if (chordsInV1.length > 0) {
        let harmonized = `[${chordsInV1[0]}]` + line;
        if (chordsInV1.length > 1 && line.length > 15) {
          const mid = Math.floor(line.length / 2);
          const spaceIdx = line.indexOf(' ', mid);
          if (spaceIdx > 0) {
            harmonized = `[${chordsInV1[0]}]` + line.slice(0, spaceIdx) + ` [${chordsInV1[1]}]` + line.slice(spaceIdx + 1);
          }
        }
        finalLines.push(harmonized);
        verseLineIdx++;
        continue;
      }
    }

    finalLines.push(line);
  }

  const stripped = stripWatermarksAndSignatures(finalLines)
    .map(normalizeLineCasing)
    .map(snapChordsToSyllables);
  // 1. Auto-stitch broken line wraps
  const stitched = stitchBrokenLineWraps(stripped);

  // Ghost Sections Cleanup: Remove section headers that have no lines under them
  const cleanedLines = [];
  for (let i = 0; i < stitched.length; i++) {
    const line = stitched[i];
    const isHeader = isSectionHeader(line) || /^\[([a-zA-Z0-9\s\/\:\-]+)\]:?$/.test(line.trim());

    if (isHeader) {
      let hasContent = false;
      for (let j = i + 1; j < stitched.length; j++) {
        const next = stitched[j].trim();
        if (isSectionHeader(next) || /^\[([a-zA-Z0-9\s\/\:\-]+)\]:?$/.test(next)) {
          break;
        }
        if (next.length > 0) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        cleanedLines.push(line);
      }
    } else {
      cleanedLines.push(line);
    }
  }

  let output = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // 2. STRIP IN-LINE UPLOADER COMMENTS
  output = stripUploaderComments(output);
  // 3. CLEAN SYLLABLE HYPHENATION AND NESTED BRACKETS
  output = cleanSyllableHyphenation(output);
  // 4. FRONT GATE GRAMMAR & SPELL CHECK
  output = correctGrammarAndSpelling(output);
  // 5. Fix any double, nested or overlapping chords
  output = healOverlappingAndBrokenChords(output);
  // 6. Layer 9: Enforce Harmonic Stanza Symmetry & Full Chording across all verses
  output = enforceHarmonicStanzaSymmetry(output);
  // 7. Sentence punctuation formatting
  output = formatSentencePunctuation(output);
  // 8. Re-index verse stanzas sequentially ([Strofa 1], [Strofa 2]...)
  output = reindexStanzas(output);
  return output;
}

const ENGLISH_WORDS = new Set([
  'the', 'and', 'you', 'that', 'was', 'for', 'are', 'with', 'his', 'they', 'this', 'have', 'from',
  'one', 'had', 'word', 'but', 'not', 'what', 'all', 'were', 'when', 'your', 'can', 'said', 'there',
  'use', 'each', 'which', 'she', 'how', 'their', 'will', 'other', 'about', 'out', 'many', 'then',
  'them', 'these', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look',
  'two', 'more', 'write', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first',
  'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get',
  'come', 'made', 'may', 'part', 'baby', 'love', 'girl', 'dont', 'know', 'never', 'want', 'just',
  'tonight', 'heart', 'feel', 'yeah', 'gonna', 'wanna', 'cause', 'take', 'away', 'hold', 'back'
]);

const BALKAN_ARTISTS = new Set([
  'dubioza kolektiv', 's.a.r.s.', 'sars', 'magnifico', 'rambo amadeus', 'dino merlin', 'bijelo dugme',
  'plavi orkestar', 'zabranjeno pušenje', 'zabranjeno pusenje', 'riblja čorba', 'riblja corba', 'bajaga',
  'crvena jabuka', 'oliver dragojević', 'oliver dragojevic', 'gibonni', 'parni valjak', 'prljavo kazalište',
  'prljavo kazaliste', 'toše proeski', 'tose proeski', 'indexi', 'ekv', 'ekatarina velika', 'hladno pivo',
  'atomsko sklonište', 'atomsko skloniste', 'divlje jagode', 'kerber', 'generacija 5', 'smak', 'azra'
]);

export function isForeignSong(title, artistName = '', content = '') {
  if (!content) return false;
  const aNorm = artistName.toLowerCase().trim();
  if (BALKAN_ARTISTS.has(aNorm)) return false;

  const textOnly = content.replace(/\[[^\]]+\]/g, ' ').toLowerCase();
  const words = textOnly.match(/[a-zA-ZčćšđžČĆŠĐŽ]+/g) || [];
  if (words.length < 10) return false;

  let englishCount = 0;
  for (const w of words) {
    if (ENGLISH_WORDS.has(w)) englishCount++;
  }

  const foreignArtists = [
    'sting', 'abba', 'queen', 'beatles', 'ed sheeran', 'metallica', 'guns n roses', 'adele', 'coldplay',
    'pink floyd', 'nirvana', 'eminem', 'taylor swift', 'elvis presley', 'eric clapton', 'michael jackson',
    'bob dylan', 'scorpions', 'eagles', 'red hot chili peppers', 'oasis', 'u2', 'dire straits', 'deep purple',
    'led zeppelin', 'bon jovi', 'bryan adams', 'guns', 'ac/dc', 'ac dc', 'green day', 'linkin park',
    'the royston club', 'the police', 'the smiths', 'iron maiden', 'amy winehouse', 'joe cocker',
    'otis redding', 'bruce springsteen', 'david bowie', 'chris stapleton', 'iggy pop', 'chet faker',
    'del shannon', 'sea shanty', 'imany', 'djo', 'gregg allman', 'b.j. thomas', 'stevie wonder', 'chris rea'
  ];
  if (foreignArtists.some(fa => aNorm.includes(fa))) return true;

  if (englishCount > 15 && words.length > 0 && englishCount / words.length > 0.25) return true;

  return false;
}

export function validateSongCompleteness(title, content) {
  if (!content || typeof content !== 'string') return false;
  if (isDummyContent(content)) return false;
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !isSectionHeader(l));
  if (lines.length < 6) return false;
  return true;
}

export const GENRE_IDS = {
  domaca: '6a8cd6baa5590fb11ff5bbfd',
  exYu: '6a8cd6baa5590fb11ff5bc01',
  strana: '6a8cd6baa5590fb11ff5bc05',
  narodna: '6a8cd6baa5590fb11ff5bc09',
  sevdalinka: '6a8cd6baa5590fb11ff5bc0d',
  starogradska: '6a8cd6baa5590fb11ff5bc11',
  zabavna: '6a8cd6baa5590fb11ff5bc15',
  pop: '6a8cd6baa5590fb11ff5bc19',
  rock: '6a8cd6baa5590fb11ff5bc1d',
  folk: '6a8cd6baa5590fb11ff5bc21',
  tamburaska: '6a8cd6baa5590fb11ff5bc25',
  hipHop: '6a8cd6baa5590fb11ff5bc31'
};

const ROCK_ARTISTS = new Set([
  'bijelo dugme', 'riblja čorba', 'riblja corba', 'azra', 'parni valjak', 'prljavo kazalište', 'prljavo kazaliste',
  'zabranjeno pušenje', 'zabranjeno pusenje', 'divlje jagode', 'galija', 'električni orgazam', 'elektricni orgazam',
  'partibrejkers', 'kerber', 'smak', 'atomsko sklonište', 'atomsko skloniste', 'ekv', 'ekatarina velika',
  'yu grupa', 'indexi', 'van gogh', 'neverne bebe', 'generacija 5', 'alen islamović', 'željko bebek', 'zeljko bebek',
  'leb i sol', 'hladno pivo', 'majke', 'goran bare', 'brkovi', 'let 3', 'psihomodo pop', 'korni grupa', 'time',
  'aerodrom', 'haustor', 'darko rundek', 'jura stublić', 'film', 'buldožer', 'vlatko stefanovski'
]);

const FOLK_ARTISTS = new Set([
  'šaban šaulić', 'saban saulic', 'sinan sakić', 'sinan sakic', 'aca lukas', 'aco pejović', 'aco pejovic',
  'saša matić', 'sasa matic', 'dejan matić', 'dejan matic', 'ana bekuta', 'lepa brena', 'miroslav ilić', 'miroslav ilic',
  'toma zdravković', 'toma zdravkovic', 'halid bešlić', 'halid beslic', 'halid muslimović', 'halid muslimovic',
  'haris džinović', 'haris dzinovic', 'hanka paldum', 'mile kitić', 'mile kitic', 'ceca', 'dragana mirković',
  'dragana mirkovic', 'džej', 'dzej', 'džej ramadanovski', 'šerif konjević', 'serif konjevic', 'marinko rokvić',
  'marinko rokvic', 'snežana đurišić', 'snezana djurisic', 'enes begović', 'enes begovic', 'nedeljko bajić baja',
  'nedeljko bajic baja', 'mitar mirić', 'mitar miric', 'ljuba aličić', 'ljuba alicic', 'jašar ahmedovski',
  'jasar ahmedovski', 'boban zdravković', 'seka aleksić', 'seka aleksic', 'tanja savić', 'tanja savic',
  'aleksandra prijović', 'aleksandra prijovic', 'darko lazić', 'darko lazic', 'jana', 'stoja', 'dara bubamara',
  'viki miljković', 'sanja đorđević', 'baja mali knindža', 'baja mali knindza', 'bora drljača', 'miloš bojanić',
  'medeni mesec', 'keba', 'dragan kojić keba', 'nada topčagić', 'zorica brunclik', 'roki vulović'
]);

const POP_ARTISTS = new Set([
  'zdravko čolić', 'zdravko colic', 'dino merlin', 'oliver dragojević', 'oliver dragojevic', 'gibonni',
  'hari mata hari', 'željko joksimović', 'zeljko joksimovic', 'željko samardžić', 'zeljko samardzic',
  'toše proeski', 'tose proeski', 'sergej ćetković', 'sergej cetkovic', 'saša kovačević', 'sasa kovacevic',
  'dženan lončarević', 'dzenan loncarevic', 'petar grašo', 'petar graso', 'tony cetinski', 'boris novković',
  'crvena jabuka', 'plavi orkestar', 'magazin', 'novi fosili', 'vlado georgiev', 'jelena rozga', 'severina',
  'nina badrić', 'nina badric', 'aleksandra radović', 'marija šerifović', 'marija serifovic', 'tijana dapčević',
  'nataša bekvalac', 'natasa bekvalac', 'emina jahović', 'tropico band', 'lexington band', 'amadeus band',
  'magla band', 'miligram', 'kiki lesendrić', 'piloti', 'bajaga', 'bajaga i instruktori', 'dado topić',
  'kemal monteno', 'franka', 'igor cvitkovac', 'fraje', 'the frajle', 'fraile', 'lapsus band'
]);

const SEVDALINKA_ARTISTS = new Set([
  'safet isović', 'safet isovic', 'himzo polovina', 'zaim imamović', 'zaim imamovic', 'beba selimović',
  'beba selimovic', 'zehra deović', 'meho puzić', 'meho puzic', 'zekerijah đezić', 'silvana armenulić',
  'silvana armenulic', 'zvonko bogdan', 'predrag cune gojković', 'cune gojković', 'predrag živković tozovac',
  'tozovac', 'staniša stošić', 'olivera katarina', 'duško kuliš', 'nedeljko bilkić', 'vasilija radojčić', 'sevdalinke'
]);

const HIPHOP_ARTISTS = new Set([
  'buba corelli', 'jala brat', 'rasta', 'devito', 'voyage', 'nucci', 'senidah', 'coby', 'teodora džehverović',
  'teodora dzehverovic', 'relja', 'nikolija', 'maya berović', 'maya berovic', 'breskvica', 'in vivo', 'gazda paja',
  'fox', 'surreal', 'smoke mardeljano', 'beogradski sindikat', 'marčelo', 'marcelo', 'bad copy', 'wikluh sky',
  'đorđe miljenović', 'struka', 'thcf', 'mimi mercedez'
]);

export function classifyGenresForArtist(artistName = '', songTitle = '') {
  const aNorm = artistName.toLowerCase().trim();
  const genres = [GENRE_IDS.domaca];

  if (ROCK_ARTISTS.has(aNorm) || [...ROCK_ARTISTS].some(ra => aNorm.includes(ra))) {
    genres.push(GENRE_IDS.exYu, GENRE_IDS.rock);
  } else if (FOLK_ARTISTS.has(aNorm) || [...FOLK_ARTISTS].some(fa => aNorm.includes(fa))) {
    genres.push(GENRE_IDS.narodna, GENRE_IDS.folk);
  } else if (SEVDALINKA_ARTISTS.has(aNorm) || [...SEVDALINKA_ARTISTS].some(sa => aNorm.includes(sa))) {
    genres.push(GENRE_IDS.sevdalinka, GENRE_IDS.starogradska, GENRE_IDS.narodna);
  } else if (HIPHOP_ARTISTS.has(aNorm) || [...HIPHOP_ARTISTS].some(ha => aNorm.includes(ha))) {
    genres.push(GENRE_IDS.hipHop, GENRE_IDS.pop);
  } else if (POP_ARTISTS.has(aNorm) || [...POP_ARTISTS].some(pa => aNorm.includes(pa))) {
    genres.push(GENRE_IDS.pop, GENRE_IDS.zabavna);
  } else {
    // Default fallback
  genres.push(GENRE_IDS.zabavna, GENRE_IDS.pop);
  }

  return [...new Set(genres)];
}

/**
 * 1. Harmonic Key Auto-Detector & Key Sanity Validator
 */
export function detectOriginalKey(content, providedKey = '') {
  const cleanProvided = (providedKey || '').trim().replace(/[^a-zA-Z#b]/g, '');
  const standardKeys = [
    'C', 'Cm', 'C#', 'C#m', 'D', 'Dm', 'D#', 'D#m', 'Eb', 'Ebm', 'E', 'Em',
    'F', 'Fm', 'F#', 'F#m', 'G', 'Gm', 'G#', 'G#m', 'Ab', 'Abm', 'A', 'Am', 'A#', 'A#m', 'B', 'Bm', 'H', 'Hm'
  ];

  if (standardKeys.includes(cleanProvided)) {
    return cleanProvided;
  }

  const chords = [...(content || '').matchAll(/\[([A-H][b#]?[^\]]*)\]/g)].map(m => m[1]);
  if (chords.length === 0) return 'Am';

  const counts = {};
  for (const c of chords) {
    const base = c.replace(/[0-9\/susaddmajdimaug\+].*$/, '');
    counts[base] = (counts[base] || 0) + 1;
  }

  // Common minor keys
  if (counts['Am'] && (counts['Dm'] || counts['E'] || counts['E7'])) return 'Am';
  if (counts['Em'] && (counts['Am'] || counts['H'] || counts['H7'] || counts['B7'])) return 'Em';
  if (counts['Dm'] && (counts['Gm'] || counts['A'] || counts['A7'])) return 'Dm';
  if (counts['Gm'] && (counts['Cm'] || counts['D'] || counts['D7'])) return 'Gm';
  if (counts['Hm'] && (counts['Em'] || counts['F#'] || counts['F#7'])) return 'Hm';
  if (counts['F#m'] && (counts['Hm'] || counts['C#'] || counts['C#7'])) return 'F#m';
  if (counts['C#m'] && (counts['F#m'] || counts['G#'] || counts['G#7'])) return 'C#m';

  // Common major keys
  if (counts['C'] && (counts['G'] || counts['F'])) return 'C';
  if (counts['G'] && (counts['D'] || counts['C'])) return 'G';
  if (counts['D'] && (counts['A'] || counts['G'])) return 'D';
  if (counts['A'] && (counts['E'] || counts['D'])) return 'A';
  if (counts['F'] && (counts['C'] || counts['B'])) return 'F';
  if (counts['E'] && (counts['H'] || counts['A'])) return 'E';
  if (counts['H'] && (counts['F#'] || counts['E'])) return 'H';

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0] ? sorted[0][0] : 'Am';
}

/**
 * 2. Auto-Difficulty Estimator
 */
export function estimateDifficulty(content) {
  const chords = [...(content || '').matchAll(/\[([A-H][b#]?[^\]]*)\]/g)].map(m => m[1]);
  if (chords.length === 0) return 'easy';

  const hasAdvanced = chords.some(c => /dim|aug|maj7|m7b5|9|11|13|\/[A-H]/i.test(c));
  if (hasAdvanced) return 'hard';

  const barreChords = [
    'F', 'Fm', 'F7', 'F#', 'F#m', 'F#7', 'H', 'Hm', 'H7', 'B', 'Bm', 'B7',
    'Bb', 'Bbm', 'C#', 'C#m', 'C#7', 'D#', 'D#m', 'D#7', 'G#', 'G#m', 'G#7', 'Gm', 'Gm7', 'Cm', 'Cm7'
  ];
  const hasBarre = chords.some(c => {
    const base = c.replace(/[0-9\/susaddmajdimaug\+].*$/, '');
    return barreChords.includes(base);
  });

  if (hasBarre) return 'medium';
  return 'easy';
}

/**
 * 3. Duet & Featuring Normalizer
 */
export function extractCanonicalAndFeaturedArtists(rawName) {
  if (!rawName) return { canonicalArtist: '', featuredArtists: [] };
  let name = rawName.trim();

  const featRegex = /\s+(?:feat\.?|ft\.?|featuring|duet sa|i|&|\/)\s+/i;
  const isBand = /^(?:crvena jabuka|divlje jagode|parni valjak|bijelo dugme|plavi orkestar|riblja corba|riblja čorba|atomsko skloniste|atomsko sklonište|yu grupa|hladno pivo|itd band|amadeus bend|lexington bend|magla bend|tropico bend|lapsus band)/i.test(name);

  if (featRegex.test(name) && !isBand) {
    const parts = name.split(featRegex).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return {
        canonicalArtist: parts[0],
        featuredArtists: parts.slice(1)
      };
    }
  }
  return { canonicalArtist: name, featuredArtists: [] };
}

/**
 * 4. Orphan & Double-Header Collapser
 */
export function collapseConsecutiveHeaders(content) {
  if (!content) return '';
  const lines = content.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^\[[A-Za-z0-9\s\/\:\-]+\]:?$/.test(trimmed)) {
      const prev = result.length > 0 ? result[result.length - 1].trim() : '';
      if (prev === trimmed) {
        continue; // Skip duplicate adjacent header
      }
    }
    result.push(line);
  }

  return result.join('\n');
}

/**
 * 5. Canonical SEO Slug Sanitizer
 */
export function sanitizeSongSlug(title = '', artistName = '') {
  const combined = `${artistName} ${title}`.trim().toLowerCase();
  return combined
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/đ/g, 'dj')
    .replace(/ž/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
