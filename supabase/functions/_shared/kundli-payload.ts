import { birthInstant } from './astro/ephemeris.ts';
import { buildKundli, KUNDLI_ENGINE_VERSION } from './astro/kundli.ts';
import { resolveUtcOffset } from './timezone.ts';

export type KundliBirthInputs = {
  date_of_birth: string;
  time_of_birth: string;
  birth_latitude: number;
  birth_longitude: number;
  birth_timezone: string;
};

/** Shared by ordinary generation and the offline, administrative correction preparer. */
export function birthDetailsSignature(profile: KundliBirthInputs) {
  return [KUNDLI_ENGINE_VERSION, profile.date_of_birth, profile.time_of_birth,
    profile.birth_latitude, profile.birth_longitude, profile.birth_timezone].join('|');
}

export function buildKundliPayload(profile: KundliBirthInputs, generatedAt = new Date()) {
  const offset = resolveUtcOffset(profile.birth_timezone, profile.date_of_birth, profile.time_of_birth);
  const kundli = buildKundli({ utc: birthInstant(profile.date_of_birth, profile.time_of_birth, offset),
    latitude: profile.birth_latitude, longitude: profile.birth_longitude });
  return {
    raw_response: kundli.details,
    parsed_summary: { ...kundli.summary, generatedAt: generatedAt.toISOString() },
    chart_raw_responses: kundli.positions,
    chart_houses: kundli.chartHouses,
    input_signature: birthDetailsSignature(profile),
    generated_at: generatedAt.toISOString(),
  };
}
