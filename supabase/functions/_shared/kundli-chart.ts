/**
 * Normalises AstrologyAPI `horo_chart/:chartId` responses into the house layout the app draws.
 *
 * The API returns 12 entries, one per house, each with the sign in that house and parallel
 * arrays of the planets in it:
 *   { sign: 5, sign_name: "Leo", planet: ["SUN"], planet_small: ["Su "], planet_degree: ["12.4"] }
 */

export type ChartPlanet = { name: string; abbr: string; degree?: string };
export type ChartHouse = { house: number; sign: number; signName: string; planets: ChartPlanet[] };

const SIGN_NAMES = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(text) : [];
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/** "12.47" → "12°"; strings that already carry a unit (e.g. "12°28'") are kept. */
function formatDegree(value: string) {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.floor(numeric)}°` : value;
}

function signNumber(entry: Record<string, unknown>) {
  const fromNumber = Number(entry.sign);
  if (Number.isInteger(fromNumber) && fromNumber >= 1 && fromNumber <= 12) return fromNumber;
  const index = SIGN_NAMES.indexOf(text(entry.sign_name).toLowerCase());
  return index >= 0 ? index + 1 : null;
}

/**
 * Returns the 12 houses starting from the ascendant, or `null` if the response doesn't look like
 * a complete chart. When `ascendant` (e.g. "Leo") is given, the entries are rotated so the house
 * holding that sign comes first, whatever order the API used.
 */
export function normaliseChartHouses(raw: unknown, ascendant?: string): { houses: ChartHouse[]; rotated: boolean } | null {
  if (!Array.isArray(raw) || raw.length !== 12) return null;

  const entries = raw.map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;
    const sign = signNumber(record);
    if (sign === null) return null;

    const names = list(record.planet);
    const abbrs = list(record.planet_small);
    const degrees = list(record.planet_degree);
    const planets = names
      .map((name, index) => ({
        name: titleCase(name),
        abbr: abbrs[index] || titleCase(name).slice(0, 2),
        degree: formatDegree(degrees[index] ?? ''),
      }))
      // The ascendant is marked on the chart itself; it isn't a planet.
      .filter((planet) => planet.name && !/^(asc|ascendant|lagna)$/i.test(planet.name));

    return { sign, signName: titleCase(text(record.sign_name) || SIGN_NAMES[sign - 1]), planets };
  });

  if (entries.some((entry) => entry === null)) return null;
  const valid = entries as NonNullable<(typeof entries)[number]>[];
  if (new Set(valid.map((entry) => entry.sign)).size !== 12) return null;

  let start = 0;
  if (ascendant) {
    const index = valid.findIndex((entry) => entry.signName.toLowerCase() === ascendant.trim().toLowerCase());
    if (index >= 0) start = index;
  }

  const ordered = [...valid.slice(start), ...valid.slice(0, start)];
  return {
    houses: ordered.map((entry, index) => ({ house: index + 1, ...entry })),
    rotated: start !== 0,
  };
}
