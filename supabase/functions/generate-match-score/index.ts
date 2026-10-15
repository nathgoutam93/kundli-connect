import { assertCanInteract, refundCredit, requireUuid, spendCredit } from "../_shared/guards.ts";
import { HttpError, jsonResponse, readJson, requiredEnv, servePost } from "../_shared/http.ts";
import { getRequestContext, orderedPair } from "../_shared/supabase.ts";

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
  raw_report: Record<string, unknown>;
};

function splitDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { day, month, year };
}

function splitTime(value: string) {
  const [hour = 0, min = 0] = value.split(":").map(Number);
  return { hour, min };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asString(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  return String(value);
}

function firstString(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asString(raw[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function boundedPercent(value: number) {
  return Math.max(0, Math.min(Math.round(value), 100));
}

function kootaPercent(koota: Record<string, unknown> | null) {
  if (!koota) {
    return undefined;
  }

  const received = asNumber(koota.received_points);
  const total = asNumber(koota.total_points);

  if (received === undefined || total === undefined || total <= 0) {
    return undefined;
  }

  return boundedPercent((received / total) * 100);
}

function kootaPoints(koota: Record<string, unknown> | null) {
  if (!koota) {
    return { received: 0, total: 0 };
  }

  return {
    received: asNumber(koota.received_points) ?? 0,
    total: asNumber(koota.total_points) ?? 0,
  };
}

function doshaLabel(label: string, section: unknown) {
  const raw = asRecord(section);
  if (!raw) {
    return undefined;
  }

  const present = firstString(raw, [
    "present",
    "is_present",
    "has_dosha",
    "status",
  ]);
  const report = firstString(raw, ["report", "conclusion", "description"]);

  if (present && /true|yes|present|high|bad|negative/i.test(present)) {
    return label;
  }

  if (report && !/not|no dosha|absent|free/i.test(report)) {
    return label;
  }

  return undefined;
}

function matchReportFromRaw(rawResponse: Record<string, unknown>) {
  const conclusion = asRecord(rawResponse.conclusion);

  return firstString(conclusion ?? {}, ["match_report"]);
}

function parseMatchReport(
  rawResponse: Record<string, unknown>,
  profileId: string,
): CompatibilityResult {
  const ashtakoota = asRecord(rawResponse.ashtakoota) ?? {};
  const kootaNames = [
    "varna",
    "vashya",
    "tara",
    "yoni",
    "maitri",
    "gan",
    "bhakut",
    "nadi",
  ];
  const kootas = kootaNames.map((name) => asRecord(ashtakoota[name]));
  const points = kootas.map(kootaPoints);
  const received = points.reduce((total, point) => total + point.received, 0);
  const possible =
    points.reduce((total, point) => total + point.total, 0) || 36;
  const total = asRecord(ashtakoota.total);
  const totalReceived = asNumber(total?.received_points) ?? received;
  const totalPossible = asNumber(total?.total_points) ?? possible;
  const overallScore = boundedPercent((totalReceived / totalPossible) * 100);
  const conclusion = asRecord(rawResponse.conclusion);
  const matchReport = matchReportFromRaw(rawResponse);
  const manglik = doshaLabel("Manglik", rawResponse.manglik);
  const rajju = doshaLabel("Rajju", rawResponse.rajju);
  const vedha = doshaLabel("Vedha", rawResponse.vedha);
  const nadiPercent = kootaPercent(asRecord(ashtakoota.nadi));
  const bhakutPercent = kootaPercent(asRecord(ashtakoota.bhakut));
  const breakdown = [
    { label: "Guna Milan", value: overallScore },
    { label: "Nadi Compatibility", value: nadiPercent ?? overallScore },
    { label: "Bhakoot/Rashi Matching", value: bhakutPercent ?? overallScore },
    { label: "Overall Match", value: overallScore },
  ];

  return {
    id: `compat-${profileId}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    overallScore,
    summary:
      matchReport ??
      firstString(conclusion ?? {}, ["report", "description"]) ??
      `Guna Milan score ${totalReceived.toFixed(1)} out of ${totalPossible.toFixed(1)}.`,
    yogas: [
      `Guna ${totalReceived.toFixed(1)}/${totalPossible.toFixed(1)}`,
      ...(overallScore >= 70 ? ["Strong Ashtakoota"] : ["Moderate Ashtakoota"]),
    ],
    doshas: [manglik, rajju, vedha].filter((value): value is string =>
      Boolean(value),
    ),
    breakdown,
    raw: rawResponse,
  };
}

function compatibilityWithRawMatchReport(row: MatchScoreRow) {
  const matchReport = matchReportFromRaw(row.raw_report ?? {});

  if (!matchReport) {
    return row.compatibility_report;
  }

  return {
    ...row.compatibility_report,
    summary: matchReport,
  };
}

function toAstrologyBirthBody(profile: ProfileBirthDetails, prefix: "m" | "f") {
  if (
    !profile.date_of_birth ||
    !profile.time_of_birth ||
    profile.birth_latitude === null ||
    profile.birth_longitude === null ||
    !profile.birth_timezone
  ) {
    throw new Error(
      `${profile.display_name ?? "A profile"} is missing required birth details.`,
    );
  }

  const { day, month, year } = splitDate(profile.date_of_birth);
  const { hour, min } = splitTime(profile.time_of_birth);

  return {
    [`${prefix}_day`]: day,
    [`${prefix}_month`]: month,
    [`${prefix}_year`]: year,
    [`${prefix}_hour`]: hour,
    [`${prefix}_min`]: min,
    [`${prefix}_lat`]: profile.birth_latitude,
    [`${prefix}_lon`]: profile.birth_longitude,
    [`${prefix}_tzone`]: Number(profile.birth_timezone),
  };
}

function isMale(profile: ProfileBirthDetails) {
  return /male|man|boy/i.test(profile.gender ?? "");
}

function buildMatchBody(
  viewer: ProfileBirthDetails,
  target: ProfileBirthDetails,
) {
  const male = isMale(target) && !isMale(viewer) ? target : viewer;
  const female = male.id === viewer.id ? target : viewer;

  return {
    ...toAstrologyBirthBody(male, "m"),
    ...toAstrologyBirthBody(female, "f"),
  };
}

const profileColumns =
  "id, gender, display_name, date_of_birth, time_of_birth, birth_latitude, birth_longitude, birth_timezone";

servePost(async (request) => {
  const body = await readJson<{ targetProfileId?: string }>(request);
  const targetProfileId = requireUuid(body.targetProfileId, "targetProfileId");

  const astrologyApiKey = requiredEnv("ASTROLOGY_API_KEY");
  const astrologyUserId = Deno.env.get("ASTROLOGY_API_USER_ID");
  const { userId, adminClient } = await getRequestContext(request);

  const pair = orderedPair(userId, targetProfileId);
  const [, existingScoreResult, profilesResult] = await Promise.all([
    assertCanInteract(adminClient, userId, targetProfileId),
    adminClient
      .from("match_scores")
      .select("id, compatibility_report, raw_report")
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
      compatibility: compatibilityWithRawMatchReport(existingScore),
      cached: true,
    });
  }

  const viewer = profilesResult.data?.find((profile) => profile.id === userId);
  const target = profilesResult.data?.find((profile) => profile.id === targetProfileId);
  if (!viewer || !target) {
    throw new HttpError(404, "Could not find both profiles for matchmaking.");
  }

  // Validate birth details before charging, so an incomplete profile never costs a credit.
  let astrologyBody: Record<string, number>;
  try {
    astrologyBody = buildMatchBody(viewer, target);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Missing required birth details.");
  }

  const { transactionId } = await spendCredit(
    adminClient,
    userId,
    `Generated compatibility with ${targetProfileId}`,
  );

  const endpoint =
    Deno.env.get("ASTROLOGY_MATCH_API_ENDPOINT") ??
    "https://json.astrologyapi.com/v1/match_making_detailed_report";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-astrologyapi-key": astrologyApiKey,
  };
  if (astrologyUserId) {
    headers.Authorization = `Basic ${btoa(`${astrologyUserId}:${astrologyApiKey}`)}`;
  }

  let rawResponse: Record<string, unknown>;
  try {
    const astrologyResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(astrologyBody),
    });
    const responseText = await astrologyResponse.text();
    try {
      rawResponse = JSON.parse(responseText);
    } catch {
      rawResponse = { responseText };
    }

    if (!astrologyResponse.ok) {
      throw new HttpError(502, "Astrology match-making request failed", {
        status: astrologyResponse.status,
        details: rawResponse,
      });
    }
  } catch (error) {
    await refundCredit(adminClient, transactionId);
    throw error instanceof HttpError ? error : new HttpError(502, "Astrology match-making request failed");
  }

  const compatibility = parseMatchReport(rawResponse, target.id);
  const { data: matchScore, error: scoreUpsertError } = await adminClient
    .from("match_scores")
    .upsert(
      {
        user_a_id: pair.userAId,
        user_b_id: pair.userBId,
        generated_by: userId,
        compatibility_score: compatibility.overallScore,
        compatibility_report: compatibility,
        raw_report: rawResponse,
        generated_at: compatibility.generatedAt,
      },
      { onConflict: "user_a_id,user_b_id" },
    )
    .select("id")
    .single<{ id: string }>();

  if (scoreUpsertError) throw scoreUpsertError;

  return jsonResponse({ matchScoreId: matchScore.id, compatibility });
});

