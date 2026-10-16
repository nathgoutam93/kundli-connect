/** Builds the stored Kundli (summary, details and chart layouts) from a sidereal chart. */
import type { ChartHouse } from './types.ts';
import { type BirthMoment, type Graha, GRAHAS, type SiderealChart, siderealChart } from './ephemeris.ts';
import {
  degreeInSign,
  EXALTATION_SIGN,
  ganaOf,
  houseFrom,
  karanaOf,
  nadiOf,
  nakshatraIndex,
  nakshatraLord,
  nakshatraPada,
  NAKSHATRAS,
  nameSyllable,
  navamsaLongitude,
  ownsSign,
  type Planet,
  SIGN_LORDS,
  SIGNS,
  signIndex,
  tatvaOf,
  tithiOf,
  varnaOf,
  vashyaOf,
  yogaOf,
  yoniOf,
} from './vedic.ts';

/** Bump when the calculation changes so stored Kundlis are rebuilt on their next request. */
export const KUNDLI_ENGINE_VERSION = 'local-1';

const ABBREVIATIONS: Record<Graha, string> = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
};

const MANGLIK_HOUSES = [1, 2, 4, 7, 8, 12];
const KENDRAS = [1, 4, 7, 10];

export type KundliSummary = {
  generatedAt: string;
  ascendant: string;
  moonSign: string;
  sunSign: string;
  nakshatra: string;
  gana: string;
  nadi: string;
  manglik: string;
  yogas: string[];
  doshas: string[];
  overview: string;
};

export type ManglikStatus = { fromLagna: boolean; fromMoon: boolean };

export type BuiltKundli = {
  summary: KundliSummary;
  /** Flat birth details shown as the "Kundli details" badges in the app. */
  details: Record<string, string | number>;
  chartHouses: Record<'D1' | 'D9', ChartHouse[]>;
  /** Planet positions kept for reference and debugging. */
  positions: Record<string, unknown>;
};

function formatDms(degrees: number) {
  const whole = Math.floor(degrees);
  const minutes = Math.floor((degrees - whole) * 60);
  return `${whole}°${String(minutes).padStart(2, '0')}'`;
}

export function manglikStatus(chart: SiderealChart): ManglikStatus {
  const mars = chart.grahas.Mars.longitude;
  return {
    fromLagna: MANGLIK_HOUSES.includes(houseFrom(signIndex(chart.ascendant), mars)),
    fromMoon: MANGLIK_HOUSES.includes(houseFrom(signIndex(chart.grahas.Moon.longitude), mars)),
  };
}

function manglikLabel(status: ManglikStatus) {
  if (status.fromLagna && status.fromMoon) return 'Yes';
  if (status.fromLagna || status.fromMoon) return 'Mild';
  return 'No';
}

/** All seven planets on one side of the Rahu–Ketu axis. */
function hasKaalSarp(chart: SiderealChart) {
  const rahu = chart.grahas.Rahu.longitude;
  const offsets = (['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as const).map(
    (planet) => (chart.grahas[planet].longitude - rahu + 360) % 360
  );
  return offsets.every((offset) => offset < 180) || offsets.every((offset) => offset > 180);
}

/** A handful of well-known yogas that can be read reliably from sign placements. */
function findYogas(chart: SiderealChart) {
  const sign = (graha: Graha) => signIndex(chart.grahas[graha].longitude);
  const lagnaSign = signIndex(chart.ascendant);
  const yogas: string[] = [];

  if (KENDRAS.includes(houseFrom(sign('Moon'), chart.grahas.Jupiter.longitude))) yogas.push('Gajakesari Yoga');
  if (sign('Sun') === sign('Mercury')) yogas.push('Budhaditya Yoga');
  if (sign('Moon') === sign('Mars')) yogas.push('Chandra-Mangala Yoga');

  const mahapurusha: [Planet, string][] = [
    ['Mars', 'Ruchaka'], ['Mercury', 'Bhadra'], ['Jupiter', 'Hamsa'], ['Venus', 'Malavya'], ['Saturn', 'Shasha'],
  ];
  for (const [planet, name] of mahapurusha) {
    const planetSign = sign(planet);
    const strong = ownsSign(planet, planetSign) || EXALTATION_SIGN[planet] === planetSign;
    if (strong && KENDRAS.includes(houseFrom(lagnaSign, chart.grahas[planet].longitude))) yogas.push(`${name} Yoga`);
  }
  return yogas;
}

function buildHouses(lagnaLongitude: number, longitudes: Record<Graha, number>): ChartHouse[] {
  const lagnaSign = signIndex(lagnaLongitude);
  return Array.from({ length: 12 }, (_, index) => {
    const sign = (lagnaSign + index) % 12;
    return {
      house: index + 1,
      sign: sign + 1,
      signName: SIGNS[sign],
      planets: GRAHAS.filter((graha) => signIndex(longitudes[graha]) === sign).map((graha) => ({
        name: graha,
        abbr: ABBREVIATIONS[graha],
        degree: `${Math.floor(degreeInSign(longitudes[graha]))}°`,
      })),
    };
  });
}

export function buildKundli(birth: BirthMoment, generatedAt = new Date()): BuiltKundli {
  const chart = siderealChart(birth);
  const { grahas, ascendant } = chart;
  const moon = grahas.Moon.longitude;
  const sun = grahas.Sun.longitude;

  const lagnaSign = signIndex(ascendant);
  const moonSign = signIndex(moon);
  const nakshatra = nakshatraIndex(moon);
  const pada = nakshatraPada(moon);
  const tithi = tithiOf(sun, moon);
  const manglik = manglikStatus(chart);
  const yogas = findYogas(chart);
  const doshas = [
    ...(manglik.fromLagna || manglik.fromMoon ? ['Manglik Dosha'] : []),
    ...(hasKaalSarp(chart) ? ['Kaal Sarp Dosha'] : []),
  ];

  const summary: KundliSummary = {
    generatedAt: generatedAt.toISOString(),
    ascendant: SIGNS[lagnaSign],
    moonSign: SIGNS[moonSign],
    sunSign: SIGNS[signIndex(sun)],
    nakshatra: NAKSHATRAS[nakshatra],
    gana: ganaOf(nakshatra),
    nadi: nadiOf(nakshatra),
    manglik: manglikLabel(manglik),
    yogas,
    doshas,
    overview:
      `${SIGNS[lagnaSign]} rising, with the Moon in ${SIGNS[moonSign]} in ${NAKSHATRAS[nakshatra]} ` +
      `nakshatra (pada ${pada}) and the Sun in ${SIGNS[signIndex(sun)]}. ` +
      `Your Moon sign lord is ${SIGN_LORDS[moonSign]} and your nakshatra lord is ${nakshatraLord(nakshatra)}; ` +
      `your gana is ${ganaOf(nakshatra)} and your nadi is ${nadiOf(nakshatra)}.`,
  };

  const details = {
    ascendant: SIGNS[lagnaSign],
    ascendant_lord: SIGN_LORDS[lagnaSign],
    moon_sign: SIGNS[moonSign],
    moon_sign_lord: SIGN_LORDS[moonSign],
    sun_sign: SIGNS[signIndex(sun)],
    nakshatra: NAKSHATRAS[nakshatra],
    nakshatra_lord: nakshatraLord(nakshatra),
    pada,
    varna: varnaOf(moon),
    vashya: vashyaOf(moon),
    yoni: yoniOf(nakshatra),
    gana: ganaOf(nakshatra),
    nadi: nadiOf(nakshatra),
    tatva: tatvaOf(moonSign),
    tithi: `${tithi.paksha} ${tithi.name}`,
    yoga: yogaOf(sun, moon),
    karana: karanaOf(sun, moon),
    name_alphabet: nameSyllable(nakshatra, pada),
    manglik: manglikLabel(manglik),
  };

  const longitudes = Object.fromEntries(GRAHAS.map((graha) => [graha, grahas[graha].longitude])) as Record<Graha, number>;
  const navamsa = Object.fromEntries(GRAHAS.map((graha) => [graha, navamsaLongitude(longitudes[graha])])) as Record<Graha, number>;

  return {
    summary,
    details,
    chartHouses: {
      D1: buildHouses(ascendant, longitudes),
      D9: buildHouses(navamsaLongitude(ascendant), navamsa),
    },
    positions: {
      engine: KUNDLI_ENGINE_VERSION,
      ayanamsa: { name: 'Lahiri', degrees: Number(chart.ayanamsa.toFixed(6)) },
      ascendant: { longitude: Number(ascendant.toFixed(6)), sign: SIGNS[lagnaSign], degree: formatDms(degreeInSign(ascendant)) },
      grahas: Object.fromEntries(
        GRAHAS.map((graha) => {
          const position = grahas[graha];
          return [
            graha,
            {
              longitude: Number(position.longitude.toFixed(6)),
              sign: SIGNS[signIndex(position.longitude)],
              degree: formatDms(degreeInSign(position.longitude)),
              house: houseFrom(lagnaSign, position.longitude),
              nakshatra: NAKSHATRAS[nakshatraIndex(position.longitude)],
              pada: nakshatraPada(position.longitude),
              retrograde: position.retrograde,
            },
          ];
        })
      ),
    },
  };
}
