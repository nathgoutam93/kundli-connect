/** One planet in a chart house, as the app draws it. */
export type ChartPlanet = { name: string; abbr: string; degree?: string };

/** One house of a chart, starting from the ascendant (house 1). `sign` is 1 (Aries) to 12 (Pisces). */
export type ChartHouse = { house: number; sign: number; signName: string; planets: ChartPlanet[] };
