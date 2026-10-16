/**
 * Weekly chart insights (gochara): what the transiting planets do relative to each person's
 * natal Moon. The transits are the same for everyone, so they are scanned once per run
 * (`weekTransits`); each person's insights are then a cheap lookup (`insightsFor`).
 */
import { type Graha, siderealLongitude } from './ephemeris.ts';
import { NAKSHATRAS, nakshatraIndex, SIGNS, signIndex } from './vedic.ts';

export type InsightKind =
  | 'saturn_transit'
  | 'jupiter_transit'
  | 'rahu_transit'
  | 'chandrashtama'
  | 'janma_nakshatra'
  | 'sun_transit';

export type InsightTone = 'positive' | 'neutral' | 'caution';

export type Insight = {
  kind: InsightKind;
  tone: InsightTone;
  title: string;
  body: string;
  startsAt: Date;
  endsAt?: Date;
  /** Higher is more notable; the top insight is the one sent as a push. */
  priority: number;
};

export type Ingress = { graha: Graha; sign: number; previousSign: number; at: Date };
export type NakshatraEntry = { nakshatra: number; at: Date };
export type MoonSpan = { sign: number; from: Date; to: Date };

export type WeekTransits = {
  start: Date;
  end: Date;
  /** Sign changes of the slow movers and the Sun inside the window. */
  ingresses: Ingress[];
  /** Saturn's sign at the start of the window (for Sade Sati). */
  saturnSignAtStart: number;
  moonSpans: MoonSpan[];
  moonNakshatraEntries: NakshatraEntry[];
};

const HOUR = 3_600_000;
const MINUTE = 60_000;

const SCANNED: { graha: Graha; stepHours: number }[] = [
  { graha: 'Sun', stepHours: 6 },
  { graha: 'Jupiter', stepHours: 12 },
  { graha: 'Saturn', stepHours: 12 },
  { graha: 'Rahu', stepHours: 12 },
];

/** First instant in (from, to] where `bucket` differs from its value at `from`, to the minute. */
function bisectChange(from: Date, to: Date, bucket: (at: Date) => number) {
  const initial = bucket(from);
  let low = from.getTime();
  let high = to.getTime();
  while (high - low > MINUTE) {
    const mid = Math.floor((low + high) / 2);
    if (bucket(new Date(mid)) === initial) low = mid;
    else high = mid;
  }
  return new Date(high);
}

/** Every change of `bucket` over the window, sampled every `stepHours` and refined by bisection. */
function scanChanges(start: Date, end: Date, stepHours: number, bucket: (at: Date) => number) {
  const changes: { at: Date; from: number; to: number }[] = [];
  let previousAt = start;
  let previous = bucket(start);
  for (let time = start.getTime() + stepHours * HOUR; ; time += stepHours * HOUR) {
    const at = new Date(Math.min(time, end.getTime()));
    const current = bucket(at);
    if (current !== previous) {
      changes.push({ at: bisectChange(previousAt, at, bucket), from: previous, to: current });
    }
    previousAt = at;
    previous = current;
    if (at.getTime() >= end.getTime()) break;
  }
  return changes;
}

export function weekTransits(start: Date, days = 7): WeekTransits {
  const end = new Date(start.getTime() + days * 24 * HOUR);

  const ingresses = SCANNED.flatMap(({ graha, stepHours }) =>
    scanChanges(start, end, stepHours, (at) => signIndex(siderealLongitude(graha, at))).map((change) => ({
      graha,
      sign: change.to,
      previousSign: change.from,
      at: change.at,
    }))
  ).sort((a, b) => a.at.getTime() - b.at.getTime());

  const moonSign = (at: Date) => signIndex(siderealLongitude('Moon', at));
  const moonSpans: MoonSpan[] = [];
  let spanStart = start;
  let spanSign = moonSign(start);
  for (const change of scanChanges(start, end, 1, moonSign)) {
    moonSpans.push({ sign: spanSign, from: spanStart, to: change.at });
    spanStart = change.at;
    spanSign = change.to;
  }
  moonSpans.push({ sign: spanSign, from: spanStart, to: end });

  const moonNakshatraEntries = scanChanges(start, end, 1, (at) => nakshatraIndex(siderealLongitude('Moon', at))).map(
    (change) => ({ nakshatra: change.to, at: change.at })
  );

  return {
    start,
    end,
    ingresses,
    saturnSignAtStart: signIndex(siderealLongitude('Saturn', start)),
    moonSpans,
    moonNakshatraEntries,
  };
}

/** What each house (counted from the natal Moon) is traditionally about. */
const HOUSE_THEMES = [
  'yourself and your wellbeing',
  'family and finances',
  'courage and communication',
  'home and peace of mind',
  'romance, creativity and learning',
  'work and daily routines',
  'partnership and marriage',
  'change and shared resources',
  'luck, faith and travel',
  'career and reputation',
  'gains and friendships',
  'rest, retreat and spending',
];

// Houses from the Moon where each transit is traditionally favourable (gochara).
const FAVOURABLE_HOUSES: Partial<Record<Graha, number[]>> = {
  Sun: [3, 6, 10, 11],
  Jupiter: [2, 5, 7, 9, 11],
  Saturn: [3, 6, 11],
  Rahu: [3, 6, 11],
};

function ordinal(value: number) {
  const suffix = value % 10 === 1 && value !== 11 ? 'st' : value % 10 === 2 && value !== 12 ? 'nd' : value % 10 === 3 && value !== 13 ? 'rd' : 'th';
  return `${value}${suffix}`;
}

function houseFromMoon(natalMoonSign: number, sign: number) {
  return ((sign - natalMoonSign + 12) % 12) + 1;
}

export type InsightFormatOptions = { timeZone: string };

function formatter(timeZone: string) {
  const day = new Intl.DateTimeFormat('en-IN', { timeZone, weekday: 'long' });
  const time = new Intl.DateTimeFormat('en-IN', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
  return {
    day: (at: Date) => day.format(at),
    dayAndTime: (at: Date) => `${day.format(at)} ${time.format(at).toLowerCase().replace(/\s/g, '')}`,
  };
}

/** Sade Sati is Saturn's transit through the 12th, 1st and 2nd houses from the natal Moon. */
function sadeSatiPhase(house: number) {
  return house === 12 ? 1 : house === 1 ? 2 : house === 2 ? 3 : 0;
}

function saturnInsight(ingress: Ingress, natalMoonSign: number, when: string): Insight {
  const house = houseFromMoon(natalMoonSign, ingress.sign);
  const phase = sadeSatiPhase(house);
  const previousPhase = sadeSatiPhase(houseFromMoon(natalMoonSign, ingress.previousSign));
  const base = { kind: 'saturn_transit' as const, startsAt: ingress.at, priority: 100 };
  const sign = SIGNS[ingress.sign];

  if (phase !== previousPhase && (phase > 0 || previousPhase > 0)) {
    if (phase === 0) {
      return {
        ...base,
        tone: 'positive',
        title: 'Sade Sati comes to an end',
        body: `On ${when}, Saturn moves into ${sign} and your seven-and-a-half-year Sade Sati closes. Traditionally a time when long efforts start to pay off.`,
      };
    }
    const phaseText = ['', 'begins', 'enters its peak', 'enters its final phase'][phase];
    return {
      ...base,
      tone: 'caution',
      title: `Sade Sati ${phaseText}`,
      body: `On ${when}, Saturn moves into ${sign}, your ${ordinal(house)} house from the Moon. Tradition treats this as a stretch for patience, discipline and steady work; it rewards effort more than shortcuts.`,
    };
  }

  const favourable = FAVOURABLE_HOUSES.Saturn!.includes(house);
  return {
    ...base,
    tone: favourable ? 'positive' : 'neutral',
    title: `Saturn moves into your ${ordinal(house)} house`,
    body: favourable
      ? `On ${when}, Saturn enters ${sign}. Over the next two and a half years, steady effort in ${HOUSE_THEMES[house - 1]} is traditionally well rewarded.`
      : `On ${when}, Saturn enters ${sign}. For the next two and a half years it asks for patience and structure around ${HOUSE_THEMES[house - 1]}.`,
  };
}

function transitInsight(ingress: Ingress, natalMoonSign: number, when: string): Insight {
  const house = houseFromMoon(natalMoonSign, ingress.sign);
  const favourable = FAVOURABLE_HOUSES[ingress.graha]?.includes(house) ?? false;
  const theme = HOUSE_THEMES[house - 1];
  const sign = SIGNS[ingress.sign];

  if (ingress.graha === 'Jupiter') {
    return {
      kind: 'jupiter_transit',
      tone: favourable ? 'positive' : 'neutral',
      title: `Jupiter moves into your ${ordinal(house)} house`,
      body: favourable
        ? `On ${when}, Jupiter enters ${sign}, bringing a year that traditionally supports ${theme}.`
        : `On ${when}, Jupiter enters ${sign}. Over the coming year, go steadily with ${theme}.`,
      startsAt: ingress.at,
      priority: 90,
    };
  }
  if (ingress.graha === 'Rahu') {
    return {
      kind: 'rahu_transit',
      tone: favourable ? 'positive' : 'neutral',
      title: `Rahu and Ketu change signs`,
      body: favourable
        ? `On ${when}, Rahu moves into ${sign}, your ${ordinal(house)} house from the Moon. For the next year and a half, ambition around ${theme} tends to find an outlet.`
        : `On ${when}, Rahu moves into ${sign}, your ${ordinal(house)} house from the Moon. For the next year and a half, keep a clear head around ${theme}.`,
      startsAt: ingress.at,
      priority: 80,
    };
  }
  return {
    kind: 'sun_transit',
    tone: favourable ? 'positive' : 'neutral',
    title: `The Sun enters ${sign}`,
    body: favourable
      ? `From ${when}, the Sun lights up your ${ordinal(house)} house from the Moon for a month: a good time for ${theme}.`
      : `From ${when}, the Sun moves through your ${ordinal(house)} house from the Moon for a month, putting ${theme} in focus.`,
    startsAt: ingress.at,
    priority: 30,
  };
}

/** This week's insights for one person, most notable first. */
export function insightsFor(natalMoonLongitude: number, week: WeekTransits, { timeZone }: InsightFormatOptions): Insight[] {
  const natalMoonSign = signIndex(natalMoonLongitude);
  const natalNakshatra = nakshatraIndex(natalMoonLongitude);
  const format = formatter(timeZone);
  const insights: Insight[] = [];

  for (const ingress of week.ingresses) {
    const when = format.day(ingress.at);
    insights.push(ingress.graha === 'Saturn' ? saturnInsight(ingress, natalMoonSign, when) : transitInsight(ingress, natalMoonSign, when));
  }

  // Chandrashtama: the Moon in the 8th sign from the natal Moon, about two and a quarter days a month.
  const eighth = (natalMoonSign + 7) % 12;
  const span = week.moonSpans.find((entry) => entry.sign === eighth);
  if (span) {
    const startsBeforeWeek = span.from.getTime() <= week.start.getTime();
    const endsAfterWeek = span.to.getTime() >= week.end.getTime();
    const from = startsBeforeWeek ? 'now' : format.dayAndTime(span.from);
    const until = endsAfterWeek ? 'the end of the week' : format.dayAndTime(span.to);
    insights.push({
      kind: 'chandrashtama',
      tone: 'caution',
      title: 'Chandrashtama this week',
      body: `From ${from} until ${until}, the Moon passes through your 8th house. Tradition suggests saving big decisions and new beginnings for another day.`,
      startsAt: span.from,
      endsAt: span.to,
      priority: 50,
    });
  }

  const birthStar = week.moonNakshatraEntries.find((entry) => entry.nakshatra === natalNakshatra);
  if (birthStar) {
    insights.push({
      kind: 'janma_nakshatra',
      tone: 'neutral',
      title: 'The Moon returns to your birth star',
      body: `From ${format.dayAndTime(birthStar.at)}, the Moon passes through ${NAKSHATRAS[natalNakshatra]}, your birth nakshatra: a day to slow down, reflect and set intentions.`,
      startsAt: birthStar.at,
      priority: 45,
    });
  }

  return insights.sort((a, b) => b.priority - a.priority || a.startsAt.getTime() - b.startsAt.getTime());
}
