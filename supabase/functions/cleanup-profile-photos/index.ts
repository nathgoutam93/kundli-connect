import { HttpError, jsonResponse, requiredEnv, servePost } from '../_shared/http.ts';
import { getAdminClient } from '../_shared/supabase.ts';

// Scheduled server worker. A failed Storage deletion leaves the queue intact for a later run.
servePost(async (request) => {
  if (request.headers.get('Authorization') !== `Bearer ${requiredEnv('PHOTO_CLEANUP_SECRET')}`) throw new HttpError(401, 'Unauthorized');
  const admin = getAdminClient();
  const { data, error } = await admin.rpc('get_photo_cleanup', { p_limit: 100 });
  if (error) throw error;
  const paths = ((data ?? []) as { storage_path: string }[]).map((row) => row.storage_path);
  if (paths.length) {
    const { error: removeError } = await admin.storage.from('profile-photos').remove(paths);
    if (removeError) throw removeError;
    const { error: ackError } = await admin.rpc('acknowledge_photo_cleanup', { p_paths: paths });
    if (ackError) throw ackError;
  }
  return jsonResponse({ removed: paths.length });
});
