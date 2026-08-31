/**
 * Octava Master Guitarist Composition & Voicing Engine
 *
 * Implements real-world acoustic & electric guitar composition techniques:
 * 1. Finger Economy & Voicings (Open, Barré, Triads, Inversions)
 * 2. Bass Walkdowns & Passing Chords (e.g. C -> C/H -> Am -> Am/G -> F)
 * 3. Harmonic Tension & Color (sus2, sus4, add9, maj7, 7, m7)
 * 4. Strumming & Picking Rhythm Patterns (4/4 Pop-Rock, 3/4 Balada, 2/4 Dvojka/Rumba, 7/8 Balkan)
 * 5. Capo Placement Optimization for Acoustic Resonance
 */

export const GUITAR_STRUMMING_PATTERNS = {
  'pop_rock_4_4': {
    name: 'Standard Pop-Rock (4/4)',
    pattern: '↓ . ↓ ↑ . ↑ ↓ ↑',
    count: '1 & 2 & 3 & 4 &',
    description: 'Najpopularniji univerzalni ritam za akustičnu i električnu gitaru (Prljavo Kazalište, Parni Valjak, Bijelo Dugme).'
  },
  'balada_arpeggio_4_4': {
    name: 'Baladni Arpeggio / Fingerpicking (4/4)',
    pattern: 'Bas - 3 - 2 - 1 - 2 - 3',
    description: 'Prstno prebiranje žica za emotivne balade (Indexi - Bacila je sve niz rijeku, Oliver - Cesarica).'
  },
  'valcer_sevdah_3_4': {
    name: 'Valcer & Sevdah (3/4 ili 6/8)',
    pattern: 'Bas - ↓ - ↓  (1 - 2 - 3)',
    description: 'Klasični tročetvrtinski ritam (Silvana Armenulić - Noćas mi srce pati, Aleksa Šantić - Emina).'
  },
  'narodna_rumba_dvojka': {
    name: 'Balkanska Dvojka & Rumba (2/4)',
    pattern: 'Bas (palac) ➔ Trzaj (dlan mute) ➔ Bas ➔ Trzaj',
    description: 'Kafanski i narodni ritam za brze i srednje pjesme (Halid Bešlić, Toma Zdravković, Šaban Šaulić).'
  },
  'balkan_7_8': {
    name: 'Balkanski Nepravilni Ritam (7/8)',
    pattern: '↓ ↑ ↓ (Duga) + ↓ ↑ (Kratka) + ↓ ↑ (Kratka) [3 + 2 + 2]',
    description: 'Tradicionalni nepravilni ritam juga i Makedonije (Jovano Jovanke, Eleno kerko, Makedonsko devojče).'
  }
};

export const GUITAR_BASS_WALKDOWNS = {
  // C-Dur bas silazak
  'C_Major_Walkdown': {
    progression: ['C', 'C/H', 'Am', 'Am/G', 'F', 'G'],
    description: 'Emotivni silazak basa sa C na H, A, G do F (Cesarica, Kad hodaš).'
  },
  // A-Mol bas silazak
  'A_Minor_Walkdown': {
    progression: ['Am', 'Am/G', 'Am/F#', 'F', 'E7'],
    description: 'Džejms Bond / Španski molski silazak basa (Moj je život Švicarska, Hotel California stil).'
  },
  // D-Mol bas silazak
  'D_Minor_Walkdown': {
    progression: ['Dm', 'Dm/C', 'B', 'A7'],
    description: 'Kafanski dramatični silazak u D-molu (Toma Zdravković, Selma - Bijelo Dugme).'
  },
  // E-Mol bas silazak
  'E_Minor_Walkdown': {
    progression: ['Em', 'Em/D', 'C', 'H7'],
    description: 'Akustična baladna kadenca (Divlje Jagode - Krivo je more).'
  }
};

export const GUITAR_EMBELLISHMENTS = {
  'Am': {
    openShape: 'x02210',
    richExtensions: ['Am7 (x02010)', 'Asus2 (x02200)', 'Asus4 (x02230)', 'Am/G (302210)'],
    description: 'Prebacivanjem malog prsta i kažiprsta dobijaju se prelijepi melodični ukrasi.'
  },
  'Dm': {
    openShape: 'xx0231',
    richExtensions: ['Dm7 (xx0211)', 'Dsus2 (xx0230)', 'Dsus4 (xx0233)', 'Dm/C (x30231)'],
    description: 'Sus4 i Sus2 na prvoj žici stvaraju gitarsku melodiju unutar samog akorda.'
  },
  'C': {
    openShape: 'x32010',
    richExtensions: ['Cadd9 (x32030)', 'Cmaj7 (x32000)', 'C/H (x22010)', 'C/G (332010)'],
    description: 'Cadd9 sa malim prstom na 3. pragu B žice je zaštitni znak modernog akustičnog zvuka.'
  },
  'G': {
    openShape: '320003 ili 320033',
    richExtensions: ['Gadd9 (320203)', 'G7 (320001)', 'Gsus4 (320013)', 'G/F# (2x0033)'],
    description: 'Četvoroprsti G akord (320033) daje pun i moćan akustični ton.'
  },
  'Em': {
    openShape: '022000',
    richExtensions: ['Em7 (022030 ili 022033)', 'Em9 (022002)', 'Esus4 (022200)'],
    description: 'Najdublji rezonantni otvoreni akord na gitari.'
  },
  'F': {
    barreShape: '133211',
    acousticAlternative: 'Fmaj7 (xx3210 ili x33210)',
    description: 'Fmaj7 omogućava da prva tanka E žica zvoni otvoreno i daje lepršav akustični zvuk.'
  }
};

/**
 * Recommends optimal Capo fret position for maximum open-chord acoustic resonance.
 */
export function calculateOptimalCapo(originalKey) {
  const CAPO_MAP = {
    'G#m': { capo: 4, playAs: 'Em', benefit: 'Izbjegava teški G#m bare hvat, svira se lako u Em poziciji sa punim rezonantnim basom.' },
    'Abm': { capo: 4, playAs: 'Em', benefit: 'Sviranje u Em poziciji sa kapodasterom na 4. pragu.' },
    'D#m': { capo: 1, playAs: 'Dm', benefit: 'Sviranje u Dm poziciji sa kapodasterom na 1. pragu.' },
    'Ebm': { capo: 1, playAs: 'Dm', benefit: 'Sviranje u Dm poziciji sa kapodasterom na 1. pragu.' },
    'Bbm': { capo: 1, playAs: 'Am', benefit: 'Sviranje u Am poziciji sa kapodasterom na 1. pragu.' },
    'Fm':  { capo: 1, playAs: 'Em', benefit: 'Sviranje u Em poziciji sa kapodasterom na 1. pragu umjesto punog F-mol bare hvata.' },
    'C#m': { capo: 4, playAs: 'Am', benefit: 'Sviranje u Am poziciji sa kapodasterom na 4. pragu.' },
    'F#m': { capo: 2, playAs: 'Em', benefit: 'Sviranje u Em poziciji sa kapodasterom na 2. pragu.' }
  };

  return CAPO_MAP[originalKey] || { capo: 0, playAs: originalKey, benefit: 'Standardni štim bez kapodastera, direktne otvorene pozicije.' };
}
