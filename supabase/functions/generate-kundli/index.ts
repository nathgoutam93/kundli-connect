import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

type ProfileBirthDetails = {
  id: string;
  date_of_birth: string | null;
  time_of_birth: string | null;
  birth_place: string | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
};

type ChartImage = {
  chartId: string;
  path: string;
  response: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  const [year, month, day] = value.split('-').map(Number);
  return { day, month, year };
}

function splitTime(value: string) {
  const [hour = 0, min = 0] = value.split(':').map(Number);
  return { hour, min };
}

function asString(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return String(value);
}

function asStringArray(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item)).filter(Boolean);
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

function pickSummary(rawResponse: Record<string, unknown>) {
  const raw = rawResponse as Record<string, unknown>;
  const yogas = asStringArray(raw.yogas ?? raw.yoga);
  const doshas = asStringArray(raw.doshas ?? raw.dosha);

  return {
    generatedAt: new Date().toISOString(),
    ascendant: firstString(raw, ['ascendant', 'ascendant_sign', 'lagna']),
    moonSign: firstString(raw, ['moon_sign', 'Moon Sign', 'rasi', 'sign']),
    sunSign: firstString(raw, ['sun_sign', 'Sun Sign']),
    nakshatra: firstString(raw, ['nakshatra', 'birth_nakshatra', 'Naksahtra', 'Nakshatra']),
    gana: firstString(raw, ['gana', 'Gan']),
    nadi: firstString(raw, ['nadi', 'Nadi']),
    manglik: firstString(raw, ['manglik', 'manglik_status']),
    yogas: yogas.length ? yogas : asStringArray(raw.Yog),
    doshas,
    overview:
      firstString(raw, ['summary', 'prediction', 'report']) ??
      'Your kundli has been generated. Detailed interpretations will be expanded as the astrology parser grows.',
  };
}

function getChartIds() {
  const configuredIds = Deno.env.get('ASTROLOGY_CHART_IDS')
    ?.split(',')
    .map((chartId) => chartId.trim().toUpperCase())
    .filter(Boolean);

  return configuredIds?.length ? configuredIds : ['D1', 'D9'];
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function extractDataUrl(value: string) {
  const match = value.match(/^data:(?<contentType>[^;]+);base64,(?<base64>.+)$/);

  if (!match?.groups) {
    return null;
  }

  const contentType = match.groups.contentType;
  const extension = contentType.includes('svg') ? 'svg' : 'png';

  return {
    bytes: decodeBase64(match.groups.base64),
    contentType,
    extension,
  };
}

function extractInlineImage(value: string) {
  const dataUrl = extractDataUrl(value);

  if (dataUrl) {
    return dataUrl;
  }

  if (value.trimStart().startsWith('<svg')) {
    return {
      bytes: new TextEncoder().encode(value),
      contentType: 'image/svg+xml',
      extension: 'svg',
    };
  }

  return {
    bytes: decodeBase64(value),
    contentType: 'image/png',
    extension: 'png',
  };
}

function firstImageString(rawResponse: Record<string, unknown>) {
  for (const key of ['png', 'image', 'chart', 'chart_image', 'base64', 'svg']) {
    const value = rawResponse[key];

    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  const responseText = rawResponse.responseText;

  if (typeof responseText === 'string') {
    const svgMatch = responseText.match(/svg\s*:\s*["']?(?<svg><svg[\s\S]*<\/svg>)["']?\s*}?$/);

    if (svgMatch?.groups?.svg) {
      return svgMatch.groups.svg;
    }

    if (responseText.trimStart().startsWith('<svg')) {
      return responseText;
    }
  }

  return undefined;
}

async function imageFromChartResponse(rawResponse: Record<string, unknown>, authHeader: string) {
  const imageUrl = firstString(rawResponse, ['chart_url', 'url', 'image_url']);

  if (imageUrl) {
    const responseInit = imageUrl.includes('astrologyapi.com') ? { headers: { Authorization: authHeader } } : undefined;
    const response = await fetch(imageUrl, responseInit);

    if (!response.ok) {
      throw new Error(`Chart image URL fetch failed with status ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') ?? 'image/png';
    const extension = contentType.includes('svg') ? 'svg' : 'png';

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType,
      extension,
    };
  }

  const inlineImage = firstImageString(rawResponse);

  if (!inlineImage) {
    throw new Error('Chart image response did not include image data.');
  }

  return extractInlineImage(inlineImage);
}

async function generateChartImages(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  astrologyBody: Record<string, number | string>,
  authHeader: string
) {
  const chartEndpointBase =
    Deno.env.get('ASTROLOGY_CHART_IMAGE_ENDPOINT_BASE') ?? 'https://json.astrologyapi.com/v1/horo_chart_image';
  const chartIds = getChartIds();
  const chartImages: ChartImage[] = [];

  for (const chartId of chartIds) {
    const chartResponse = await fetch(`${chartEndpointBase}/${chartId}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        ...astrologyBody,
        chartType: Deno.env.get('ASTROLOGY_CHART_TYPE') ?? 'north',
        image_type: 'png',
      }),
    });

    const contentType = chartResponse.headers.get('content-type') ?? '';
    let rawResponse: Record<string, unknown>;

    if (contentType.includes('image/')) {
      rawResponse = { contentType };
      const extension = contentType.includes('svg') ? 'svg' : 'png';
      const storagePath = `${userId}/${chartId.toLowerCase()}-${Date.now()}.${extension}`;
      const { error } = await adminClient.storage.from('kundli-charts').upload(
        storagePath,
        new Uint8Array(await chartResponse.arrayBuffer()),
        {
          contentType,
          upsert: true,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      chartImages.push({ chartId, path: storagePath, response: rawResponse });
      continue;
    }

    const responseText = await chartResponse.text();

    try {
      rawResponse = JSON.parse(responseText);
    } catch {
      rawResponse = { responseText };
    }

    if (!chartResponse.ok) {
      throw new Error(`Astrology chart ${chartId} request failed with status ${chartResponse.status}.`);
    }

    const image = await imageFromChartResponse(rawResponse, authHeader);
    const storagePath = `${userId}/${chartId.toLowerCase()}-${Date.now()}.${image.extension}`;
    const { error } = await adminClient.storage.from('kundli-charts').upload(storagePath, image.bytes, {
      contentType: image.contentType,
      upsert: true,
    });

    if (error) {
      throw new Error(error.message);
    }

    chartImages.push({ chartId, path: storagePath, response: rawResponse });
  }

  return chartImages;
}

async function updateKundliStatus(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  status: 'pending' | 'generated' | 'failed'
) {
  await adminClient
    .from('profiles')
    .update({
      kundli_generation_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let supabaseServiceRoleKey: string;
  let astrologyUserId: string;
  let astrologyApiKey: string;

  try {
    supabaseUrl = requiredEnv('SUPABASE_URL');
    supabaseAnonKey = requiredEnv('SUPABASE_ANON_KEY');
    supabaseServiceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    astrologyUserId = requiredEnv('ASTROLOGY_API_USER_ID');
    astrologyApiKey = requiredEnv('ASTROLOGY_API_KEY');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Missing Edge Function secret.';
    return jsonResponse({ error: message }, 500);
  }

  const astrologyEndpoint =
    Deno.env.get('ASTROLOGY_API_ENDPOINT') ?? 'https://json.astrologyapi.com/v1/astro_details';
  const astrologyAuthHeader = `Basic ${btoa(`${astrologyUserId}:${astrologyApiKey}`)}`;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
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
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  await updateKundliStatus(adminClient, user.id, 'pending');

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, date_of_birth, time_of_birth, birth_place, birth_latitude, birth_longitude, birth_timezone')
    .eq('id', user.id)
    .single<ProfileBirthDetails>();

  if (profileError || !profile) {
    await updateKundliStatus(adminClient, user.id, 'failed');
    return jsonResponse({ error: 'Birth details profile not found' }, 404);
  }

  if (
    !profile.date_of_birth ||
    !profile.time_of_birth ||
    !profile.birth_place ||
    profile.birth_latitude === null ||
    profile.birth_longitude === null ||
    !profile.birth_timezone
  ) {
    await updateKundliStatus(adminClient, user.id, 'failed');
    return jsonResponse({ error: 'Missing required birth details' }, 400);
  }

  const { day, month, year } = splitDate(profile.date_of_birth);
  const { hour, min } = splitTime(profile.time_of_birth);
  const astrologyBody = {
    day,
    month,
    year,
    hour,
    min,
    lat: profile.birth_latitude,
    lon: profile.birth_longitude,
    tzone: Number(profile.birth_timezone),
  };

  try {
    const astrologyResponse = await fetch(astrologyEndpoint, {
      method: 'POST',
      headers: {
        Authorization: astrologyAuthHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
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
      await updateKundliStatus(adminClient, user.id, 'failed');
      return jsonResponse(
        {
          error: 'Astrology API request failed',
          status: astrologyResponse.status,
          details: rawResponse,
        },
        502
      );
    }

    const parsedSummary = pickSummary(rawResponse);
    const chartImages = await generateChartImages(adminClient, user.id, astrologyBody, astrologyAuthHeader);
    const chartImagePaths = Object.fromEntries(chartImages.map((chart) => [chart.chartId, chart.path]));
    const chartRawResponses = Object.fromEntries(chartImages.map((chart) => [chart.chartId, chart.response]));

    const { error: upsertError } = await adminClient.from('kundlis').upsert(
      {
        user_id: user.id,
        raw_response: rawResponse,
        parsed_summary: parsedSummary,
        chart_image_paths: chartImagePaths,
        chart_raw_responses: chartRawResponses,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      await updateKundliStatus(adminClient, user.id, 'failed');
      return jsonResponse({ error: upsertError.message }, 500);
    }

    await updateKundliStatus(adminClient, user.id, 'generated');

    return jsonResponse({
      status: 'generated',
      parsed_summary: parsedSummary,
      chart_image_paths: chartImagePaths,
    });
  } catch (error) {
    await updateKundliStatus(adminClient, user.id, 'failed');
    const message = error instanceof Error ? error.message : 'Kundli generation failed';
    return jsonResponse({ error: message }, 500);
  }
});
