import { type AshtakootaResult, ashtakoota, matchReport, moonProfile } from "./astro/ashtakoota.ts";
import { birthInstant } from "./astro/ephemeris.ts";
import { KUNDLI_ENGINE_VERSION } from "./astro/kundli.ts";
import { resolveUtcOffset } from "./timezone.ts";
export const MATCH_SCORE_ENGINE_VERSION = `${KUNDLI_ENGINE_VERSION}:match-v2`;

export type ProfileBirthDetails = {
  id: string;
  gender: string | null;
  display_name?: string | null;
  date_of_birth: string | null;
  time_of_birth: string | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
};

type CompatibilityBreakdown = {
  label: string;
  value: number;
};

type CompatibilityResult = {
  id: string;
  generatedAt: string;
  overallScore: number;
  summary: string;
  yogas: string[];
  doshas: string[];
  breakdown: CompatibilityBreakdown[];
  raw: Record<string, unknown>;
};


function toMoonProfile(profile: ProfileBirthDetails) {
  if (
    !profile.date_of_birth ||
    !profile.time_of_birth ||
    profile.birth_latitude === null || !Number.isFinite(profile.birth_latitude) || Math.abs(profile.birth_latitude) > 90 ||
    profile.birth_longitude === null || !Number.isFinite(profile.birth_longitude) || Math.abs(profile.birth_longitude) > 180 ||
    !profile.birth_timezone
  ) {
    throw new Error(`${profile.display_name ?? "A profile"} is missing required birth details.`);
  }

  const utcOffset = resolveUtcOffset(profile.birth_timezone, profile.date_of_birth, profile.time_of_birth);
  return moonProfile({
    utc: birthInstant(profile.date_of_birth, profile.time_of_birth, utcOffset),
    latitude: profile.birth_latitude,
    longitude: profile.birth_longitude,
  });
}

function isMale(profile: ProfileBirthDetails) {
  return /^(male|man|boy)$/i.test(profile.gender?.trim() ?? "");
}

/** Use canonical order when genders do not assign distinct roles; either requester gets the same report. */
function assignRoles(viewer: ProfileBirthDetails, target: ProfileBirthDetails) {
  const first = viewer.id < target.id ? viewer : target;
  const second = first.id === viewer.id ? target : viewer;
  const groom = isMale(first) !== isMale(second) ? (isMale(first) ? first : second) : first;
  const bride = groom.id === viewer.id ? target : viewer;
  return { bride, groom };
}

function toCompatibility(result: AshtakootaResult): CompatibilityResult {
  const overallScore = Math.round((result.total / result.maxTotal) * 100);
  const summary = matchReport(result);
  const generatedAt = new Date().toISOString();

  return {
    id: `compat-${crypto.randomUUID()}`,
    generatedAt,
    overallScore,
    summary,
    yogas: [
      `Guna ${result.total}/${result.maxTotal}`,
      ...result.kootas.filter((koota) => koota.points === koota.maxPoints && koota.maxPoints >= 5).map((koota) => `Full ${koota.name}`),
    ],
    doshas: [
      ...(result.nadiDosha ? ["Nadi Dosha"] : []),
      ...(result.bhakootDosha ? ["Bhakoot Dosha"] : []),
      ...(result.manglik.mismatch ? ["Manglik"] : []),
    ],
    breakdown: result.kootas.map((koota) => ({
      label: `${koota.name} · ${koota.points}/${koota.maxPoints}`,
      value: Math.round((koota.points / koota.maxPoints) * 100),
    })),
    // The app reads conclusion.match_report as the narrative.
    raw: { engine: KUNDLI_ENGINE_VERSION, matchEngine: MATCH_SCORE_ENGINE_VERSION, ashtakoota: result, conclusion: { match_report: summary } },
  };
}

export function calculateCompatibility(profiles: ProfileBirthDetails[]) {
  if (profiles.length !== 2) throw new Error('Both profiles are required.');
  const { bride, groom } = assignRoles(profiles[0], profiles[1]);
  return toCompatibility(ashtakoota(toMoonProfile(bride), toMoonProfile(groom)));
}
