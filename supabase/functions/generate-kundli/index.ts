import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.106.2';

import { birthInstant } from '../_shared/astro/ephemeris.ts';
import { buildKundli, KUNDLI_ENGINE_VERSION } from '../_shared/astro/kundli.ts';
import { HttpError, jsonResponse, servePost } from '../_shared/http.ts';
import type { ChartHouse } from '../_shared/astro/types.ts';
import { getRequestContext } from '../_shared/supabase.ts';
import { resolveUtcOffset } from '../_shared/timezone.ts';

type ProfileBirthDetails = {
  id: string;
  date_of_birth: string | null;
  time_of_birth: string | null;
  birth_place: string | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
};

async function updateKundliStatus(
  adminClient: SupabaseClient,
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

/** Changes whenever the birth details or the calculation change, so stale Kundlis are rebuilt. */
function birthDetailsSignature(profile: ProfileBirthDetails) {
  return [
    KUNDLI_ENGINE_VERSION,
    profile.date_of_birth,
    profile.time_of_birth,
    profile.birth_latitude,
    profile.birth_longitude,
    profile.birth_timezone,
  ].join('|');
}

const profileColumns = 'id, date_of_birth, time_of_birth, birth_place, birth_latitude, birth_longitude, birth_timezone';

servePost(async (request) => {
  const { userId, adminClient } = await getRequestContext(request);

  const [profileResult, existingResult] = await Promise.all([
    adminClient.from('profiles').select(profileColumns).eq('id', userId).single<ProfileBirthDetails>(),
    adminClient
      .from('kundlis')
      .select('input_signature, parsed_summary, chart_image_paths, chart_houses')
      .eq('user_id', userId)
      .maybeSingle<{
        input_signature: string | null;
        parsed_summary: Record<string, unknown>;
        chart_image_paths: Record<string, string> | null;
        chart_houses: Record<string, ChartHouse[]> | null;
      }>(),
  ]);
  const profile = profileResult.data;

  if (profileResult.error || !profile) {
    await updateKundliStatus(adminClient, userId, 'failed');
    throw new HttpError(404, 'Birth details profile not found');
  }

  if (
    !profile.date_of_birth ||
    !profile.time_of_birth ||
    !profile.birth_place ||
    profile.birth_latitude === null ||
    profile.birth_longitude === null ||
    !profile.birth_timezone
  ) {
    await updateKundliStatus(adminClient, userId, 'failed');
    throw new HttpError(400, 'Missing required birth details');
  }

  // Deterministic: reuse the stored Kundli when it was built from the same details and engine.
  const inputSignature = birthDetailsSignature(profile);
  const existing = existingResult.data;
  if (existing && existing.input_signature === inputSignature) {
    await updateKundliStatus(adminClient, userId, 'generated');
    return jsonResponse({
      status: 'generated',
      parsed_summary: existing.parsed_summary,
      chart_image_paths: existing.chart_image_paths ?? {},
      chart_houses: existing.chart_houses ?? {},
      cached: true,
    });
  }

  try {
    const utcOffset = resolveUtcOffset(profile.birth_timezone, profile.date_of_birth, profile.time_of_birth);
    const kundli = buildKundli({
      utc: birthInstant(profile.date_of_birth, profile.time_of_birth, utcOffset),
      latitude: profile.birth_latitude,
      longitude: profile.birth_longitude,
    });

    const { error: upsertError } = await adminClient.from('kundlis').upsert(
      {
        user_id: userId,
        raw_response: kundli.details,
        parsed_summary: kundli.summary,
        // Charts are drawn in the app from chart_houses; no images are generated any more.
        chart_image_paths: {},
        chart_raw_responses: kundli.positions,
        chart_houses: kundli.chartHouses,
        input_signature: inputSignature,
        generated_at: kundli.summary.generatedAt,
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    await updateKundliStatus(adminClient, userId, 'generated');
    return jsonResponse({
      status: 'generated',
      parsed_summary: kundli.summary,
      chart_image_paths: {},
      chart_houses: kundli.chartHouses,
    });
  } catch (error) {
    await updateKundliStatus(adminClient, userId, 'failed');
    throw error;
  }
});
