/**
 * Ashtakoota (Guna Milan) matching, North Indian style: eight kootas worth 36 points, from each
 * person's Moon position. Schools differ on a few tables (notably Vashya and Gana); the ones here
 * follow the common North Indian (AstroSage-style) convention.
 *
 * The method is defined for a bride and groom. For any other pair the caller picks who takes
 * which role; only Varna, Vashya and Gana are direction-sensitive.
 */
import { type BirthMoment, siderealChart } from './ephemeris.ts';
import { manglikStatus, type ManglikStatus } from './kundli.ts';
import {
  ganaOf,
  GANAS,
  nadiOf,
  nakshatraIndex,
  NAKSHATRAS,
  nakshatraPada,
  relationship,
  SIGN_LORDS,
  SIGNS,
  signIndex,
  VARNAS,
  varnaOf,
  VASHYAS,
  vashyaOf,
  yoniOf,
  YONIS,
} from './vedic.ts';

export type MoonProfile = {
  moonLongitude: number;
  manglik: ManglikStatus;
};

export type KootaResult = {
  name: string;
  /** What the koota is about, for the report. */
  area: string;
  points: number;
  maxPoints: number;
  bride: string;
  groom: string;
};

export type AshtakootaResult = {
  total: number;
  maxTotal: 36;
  kootas: KootaResult[];
  nadiDosha: boolean;
  bhakootDosha: boolean;
  manglik: { bride: ManglikStatus; groom: ManglikStatus; mismatch: boolean };
};

// Rows: groom, columns: bride, in VASHYAS order.
const VASHYA_POINTS = [
  [2, 1, 1, 0.5, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0.5, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
];

// Rows: bride's yoni, columns: groom's yoni, in YONIS order (symmetric).
const YONI_POINTS = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

// Rows: bride's gana, columns: groom's gana, in GANAS order (Deva, Manushya, Rakshasa).
const GANA_POINTS = [
  [6, 6, 0],
  [5, 6, 0],
  [1, 0, 6],
];

const MAITRI_POINTS = {
  'friend+friend': 5,
  'friend+neutral': 4,
  'neutral+neutral': 3,
  'enemy+friend': 1,
  'enemy+neutral': 0.5,
  'enemy+enemy': 0,
} as const;

/** 1-based count from one nakshatra to another, inclusive (same nakshatra = 1). */
function countNakshatras(from: number, to: number) {
  return ((to - from + 27) % 27) + 1;
}

/** Tara 3 (Vipat), 5 (Pratyari) and 7 (Vadha) are inauspicious. */
function taraIsGood(from: number, to: number) {
  const tara = ((countNakshatras(from, to) - 1) % 9) + 1;
  return ![3, 5, 7].includes(tara);
}

export function moonProfile(birth: BirthMoment): MoonProfile {
  const chart = siderealChart(birth);
  return { moonLongitude: chart.grahas.Moon.longitude, manglik: manglikStatus(chart) };
}

export function ashtakoota(bride: MoonProfile, groom: MoonProfile): AshtakootaResult {
  const b = { moon: bride.moonLongitude, sign: signIndex(bride.moonLongitude), nak: nakshatraIndex(bride.moonLongitude) };
  const g = { moon: groom.moonLongitude, sign: signIndex(groom.moonLongitude), nak: nakshatraIndex(groom.moonLongitude) };

  const brideVarna = varnaOf(b.moon);
  const groomVarna = varnaOf(g.moon);

  const brideVashya = vashyaOf(b.moon);
  const groomVashya = vashyaOf(g.moon);

  const taraPoints = (taraIsGood(b.nak, g.nak) ? 1.5 : 0) + (taraIsGood(g.nak, b.nak) ? 1.5 : 0);

  const brideYoni = yoniOf(b.nak);
  const groomYoni = yoniOf(g.nak);

  const brideLord = SIGN_LORDS[b.sign];
  const groomLord = SIGN_LORDS[g.sign];
  const views = [relationship(brideLord, groomLord), relationship(groomLord, brideLord)].sort();
  const maitriPoints = MAITRI_POINTS[views.join('+') as keyof typeof MAITRI_POINTS];

  const brideGana = ganaOf(b.nak);
  const groomGana = ganaOf(g.nak);

  // Signs counted from each other: 2/12, 5/9 and 6/8 placements are Bhakoot dosha.
  const distance = ((g.sign - b.sign + 12) % 12) + 1;
  const bhakootDosha = [2, 12, 5, 9, 6, 8].includes(distance);

  const brideNadi = nadiOf(b.nak);
  const groomNadi = nadiOf(g.nak);
  const nadiDosha = brideNadi === groomNadi;

  const kootas: KootaResult[] = [
    {
      name: 'Varna',
      area: 'spiritual compatibility',
      points: VARNAS.indexOf(groomVarna) >= VARNAS.indexOf(brideVarna) ? 1 : 0,
      maxPoints: 1,
      bride: brideVarna,
      groom: groomVarna,
    },
    {
      name: 'Vashya',
      area: 'mutual attraction',
      points: VASHYA_POINTS[VASHYAS.indexOf(groomVashya)][VASHYAS.indexOf(brideVashya)],
      maxPoints: 2,
      bride: brideVashya,
      groom: groomVashya,
    },
    {
      name: 'Tara',
      area: 'health and wellbeing',
      points: taraPoints,
      maxPoints: 3,
      bride: NAKSHATRAS[b.nak],
      groom: NAKSHATRAS[g.nak],
    },
    {
      name: 'Yoni',
      area: 'intimacy',
      points: YONI_POINTS[YONIS.indexOf(brideYoni)][YONIS.indexOf(groomYoni)],
      maxPoints: 4,
      bride: brideYoni,
      groom: groomYoni,
    },
    {
      name: 'Graha Maitri',
      area: 'friendship and outlook',
      points: maitriPoints,
      maxPoints: 5,
      bride: brideLord,
      groom: groomLord,
    },
    {
      name: 'Gana',
      area: 'temperament',
      points: GANA_POINTS[GANAS.indexOf(brideGana)][GANAS.indexOf(groomGana)],
      maxPoints: 6,
      bride: brideGana,
      groom: groomGana,
    },
    {
      name: 'Bhakoot',
      area: 'love, family and prosperity',
      points: bhakootDosha ? 0 : 7,
      maxPoints: 7,
      bride: SIGNS[b.sign],
      groom: SIGNS[g.sign],
    },
    {
      name: 'Nadi',
      area: 'health and children',
      points: nadiDosha ? 0 : 8,
      maxPoints: 8,
      bride: brideNadi,
      groom: groomNadi,
    },
  ];

  const brideManglik = bride.manglik.fromLagna || bride.manglik.fromMoon;
  const groomManglik = groom.manglik.fromLagna || groom.manglik.fromMoon;

  return {
    total: kootas.reduce((sum, koota) => sum + koota.points, 0),
    maxTotal: 36,
    kootas,
    nadiDosha,
    bhakootDosha,
    manglik: { bride: bride.manglik, groom: groom.manglik, mismatch: brideManglik !== groomManglik },
  };
}

export function verdict(total: number) {
  if (total >= 32) return 'an excellent match';
  if (total >= 25) return 'a very good match';
  if (total >= 18) return 'an acceptable match';
  return 'a challenging match';
}

/** Plain-language summary of the result, shown as "What the stars say". */
export function matchReport(result: AshtakootaResult) {
  const sorted = [...result.kootas].sort((a, b) => b.points / b.maxPoints - a.points / a.maxPoints);
  const strongest = sorted.filter((koota) => koota.points === koota.maxPoints).slice(0, 2);
  const weakest = sorted.filter((koota) => koota.points / koota.maxPoints < 0.5).slice(-2).reverse();

  const sentences = [`Guna Milan scores ${result.total} out of 36, ${verdict(result.total)} by traditional standards.`];
  if (strongest.length) {
    sentences.push(`You are strongest in ${strongest.map((koota) => `${koota.name} (${koota.area})`).join(' and ')}.`);
  }
  if (weakest.length) {
    sentences.push(`${weakest.map((koota) => `${koota.name} (${koota.area})`).join(' and ')} ${weakest.length > 1 ? 'are' : 'is'} where you differ most.`);
  }
  if (result.nadiDosha) sentences.push('You share the same nadi, which tradition treats as Nadi dosha.');
  if (result.bhakootDosha) sentences.push('Your Moon signs form a Bhakoot dosha placement.');
  if (result.manglik.mismatch) sentences.push('Only one of you is Manglik, which many families like to look at more closely.');
  sentences.push('Treat this as one perspective; getting to know each other matters most.');
  return sentences.join(' ');
}

export function moonDescription(profile: MoonProfile) {
  const nak = nakshatraIndex(profile.moonLongitude);
  return `${NAKSHATRAS[nak]} pada ${nakshatraPada(profile.moonLongitude)}, ${SIGNS[signIndex(profile.moonLongitude)]}`;
}
