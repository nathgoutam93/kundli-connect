import { ashtakoota, matchReport, type MoonProfile } from "../_shared/astro/ashtakoota.ts";
import { birthInstant, GRAHAS, siderealChart } from "../_shared/astro/ephemeris.ts";
import { buildKundli } from "../_shared/astro/kundli.ts";
import { karanaOf, nadiOf, nakshatraIndex, nakshatraPada, navamsaSign, SIGNS, signIndex, tithiOf } from "../_shared/astro/vedic.ts";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const arcDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

// Sidereal (Lahiri) positions from the Swiss Ephemeris 2.10 (sepl/semo files, mean node).
const SWISS_REFERENCE = [
  { name: 'Lucknow 1996', utc: '1996-03-14T01:12:00Z', latitude: 26.8467, longitude: 80.9462, ascendant: 337.4318,
    grahas: { Sun: 329.9375, Moon: 257.5287, Mars: 327.9183, Mercury: 317.2, Jupiter: 259.9555, Venus: 14.9707, Saturn: 333.2025, Rahu: 174.7642, Ketu: 354.7642 } },
  { name: 'Mumbai 1988', utc: '1988-11-02T17:45:00Z', latitude: 19.076, longitude: 72.8777, ascendant: 93.1447,
    grahas: { Sun: 196.8239, Moon: 121.2317, Mars: 336.3741, Mercury: 180.3819, Jupiter: 39.987, Venus: 160.8451, Saturn: 245.3767, Rahu: 317.2232, Ketu: 137.2232 } },
  { name: 'Kolkata 1943', utc: '1943-06-01T03:30:00Z', latitude: 22.5726, longitude: 88.3639, ascendant: 102.3757,
    grahas: { Sun: 46.7149, Moon: 25.8367, Mars: 340.4581, Mercury: 34.5003, Jupiter: 90.9209, Venus: 90.07, Saturn: 52.0927, Rahu: 116.4457, Ketu: 296.4457 } },
  { name: 'Bengaluru 2001', utc: '2001-08-15T23:05:30Z', latitude: 12.9716, longitude: 77.5946, ascendant: 97.0849,
    grahas: { Sun: 119.2907, Moon: 75.1308, Mars: 235.9685, Mercury: 129.4024, Jupiter: 73.2047, Venus: 82.8885, Saturn: 49.5455, Rahu: 69.7917, Ketu: 249.7917 } },
  { name: 'Delhi 1975', utc: '1975-01-26T06:20:00Z', latitude: 28.6139, longitude: 77.209, ascendant: 13.753,
    grahas: { Sun: 282.1531, Moon: 82.9409, Mars: 249.7631, Mercury: 300.3789, Jupiter: 324.6041, Venus: 301.5074, Saturn: 80.3347, Rahu: 223.7453, Ketu: 43.7453 } },
  { name: 'Chennai 2006', utc: '2006-12-31T18:29:00Z', latitude: 13.0827, longitude: 80.2707, ascendant: 163.528,
    grahas: { Sun: 255.9841, Moon: 40.2552, Mars: 234.3069, Mercury: 252.1897, Jupiter: 224.1913, Venus: 271.8133, Saturn: 120.5155, Rahu: 325.7255, Ketu: 145.7255 } },
  { name: 'London 1990', utc: '1990-07-04T11:00:00Z', latitude: 51.5074, longitude: -0.1278, ascendant: 154.2052,
    grahas: { Sun: 78.4914, Moon: 218.4563, Mars: 0.6963, Mercury: 80.5995, Jupiter: 86.3462, Venus: 47.4893, Saturn: 269.0458, Rahu: 284.9659, Ketu: 104.9659 } },
  { name: 'New York 1985', utc: '1985-05-20T03:15:00Z', latitude: 40.7128, longitude: -74.006, ascendant: 256.446,
    grahas: { Sun: 35.4099, Moon: 37.97, Mars: 52.6784, Mercury: 16.0459, Jupiter: 292.923, Venus: 352.3519, Saturn: 210.8542, Rahu: 24.1311, Ketu: 204.1311 } },
  { name: 'Sydney 1999', utc: '1999-02-10T22:40:00Z', latitude: -33.8688, longitude: 151.2093, ascendant: 337.6524,
    grahas: { Sun: 297.8994, Moon: 234.6899, Mars: 191.8724, Mercury: 303.0623, Jupiter: 335.6982, Venus: 322.6501, Saturn: 4.5987, Rahu: 118.3863, Ketu: 298.3863 } },
];

Deno.test("positions match the Swiss Ephemeris within 1 arcminute", () => {
  for (const ref of SWISS_REFERENCE) {
    const chart = siderealChart({ utc: new Date(ref.utc), latitude: ref.latitude, longitude: ref.longitude });
    for (const graha of GRAHAS) {
      const diff = arcDiff(chart.grahas[graha].longitude, ref.grahas[graha]);
      expect(diff < 1 / 60, `${ref.name} ${graha}: off by ${(diff * 3600).toFixed(1)}"`);
    }
    const ascDiff = arcDiff(chart.ascendant, ref.ascendant);
    expect(ascDiff < 1 / 60, `${ref.name} ascendant: off by ${(ascDiff * 3600).toFixed(1)}"`);
  }
});

Deno.test("the Kundli's signs, nakshatra and houses agree with the reference chart", () => {
  for (const ref of SWISS_REFERENCE) {
    const kundli = buildKundli({ utc: new Date(ref.utc), latitude: ref.latitude, longitude: ref.longitude });
    expect(kundli.summary.ascendant === SIGNS[signIndex(ref.ascendant)], `${ref.name} ascendant sign`);
    expect(kundli.summary.moonSign === SIGNS[signIndex(ref.grahas.Moon)], `${ref.name} moon sign`);
    expect(kundli.details.pada === nakshatraPada(ref.grahas.Moon), `${ref.name} pada`);
    const d1 = kundli.chartHouses.D1;
    expect(d1.length === 12 && d1[0].signName === kundli.summary.ascendant, `${ref.name} D1 starts at the ascendant`);
    for (const graha of GRAHAS) {
      const house = d1.find((entry) => entry.planets.some((planet) => planet.name === graha));
      expect(house?.sign === signIndex(ref.grahas[graha]) + 1, `${ref.name} ${graha} in the wrong D1 sign`);
    }
    const placed = kundli.chartHouses.D9.flatMap((house) => house.planets);
    expect(placed.length === 9, `${ref.name} D9 should place all nine grahas`);
  }
});

Deno.test("a known Kundli: Lucknow, 14 March 1996, 06:42 IST", () => {
  const kundli = buildKundli({ utc: birthInstant("1996-03-14", "06:42:00", 5.5), latitude: 26.8467, longitude: 80.9462 });
  expect(kundli.summary.ascendant === "Pisces", `ascendant ${kundli.summary.ascendant}`);
  expect(kundli.summary.moonSign === "Sagittarius", `moon sign ${kundli.summary.moonSign}`);
  expect(kundli.summary.sunSign === "Aquarius", `sun sign ${kundli.summary.sunSign}`);
  expect(kundli.summary.nakshatra === "Purva Ashadha", `nakshatra ${kundli.summary.nakshatra}`);
  expect(kundli.summary.gana === "Manushya" && kundli.summary.nadi === "Madhya", "gana / nadi");
  expect(kundli.details.yoni === "Monkey" && kundli.details.vashya === "Chatushpada", "yoni / vashya (Sagittarius 17°: second half)");
  expect(typeof kundli.summary.overview === "string" && kundli.summary.overview.includes("Pisces rising"), "overview");
});

Deno.test("birth time is converted from the local offset to UTC", () => {
  expect(birthInstant("1998-03-14", "06:42:00", 5.5).toISOString() === "1998-03-14T01:12:00.000Z", "IST");
  expect(birthInstant("1990-07-04", "08:00", -4).toISOString() === "1990-07-04T12:00:00.000Z", "EDT, no seconds");
  expect(birthInstant("2000-01-01", "02:00:00", 5.75).toISOString() === "1999-12-31T20:15:00.000Z", "crosses midnight");
});

Deno.test("navamsa, tithi and karana follow the classical divisions", () => {
  expect(navamsaSign(0) === 0, "Aries 0° starts in Aries");
  expect(navamsaSign(30) === 9, "Taurus 0° starts in Capricorn");
  expect(navamsaSign(60) === 6, "Gemini 0° starts in Libra");
  expect(navamsaSign(90) === 3, "Cancer 0° starts in Cancer");
  expect(navamsaSign(29.9) === 8, "Aries 29.9° is the 9th navamsa, Sagittarius");
  expect(tithiOf(100, 100.5).name === "Pratipada" && tithiOf(100, 100.5).paksha === "Shukla", "new moon + 0.5°");
  expect(tithiOf(0, 175).name === "Purnima", "full moon tithi");
  expect(tithiOf(0, 355).name === "Amavasya", "last tithi");
  expect(karanaOf(0, 0.5) === "Kimstughna" && karanaOf(0, 7) === "Bava" && karanaOf(0, 355) === "Naga", "karanas");
  expect(nakshatraIndex(359.9) === 26 && nadiOf(26) === "Antya", "Revati is Antya nadi");
});

const moon = (longitude: number): MoonProfile => ({ moonLongitude: longitude, manglik: { fromLagna: false, fromMoon: false } });

Deno.test("Guna Milan: Ashwini bride, Bharani groom = 34/36", () => {
  const result = ashtakoota(moon(5), moon(15));
  const points = Object.fromEntries(result.kootas.map((koota) => [koota.name, koota.points]));
  expect(JSON.stringify(points) === JSON.stringify({ Varna: 1, Vashya: 2, Tara: 3, Yoni: 2, "Graha Maitri": 5, Gana: 6, Bhakoot: 7, Nadi: 8 }), JSON.stringify(points));
  expect(result.total === 34 && !result.nadiDosha && !result.bhakootDosha, `total ${result.total}`);
});

Deno.test("Guna Milan: same nakshatra loses Nadi = 28/36", () => {
  const result = ashtakoota(moon(3), moon(8));
  expect(result.total === 28 && result.nadiDosha, `total ${result.total}`);
});

Deno.test("Guna Milan: Magha bride, Shravana (Capricorn 15°) groom = 5.5/36", () => {
  const result = ashtakoota(moon(125), moon(285));
  const points = Object.fromEntries(result.kootas.map((koota) => [koota.name, koota.points]));
  expect(JSON.stringify(points) === JSON.stringify({ Varna: 0, Vashya: 1, Tara: 1.5, Yoni: 2, "Graha Maitri": 0, Gana: 1, Bhakoot: 0, Nadi: 0 }), JSON.stringify(points));
  expect(result.total === 5.5 && result.nadiDosha && result.bhakootDosha, `total ${result.total}`);
  const report = matchReport(result);
  expect(report.includes("5.5 out of 36") && report.includes("Nadi dosha"), report);
});

Deno.test("Guna Milan: every pair of Moon positions scores within 0–36", () => {
  for (let bride = 0; bride < 360; bride += 6.5) {
    for (let groom = 0; groom < 360; groom += 7.25) {
      const result = ashtakoota(moon(bride), moon(groom));
      expect(result.total >= 0 && result.total <= 36, `${bride}/${groom}: ${result.total}`);
      for (const koota of result.kootas) {
        expect(koota.points >= 0 && koota.points <= koota.maxPoints, `${koota.name} ${koota.points}`);
      }
    }
  }
});

Deno.test("Manglik mismatch is flagged only when exactly one person is Manglik", () => {
  const manglik: MoonProfile = { moonLongitude: 5, manglik: { fromLagna: true, fromMoon: false } };
  expect(ashtakoota(manglik, moon(15)).manglik.mismatch, "one Manglik");
  expect(!ashtakoota(manglik, { ...manglik, moonLongitude: 15 }).manglik.mismatch, "both Manglik cancel out");
});
