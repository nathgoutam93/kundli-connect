import { corsHeaders, HttpError, jsonResponse } from './http.ts';
import { type RequestContext } from './supabase.ts';

/** Keep the private object and any reusable Storage tokens behind this authorized response. */
export async function profilePhotoResponse(request: Request, context: () => Promise<RequestContext>) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const path = new URL(request.url).searchParams.get('path') ?? '';
    if (path.length > 255 || !/^[a-f0-9-]{36}\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(jpg|jpeg|png|webp)$/i.test(path)) {
      throw new HttpError(404, 'Photo not found.');
    }
    const { userClient, adminClient } = await context();
    const authorized = async () => {
      const { data, error } = await userClient.rpc('can_read_profile_photo', { p_path: path });
      if (error) throw error;
      if (data !== true) throw new HttpError(404, 'Photo not found.');
    };
    await authorized();
    const { data, error } = await adminClient.storage.from('profile-photos').download(path);
    if (error || !data) throw new HttpError(404, 'Photo not found.');
    await authorized();
    return new Response(data, { headers: {
      ...corsHeaders,
      'Content-Type': data.type || 'image/jpeg',
      'Cache-Control': 'private, no-store, max-age=0',
      'Vary': 'Authorization',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) return jsonResponse({ error: error.message }, error.status);
    console.error('Private photo request failed.');
    return jsonResponse({ error: 'Photo unavailable. Please try again.' }, 500);
  }
}
