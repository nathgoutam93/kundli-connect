import { normaliseChartHouses } from "../_shared/kundli-chart.ts";

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

/** A chart in the API's shape, houses starting from `firstSign` (1-12). */
function apiChart(firstSign: number, planetsByHouse: Record<number, [string, string, string][]> = {}) {
  return Array.from({ length: 12 }, (_, index) => {
    const sign = ((firstSign - 1 + index) % 12) + 1;
    const planets = planetsByHouse[index + 1] ?? [];
    return {
      sign,
      sign_name: SIGNS[sign - 1],
      planet: planets.map((p) => p[0]),
      planet_small: planets.map((p) => p[1]),
      planet_degree: planets.map((p) => p[2]),
    };
  });
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("maps houses, planets and degrees", () => {
  const result = normaliseChartHouses(apiChart(5, { 1: [["SUN", "Su ", "12.47"], ["ASC", "As", "3"]], 10: [["MOON", "Mo ", "8°40'"]] }), "Leo");
  expect(result, "valid chart rejected");
  const [first, , , , , , , , , tenth] = result!.houses;
  expect(first.house === 1 && first.sign === 5 && first.signName === "Leo", `house 1 wrong: ${JSON.stringify(first)}`);
  expect(first.planets.length === 1, "ascendant marker kept as a planet");
  expect(first.planets[0].name === "Sun" && first.planets[0].abbr === "Su" && first.planets[0].degree === "12°", `sun wrong: ${JSON.stringify(first.planets)}`);
  expect(tenth.sign === 2 && tenth.planets[0].degree === "8°40'", `house 10 wrong: ${JSON.stringify(tenth)}`);
  expect(result!.rotated === false, "already ascendant-first chart reported as rotated");
});

Deno.test("rotates a sign-ordered response so the ascendant is house 1", () => {
  const result = normaliseChartHouses(apiChart(1, { 5: [["JUPITER", "Ju ", "20"]] }), "leo");
  expect(result?.rotated === true, "rotation not reported");
  expect(result!.houses[0].signName === "Leo" && result!.houses[0].planets[0].abbr === "Ju", `house 1: ${JSON.stringify(result!.houses[0])}`);
  expect(result!.houses[11].signName === "Cancer", "last house should be the sign before the ascendant");
});

Deno.test("rejects incomplete or malformed charts", () => {
  expect(normaliseChartHouses(null) === null, "null accepted");
  expect(normaliseChartHouses(apiChart(1).slice(0, 11)) === null, "11 houses accepted");
  const duplicate = apiChart(1);
  duplicate[3] = { ...duplicate[3], sign: 1, sign_name: "Aries" };
  expect(normaliseChartHouses(duplicate) === null, "duplicate sign accepted");
  expect(normaliseChartHouses({ error: "auth" }) === null, "error payload accepted");
});
