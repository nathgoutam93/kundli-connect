import { type Ingress, insightsFor, type WeekTransits, weekTransits } from "../_shared/astro/insights.ts";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const minutesBetween = (a: Date, b: string) => Math.abs(a.getTime() - new Date(b).getTime()) / 60_000;

// Ingress times from the Swiss Ephemeris (Lahiri, mean node); they match published panchangs
// (Makar Sankranti 14 Jan 2026, Jupiter into Gemini 14 May 2025, Saturn into Pisces 29 Mar 2025).
Deno.test("transit scan finds sign changes at the reference times", () => {
  const cases: { start: string; graha: string; sign: number; at: string; toleranceMinutes: number }[] = [
    { start: "2026-01-10T00:00:00Z", graha: "Sun", sign: 9, at: "2026-01-14T09:37:20Z", toleranceMinutes: 5 },
    { start: "2025-05-10T00:00:00Z", graha: "Jupiter", sign: 2, at: "2025-05-14T17:06:48Z", toleranceMinutes: 60 },
    { start: "2025-03-25T00:00:00Z", graha: "Saturn", sign: 11, at: "2025-03-29T16:15:09Z", toleranceMinutes: 120 },
    { start: "2025-05-15T00:00:00Z", graha: "Rahu", sign: 10, at: "2025-05-18T14:04:33Z", toleranceMinutes: 240 },
  ];
  for (const testCase of cases) {
    const week = weekTransits(new Date(testCase.start));
    const ingress = week.ingresses.find((entry) => entry.graha === testCase.graha);
    expect(ingress, `${testCase.graha}: no ingress found`);
    expect(ingress!.sign === testCase.sign, `${testCase.graha}: sign ${ingress!.sign}`);
    const off = minutesBetween(ingress!.at, testCase.at);
    expect(off <= testCase.toleranceMinutes, `${testCase.graha}: off by ${off.toFixed(0)} min`);
  }
});

Deno.test("the Moon's sign and nakshatra changes are timed to within minutes", () => {
  const week = weekTransits(new Date("2026-10-12T00:00:00Z"), 4);
  const vishakha = week.moonNakshatraEntries.find((entry) => entry.nakshatra === 15);
  const anuradha = week.moonNakshatraEntries.find((entry) => entry.nakshatra === 16);
  expect(vishakha && minutesBetween(vishakha.at, "2026-10-12T18:22:24Z") <= 5, "Vishakha entry");
  expect(anuradha && minutesBetween(anuradha.at, "2026-10-13T20:13:08Z") <= 5, "Anuradha entry");
  const scorpio = week.moonSpans.find((span) => span.sign === 7);
  expect(scorpio && minutesBetween(scorpio.from, "2026-10-13T13:42:34Z") <= 5, "Moon into Scorpio");
  // Spans tile the window without gaps.
  for (let index = 1; index < week.moonSpans.length; index += 1) {
    expect(week.moonSpans[index].from.getTime() === week.moonSpans[index - 1].to.getTime(), "gap between spans");
  }
});

const START = new Date("2026-10-19T00:00:00Z");
const END = new Date("2026-10-26T00:00:00Z");

function week(overrides: Partial<WeekTransits>): WeekTransits {
  return {
    start: START,
    end: END,
    ingresses: [],
    saturnSignAtStart: 11,
    moonSpans: [{ sign: 0, from: START, to: END }],
    moonNakshatraEntries: [],
    ...overrides,
  };
}

const ingress = (graha: Ingress["graha"], previousSign: number, sign: number): Ingress => ({
  graha,
  previousSign,
  sign,
  at: new Date("2026-10-22T06:00:00Z"),
});

const IST = { timeZone: "Asia/Kolkata" };
// Natal Moon at 100° = Cancer (sign 3), Pushya (nakshatra 7).
const MOON = 100;

Deno.test("Saturn moving into the 12th from the Moon starts Sade Sati", () => {
  const [top] = insightsFor(MOON, week({ ingresses: [ingress("Saturn", 1, 2)] }), IST);
  expect(top.kind === "saturn_transit" && top.title === "Sade Sati begins" && top.tone === "caution", top.title);
  expect(top.body.includes("Thursday") && top.body.includes("Gemini"), top.body);
});

Deno.test("Saturn leaving the 2nd from the Moon ends Sade Sati", () => {
  const [top] = insightsFor(MOON, week({ ingresses: [ingress("Saturn", 4, 5)] }), IST);
  expect(top.title === "Sade Sati comes to an end" && top.tone === "positive", top.title);
});

Deno.test("Jupiter into a favourable house reads as supportive", () => {
  const [top] = insightsFor(MOON, week({ ingresses: [ingress("Jupiter", 7, 8)] }), IST);
  expect(top.title === "Jupiter moves into your 6th house" && top.tone === "neutral", top.title);
  const [good] = insightsFor(MOON, week({ ingresses: [ingress("Jupiter", 10, 11)] }), IST);
  expect(good.title === "Jupiter moves into your 9th house" && good.tone === "positive", good.title);
});

Deno.test("Chandrashtama and the birth star are found and ordered below big transits", () => {
  const spans = [
    { sign: 9, from: START, to: new Date("2026-10-20T08:00:00Z") },
    { sign: 10, from: new Date("2026-10-20T08:00:00Z"), to: new Date("2026-10-22T14:30:00Z") },
    { sign: 11, from: new Date("2026-10-22T14:30:00Z"), to: END },
  ];
  const insights = insightsFor(
    MOON,
    week({
      ingresses: [ingress("Sun", 5, 6), ingress("Jupiter", 10, 11)],
      moonSpans: spans,
      moonNakshatraEntries: [{ nakshatra: 7, at: new Date("2026-10-24T03:00:00Z") }],
    }),
    IST,
  );
  expect(insights.map((item) => item.kind).join(",") === "jupiter_transit,chandrashtama,janma_nakshatra,sun_transit", insights.map((item) => item.kind).join(","));
  const chandrashtama = insights[1];
  expect(chandrashtama.body.includes("Tuesday 1:30pm") && chandrashtama.body.includes("Thursday 8:00pm"), chandrashtama.body);
  expect(insights[2].body.includes("Pushya"), insights[2].body);
});

Deno.test("a quiet week has no insights", () => {
  expect(insightsFor(MOON, week({}), IST).length === 0, "expected none");
});
