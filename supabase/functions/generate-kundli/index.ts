import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.106.2';

import { birthDetailsSignature, buildKundliPayload, type KundliBirthInputs } from '../_shared/kundli-payload.ts';
import { HttpError, jsonResponse, servePost } from '../_shared/http.ts';
import type { ChartHouse } from '../_shared/astro/types.ts';
import { getRequestContext } from '../_shared/supabase.ts';

type ProfileBirthDetails = {
  id: string;
  date_of_birth: string | null;
  time_of_birth: string | null;
  birth_place: string | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
  birth_details_revision: number;
};

async function updateKundliStatus(
  adminClient: SupabaseClient,
  userId: string,
  status: 'pending' | 'generated' | 'failed',
  revision?: number
) {
  const query = adminClient
    .from('profiles')
    .update({
      kundli_generation_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (revision !== undefined) query.eq('birth_details_revision', revision);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!data && revision !== undefined) throw new HttpError(409, 'Birth details changed. Please generate your Kundli again.');
}

const profileColumns = 'id, date_of_birth, time_of_birth, birth_place, birth_latitude, birth_longitude, birth_timezone, birth_details_revision';

servePost(async (request) => {
  const { userId, adminClient } = await getRequestContext(request);

  const [profileResult, existingResult] = await Promise.all([
    adminClient.from('profiles').select(profileColumns).eq('id', userId).single<ProfileBirthDetails>(),
    adminClient
      .from('kundlis')
      .select('input_signature, input_revision, parsed_summary, chart_image_paths, chart_houses')
      .eq('user_id', userId)
      .maybeSingle<{
        input_signature: string | null;
        input_revision: number | null;
        parsed_summary: Record<string, unknown>;
        chart_image_paths: Record<string, string> | null;
        chart_houses: Record<string, ChartHouse[]> | null;
      }>(),
  ]);
  const profile = profileResult.data;

  if (profileResult.error) throw profileResult.error;
  if (existingResult.error) throw existingResult.error;
  if (!profile) {
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
    await updateKundliStatus(adminClient, userId, 'failed', profile.birth_details_revision);
    throw new HttpError(400, 'Missing required birth details');
  }

  // Deterministic: reuse the stored Kundli when it was built from the same details and engine.
  const inputs = profile as ProfileBirthDetails & KundliBirthInputs;
  const inputSignature = birthDetailsSignature(inputs);
  const existing = existingResult.data;
  if (existing && existing.input_signature === inputSignature && existing.input_revision === profile.birth_details_revision) {
    await updateKundliStatus(adminClient, userId, 'generated', profile.birth_details_revision);
    return jsonResponse({
      status: 'generated',
      parsed_summary: existing.parsed_summary,
      chart_image_paths: existing.chart_image_paths ?? {},
      chart_houses: existing.chart_houses ?? {},
      cached: true,
    });
  }

  try {
    const chart = buildKundliPayload(inputs);

    const { error: upsertError } = await adminClient.rpc('commit_generated_kundli', {
      p_user: userId,
      p_revision: profile.birth_details_revision,
      p_chart: chart,
    });

    if (upsertError) {
      if (upsertError.code === '40001') throw new HttpError(409, 'Birth details changed. Please generate your Kundli again.');
      throw new Error(upsertError.message);
    }

    return jsonResponse({
      status: 'generated',
      parsed_summary: chart.parsed_summary,
      chart_image_paths: {},
      chart_houses: chart.chart_houses,
    });
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 409)) {
      await updateKundliStatus(adminClient, userId, 'failed', profile.birth_details_revision);
    }
    throw error;
  }
});
