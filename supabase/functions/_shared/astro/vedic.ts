/** Vedic reference tables and the attributes derived from sidereal longitudes. */
import { type Graha, normalise } from './ephemeris.ts';

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

export type Planet = Exclude<Graha, 'Rahu' | 'Ketu'>;

export const SIGN_LORDS: Planet[] = [
  'Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury',
  'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter',
];

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
] as const;

/** Vimshottari lords, repeating every nine nakshatras from Ashwini. */
const NAKSHATRA_LORD_CYCLE: Graha[] = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];

export const GANAS = ['Deva', 'Manushya', 'Rakshasa'] as const;
export type Gana = (typeof GANAS)[number];
// By nakshatra index.
const GANA_BY_NAKSHATRA: Gana[] = [
  'Deva', 'Manushya', 'Rakshasa', 'Manushya', 'Deva', 'Manushya', 'Deva', 'Deva', 'Rakshasa',
  'Rakshasa', 'Manushya', 'Manushya', 'Deva', 'Rakshasa', 'Deva', 'Rakshasa', 'Deva', 'Rakshasa',
  'Rakshasa', 'Manushya', 'Manushya', 'Deva', 'Rakshasa', 'Rakshasa', 'Manushya', 'Manushya', 'Deva',
];

export const NADIS = ['Adi', 'Madhya', 'Antya'] as const;
export type Nadi = (typeof NADIS)[number];
// Nadi runs Adi, Madhya, Antya, Antya, Madhya, Adi, … from Ashwini.
const NADI_PATTERN: Nadi[] = ['Adi', 'Madhya', 'Antya', 'Antya', 'Madhya', 'Adi'];

export const YONIS = [
  'Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat',
  'Cow', 'Buffalo', 'Tiger', 'Deer', 'Monkey', 'Mongoose', 'Lion',
] as const;
export type Yoni = (typeof YONIS)[number];
const YONI_BY_NAKSHATRA: Yoni[] = [
  'Horse', 'Elephant', 'Sheep', 'Serpent', 'Serpent', 'Dog', 'Cat', 'Sheep', 'Cat',
  'Rat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Buffalo', 'Tiger', 'Deer', 'Deer',
  'Dog', 'Monkey', 'Mongoose', 'Monkey', 'Lion', 'Horse', 'Lion', 'Cow', 'Elephant',
];

export const VARNAS = ['Shudra', 'Vaishya', 'Kshatriya', 'Brahmin'] as const;
export type Varna = (typeof VARNAS)[number];
// By the element of the Moon sign: fire Kshatriya, earth Vaishya, air Shudra, water Brahmin.
const VARNA_BY_SIGN: Varna[] = [
  'Kshatriya', 'Vaishya', 'Shudra', 'Brahmin', 'Kshatriya', 'Vaishya',
  'Shudra', 'Brahmin', 'Kshatriya', 'Vaishya', 'Shudra', 'Brahmin',
];

export const VASHYAS = ['Chatushpada', 'Manava', 'Jalachara', 'Vanachara', 'Keeta'] as const;
export type Vashya = (typeof VASHYAS)[number];

const TATVAS = ['Fire', 'Earth', 'Air', 'Water'] as const;

const TITHIS = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami',
  'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];

const YOGAS = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula',
  'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyan',
  'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];

const MOVABLE_KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'];

/** Traditional first syllables for a name, one per nakshatra pada. */
const NAME_SYLLABLES = [
  ['Chu', 'Che', 'Cho', 'La'], ['Li', 'Lu', 'Le', 'Lo'], ['A', 'I', 'U', 'E'], ['O', 'Va', 'Vi', 'Vu'],
  ['Ve', 'Vo', 'Ka', 'Ki'], ['Ku', 'Gha', 'Ng', 'Chha'], ['Ke', 'Ko', 'Ha', 'Hi'], ['Hu', 'He', 'Ho', 'Da'],
  ['Di', 'Du', 'De', 'Do'], ['Ma', 'Mi', 'Mu', 'Me'], ['Mo', 'Ta', 'Ti', 'Tu'], ['Te', 'To', 'Pa', 'Pi'],
  ['Pu', 'Sha', 'Na', 'Tha'], ['Pe', 'Po', 'Ra', 'Ri'], ['Ru', 'Re', 'Ro', 'Ta'], ['Ti', 'Tu', 'Te', 'To'],
  ['Na', 'Ni', 'Nu', 'Ne'], ['No', 'Ya', 'Yi', 'Yu'], ['Ye', 'Yo', 'Bha', 'Bhi'], ['Bhu', 'Dha', 'Pha', 'Dha'],
  ['Bhe', 'Bho', 'Ja', 'Ji'], ['Ju', 'Je', 'Jo', 'Gha'], ['Ga', 'Gi', 'Gu', 'Ge'], ['Go', 'Sa', 'Si', 'Su'],
  ['Se', 'So', 'Da', 'Di'], ['Du', 'Tha', 'Jha', 'Na'], ['De', 'Do', 'Cha', 'Chi'],
];

const NAKSHATRA_SPAN = 360 / 27;

export function signIndex(longitude: number) {
  return Math.floor(normalise(longitude) / 30);
}

export function degreeInSign(longitude: number) {
  return normalise(longitude) % 30;
}

export function nakshatraIndex(longitude: number) {
  return Math.floor(normalise(longitude) / NAKSHATRA_SPAN);
}

/** Pada (quarter) of the nakshatra, 1–4. */
export function nakshatraPada(longitude: number) {
  return Math.floor((normalise(longitude) % NAKSHATRA_SPAN) / (NAKSHATRA_SPAN / 4)) + 1;
}

export function nakshatraLord(index: number) {
  return NAKSHATRA_LORD_CYCLE[index % 9];
}

export function ganaOf(nakshatra: number) {
  return GANA_BY_NAKSHATRA[nakshatra];
}

export function nadiOf(nakshatra: number) {
  return NADI_PATTERN[nakshatra % 6];
}

export function yoniOf(nakshatra: number) {
  return YONI_BY_NAKSHATRA[nakshatra];
}

export function varnaOf(moonLongitude: number) {
  return VARNA_BY_SIGN[signIndex(moonLongitude)];
}

/** Vashya by Moon position; Sagittarius and Capricorn are split at 15°. */
export function vashyaOf(moonLongitude: number): Vashya {
  const sign = SIGNS[signIndex(moonLongitude)];
  const firstHalf = degreeInSign(moonLongitude) < 15;
  switch (sign) {
    case 'Aries':
    case 'Taurus':
      return 'Chatushpada';
    case 'Cancer':
    case 'Pisces':
      return 'Jalachara';
    case 'Leo':
      return 'Vanachara';
    case 'Scorpio':
      return 'Keeta';
    case 'Sagittarius':
      return firstHalf ? 'Manava' : 'Chatushpada';
    case 'Capricorn':
      return firstHalf ? 'Chatushpada' : 'Jalachara';
    default:
      return 'Manava'; // Gemini, Virgo, Libra, Aquarius
  }
}

export function tatvaOf(signIdx: number) {
  return TATVAS[signIdx % 4];
}

export function nameSyllable(nakshatra: number, pada: number) {
  return NAME_SYLLABLES[nakshatra][pada - 1];
}

/** Lunar day from the Moon's elongation from the Sun. */
export function tithiOf(sunLongitude: number, moonLongitude: number) {
  const index = Math.floor(normalise(moonLongitude - sunLongitude) / 12); // 0–29
  const paksha = index < 15 ? 'Shukla' : 'Krishna';
  const day = index % 15;
  const name = day === 14 ? (paksha === 'Shukla' ? 'Purnima' : 'Amavasya') : TITHIS[day];
  return { number: index + 1, name, paksha };
}

export function yogaOf(sunLongitude: number, moonLongitude: number) {
  return YOGAS[Math.floor(normalise(sunLongitude + moonLongitude) / NAKSHATRA_SPAN)];
}

/** Half-tithi; the four fixed karanas sit around the new moon. */
export function karanaOf(sunLongitude: number, moonLongitude: number) {
  const index = Math.floor(normalise(moonLongitude - sunLongitude) / 6); // 0–59
  if (index === 0) return 'Kimstughna';
  if (index === 57) return 'Shakuni';
  if (index === 58) return 'Chatushpada';
  if (index === 59) return 'Naga';
  return MOVABLE_KARANAS[(index - 1) % 7];
}

/** Navamsa (D9) sign: each sign is split into nine parts of 3°20'. */
export function navamsaSign(longitude: number) {
  return Math.floor((normalise(longitude) * 9) / 30) % 12;
}

export function navamsaLongitude(longitude: number) {
  return normalise(normalise(longitude) * 9);
}

/** Whole-sign house (1–12) of a longitude counted from the ascendant's sign. */
export function houseFrom(referenceSign: number, longitude: number) {
  return ((signIndex(longitude) - referenceSign + 12) % 12) + 1;
}

// Natural (naisargika) relationships between the seven planets.
const FRIENDS: Record<Planet, Planet[]> = {
  Sun: ['Moon', 'Mars', 'Jupiter'],
  Moon: ['Sun', 'Mercury'],
  Mars: ['Sun', 'Moon', 'Jupiter'],
  Mercury: ['Sun', 'Venus'],
  Jupiter: ['Sun', 'Moon', 'Mars'],
  Venus: ['Mercury', 'Saturn'],
  Saturn: ['Mercury', 'Venus'],
};
const ENEMIES: Record<Planet, Planet[]> = {
  Sun: ['Venus', 'Saturn'],
  Moon: [],
  Mars: ['Mercury'],
  Mercury: ['Moon'],
  Jupiter: ['Mercury', 'Venus'],
  Venus: ['Sun', 'Moon'],
  Saturn: ['Sun', 'Moon', 'Mars'],
};

export type Relationship = 'friend' | 'neutral' | 'enemy';

/** How `planet` regards `other`. */
export function relationship(planet: Planet, other: Planet): Relationship {
  if (planet === other || FRIENDS[planet].includes(other)) return 'friend';
  return ENEMIES[planet].includes(other) ? 'enemy' : 'neutral';
}

export const EXALTATION_SIGN: Record<Planet, number> = {
  Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6,
};

export function ownsSign(planet: Planet, sign: number) {
  return SIGN_LORDS[sign] === planet;
}
