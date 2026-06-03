import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

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
  compatibility_report: CompatibilityResult;
  raw_report: Record<string, unknown>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name} secret.`);
  }
  return value;
}

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
    summary: matchReport,
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

function orderedPair(firstUserId: string, secondUserId: string) {
  return firstUserId < secondUserId
    ? { userAId: firstUserId, userBId: secondUserId }
    : { userAId: secondUserId, userBId: firstUserId };
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let supabaseServiceRoleKey: string;
  let astrologyUserId: string | undefined;
  let astrologyApiKey: string;

  try {
    supabaseUrl = requiredEnv("SUPABASE_URL");
    supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
    supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    astrologyUserId = Deno.env.get("ASTROLOGY_API_USER_ID");
    astrologyApiKey = requiredEnv("ASTROLOGY_API_KEY");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Missing Edge Function secret.";
    return jsonResponse({ error: message }, 500);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  let body: { targetProfileId?: string };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.targetProfileId) {
    return jsonResponse({ error: "Missing targetProfileId" }, 400);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const pair = orderedPair(user.id, body.targetProfileId);

  const { data: existingScore, error: existingScoreError } = await adminClient
    .from("match_scores")
    .select("compatibility_report, raw_report")
    .eq("user_a_id", pair.userAId)
    .eq("user_b_id", pair.userBId)
    .maybeSingle<MatchScoreRow>();

  if (existingScoreError) {
    return jsonResponse({ error: existingScoreError.message }, 500);
  }

  if (existingScore?.compatibility_report) {
    return jsonResponse({
      compatibility: compatibilityWithRawMatchReport(existingScore),
      cached: true,
    });
  }

  const { data: profiles, error: profileError } = await adminClient
    .from("profiles")
    .select(
      "id, gender, display_name, date_of_birth, time_of_birth, birth_latitude, birth_longitude, birth_timezone",
    )
    .in("id", [user.id, body.targetProfileId])
    .returns<ProfileBirthDetails[]>();

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 500);
  }

  const viewer = profiles?.find((profile) => profile.id === user.id);
  const target = profiles?.find(
    (profile) => profile.id === body.targetProfileId,
  );

  if (!viewer || !target) {
    return jsonResponse(
      { error: "Could not find both profiles for matchmaking." },
      404,
    );
  }

  let astrologyBody: Record<string, number>;

  try {
    astrologyBody = buildMatchBody(viewer, target);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Missing required birth details.";
    return jsonResponse({ error: message }, 400);
  }

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

  try {
    const astrologyResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(astrologyBody),
    });
    const responseText = await astrologyResponse.text();
    let rawResponse: Record<string, unknown>;

    try {
      rawResponse = JSON.parse(responseText);
    } catch {
      rawResponse = { responseText };
    }

    if (!astrologyResponse.ok) {
      return jsonResponse(
        {
          error: "Astrology match-making request failed",
          status: astrologyResponse.status,
          details: rawResponse,
        },
        502,
      );
    }

    const compatibility = parseMatchReport(rawResponse, target.id);
    const { error: scoreUpsertError } = await adminClient
      .from("match_scores")
      .upsert(
        {
          user_a_id: pair.userAId,
          user_b_id: pair.userBId,
          generated_by: user.id,
          compatibility_score: compatibility.overallScore,
          compatibility_report: compatibility,
          raw_report: rawResponse,
          generated_at: compatibility.generatedAt,
        },
        { onConflict: "user_a_id,user_b_id" },
      );

    if (scoreUpsertError) {
      return jsonResponse({ error: scoreUpsertError.message }, 500);
    }

    return jsonResponse({ compatibility });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Match-making request failed.";
    return jsonResponse({ error: message }, 500);
  }
});
