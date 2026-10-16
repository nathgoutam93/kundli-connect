import { type AshtakootaResult, ashtakoota, matchReport, moonProfile } from "../_shared/astro/ashtakoota.ts";
import { birthInstant } from "../_shared/astro/ephemeris.ts";
import { KUNDLI_ENGINE_VERSION } from "../_shared/astro/kundli.ts";
import { assertCanInteract, refundCredit, requireUuid, spendCredit } from "../_shared/guards.ts";
import { HttpError, jsonResponse, readJson, servePost } from "../_shared/http.ts";
import { getRequestContext, orderedPair } from "../_shared/supabase.ts";
import { resolveUtcOffset } from "../_shared/timezone.ts";

type ProfileBirthDetails = {
  id: string;
  gender: string | null;
  display_name: string | null;
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

type MatchScoreRow = {
  id: string;
  compatibility_report: CompatibilityResult;
};

function toMoonProfile(profile: ProfileBirthDetails) {
  if (
    !profile.date_of_birth ||
    !profile.time_of_birth ||
    profile.birth_latitude === null ||
    profile.birth_longitude === null ||
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

/** Guna Milan is defined for a bride and groom; for other pairs the viewer takes the groom's role. */
function assignRoles(viewer: ProfileBirthDetails, target: ProfileBirthDetails) {
  const groom = isMale(target) && !isMale(viewer) ? target : viewer;
  const bride = groom.id === viewer.id ? target : viewer;
  return { bride, groom };
}

function toCompatibility(result: AshtakootaResult, profileId: string): CompatibilityResult {
  const overallScore = Math.round((result.total / result.maxTotal) * 100);
  const summary = matchReport(result);
  const generatedAt = new Date().toISOString();

  return {
    id: `compat-${profileId}-${Date.now()}`,
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
    raw: { engine: KUNDLI_ENGINE_VERSION, ashtakoota: result, conclusion: { match_report: summary } },
  };
}

const profileColumns =
  "id, gender, display_name, date_of_birth, time_of_birth, birth_latitude, birth_longitude, birth_timezone";

servePost(async (request) => {
  const body = await readJson<{ targetProfileId?: string }>(request);
  const targetProfileId = requireUuid(body.targetProfileId, "targetProfileId");
  const { userId, adminClient } = await getRequestContext(request);

  const pair = orderedPair(userId, targetProfileId);
  const [, existingScoreResult, profilesResult] = await Promise.all([
    assertCanInteract(adminClient, userId, targetProfileId),
    adminClient
      .from("match_scores")
      .select("id, compatibility_report")
      .eq("user_a_id", pair.userAId)
      .eq("user_b_id", pair.userBId)
      .maybeSingle<MatchScoreRow>(),
    adminClient
      .from("profiles")
      .select(profileColumns)
      .in("id", [userId, targetProfileId])
      .returns<ProfileBirthDetails[]>(),
  ]);

  if (existingScoreResult.error) throw existingScoreResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const existingScore = existingScoreResult.data;
  if (existingScore?.compatibility_report) {
    return jsonResponse({
      matchScoreId: existingScore.id,
      compatibility: existingScore.compatibility_report,
      cached: true,
    });
  }

  const viewer = profilesResult.data?.find((profile) => profile.id === userId);
  const target = profilesResult.data?.find((profile) => profile.id === targetProfileId);
  if (!viewer || !target) {
    throw new HttpError(404, "Could not find both profiles for matchmaking.");
  }

  // Calculate before charging, so an incomplete profile never costs a credit.
  let compatibility: CompatibilityResult;
  try {
    const { bride, groom } = assignRoles(viewer, target);
    compatibility = toCompatibility(ashtakoota(toMoonProfile(bride), toMoonProfile(groom)), target.id);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Missing required birth details.");
  }

  const { transactionId } = await spendCredit(
    adminClient,
    userId,
    `Generated compatibility with ${targetProfileId}`,
  );

  const { data: matchScore, error: scoreUpsertError } = await adminClient
    .from("match_scores")
    .upsert(
      {
        user_a_id: pair.userAId,
        user_b_id: pair.userBId,
        generated_by: userId,
        compatibility_score: compatibility.overallScore,
        compatibility_report: compatibility,
        raw_report: compatibility.raw,
        generated_at: compatibility.generatedAt,
      },
      { onConflict: "user_a_id,user_b_id" },
    )
    .select("id")
    .single<{ id: string }>();

  if (scoreUpsertError) {
    await refundCredit(adminClient, transactionId);
    throw scoreUpsertError;
  }

  return jsonResponse({ matchScoreId: matchScore.id, compatibility });
});
