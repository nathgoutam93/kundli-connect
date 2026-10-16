/**
 * Sidereal (Lahiri) planet positions and ascendant for a birth moment, computed locally with
 * astronomy-engine (MIT, pure TypeScript, no data files), so it runs inside an Edge Function.
 *
 * Accuracy is checked against the Swiss Ephemeris (the engine most Vedic software, including
 * AstrologyAPI, is built on): see tests/astro_test.ts.
 */
import * as Astronomy from 'npm:astronomy-engine@2.1.19';

export const GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const;
export type Graha = (typeof GRAHAS)[number];

export type GrahaPosition = {
  /** Sidereal ecliptic longitude, 0–360°. */
  longitude: number;
  /** Degrees per day; negative means retrograde (Rahu and Ketu always move backwards). */
  speed: number;
  retrograde: boolean;
};

export type BirthMoment = {
  /** The birth moment as a UTC instant. */
  utc: Date;
  latitude: number;
  longitude: number;
};

export type SiderealChart = {
  ayanamsa: number;
  /** Sidereal longitude of the ascendant (lagna). */
  ascendant: number;
  grahas: Record<Graha, GrahaPosition>;
};

const PLANET_BODIES: Partial<Record<Graha, Astronomy.Body>> = {
  Mars: Astronomy.Body.Mars,
  Mercury: Astronomy.Body.Mercury,
  Jupiter: Astronomy.Body.Jupiter,
  Venus: Astronomy.Body.Venus,
  Saturn: Astronomy.Body.Saturn,
};

const DEG = Math.PI / 180;

export function normalise(degrees: number) {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** Julian centuries of Terrestrial Time since J2000. */
function centuries(time: Astronomy.AstroTime) {
  return time.tt / 36525;
}

/** Mean lunar ascending node (Meeus, Astronomical Algorithms 47.7), tropical. */
function meanNode(time: Astronomy.AstroTime) {
  const t = centuries(time);
  return normalise(125.0445479 - 1934.1362891 * t + 0.0020754 * t * t + (t * t * t) / 467441 - (t * t * t * t) / 60616000);
}

/** IAU 2006 general precession in longitude since J2000, in degrees. */
function precessionInLongitude(t: number) {
  const arcseconds = 5028.796195 * t + 1.1054348 * t ** 2 + 0.00007964 * t ** 3 - 0.000023857 * t ** 4 - 0.0000000383 * t ** 5;
  return arcseconds / 3600;
}

// Lahiri (Chitrapaksha) as defined by the Indian Calendar Reform Committee: 23°15'00.658" on
// 21 March 1956 0h TT, carried forward by precession. Same definition as SE_SIDM_LAHIRI.
const LAHIRI_EPOCH_TT_DAYS = 2435553.5 - 2451545.0;
const LAHIRI_AT_EPOCH = 23.250182778 - 0.004658035;

/** Mean Lahiri ayanamsa (without nutation) at `time`. */
export function lahiriAyanamsa(time: Astronomy.AstroTime) {
  return LAHIRI_AT_EPOCH + precessionInLongitude(centuries(time)) - precessionInLongitude(LAHIRI_EPOCH_TT_DAYS / 36525);
}

/** Apparent geocentric longitude on the true ecliptic and equinox of date. */
function tropicalLongitude(graha: Graha, time: Astronomy.AstroTime) {
  if (graha === 'Sun') return Astronomy.SunPosition(time).elon;
  if (graha === 'Moon') return Astronomy.EclipticGeoMoon(time).lon;
  if (graha === 'Rahu') return meanNode(time);
  if (graha === 'Ketu') return normalise(meanNode(time) + 180);
  return Astronomy.Ecliptic(Astronomy.GeoVector(PLANET_BODIES[graha]!, time, true)).elon;
}

function angularDifference(later: number, earlier: number) {
  return ((later - earlier + 540) % 360) - 180;
}

/** Tropical ascendant from local apparent sidereal time and the true obliquity. */
function tropicalAscendant(time: Astronomy.AstroTime, latitude: number, longitude: number) {
  const ramc = normalise(Astronomy.SiderealTime(time) * 15 + longitude) * DEG;
  const obliquity = Astronomy.e_tilt(time).tobl * DEG;
  const ascendant = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(obliquity) + Math.tan(latitude * DEG) * Math.sin(obliquity)));
  return normalise(ascendant / DEG);
}

export function siderealChart({ utc, latitude, longitude }: BirthMoment): SiderealChart {
  const time = Astronomy.MakeTime(utc);
  const before = time.AddDays(-0.25);
  const after = time.AddDays(0.25);
  // Positions are on the true equinox of date, so subtract the true ayanamsa (mean + nutation).
  const ayanamsa = lahiriAyanamsa(time) + Astronomy.e_tilt(time).dpsi / 3600;

  const grahas = Object.fromEntries(
    GRAHAS.map((graha) => {
      const speed = angularDifference(tropicalLongitude(graha, after), tropicalLongitude(graha, before)) / 0.5;
      return [
        graha,
        {
          longitude: normalise(tropicalLongitude(graha, time) - ayanamsa),
          speed,
          retrograde: speed < 0,
        },
      ];
    })
  ) as Record<Graha, GrahaPosition>;

  return {
    ayanamsa,
    ascendant: normalise(tropicalAscendant(time, latitude, longitude) - ayanamsa),
    grahas,
  };
}

/** Converts a local civil birth date and time with a UTC offset (hours) to a UTC instant. */
export function birthInstant(date: string, time: string, utcOffsetHours: number) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - utcOffsetHours * 3_600_000);
}
