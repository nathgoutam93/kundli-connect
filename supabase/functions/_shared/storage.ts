import type { SupabaseClient } from "npm:@supabase/supabase-js@2.106.2";

const PAGE_SIZE = 100;

/**
 * Deletes every object under `<userId>/` in a bucket (profile photos and Kundli charts are stored
 * per user). Lists in pages so large folders are fully removed. Returns how many were deleted.
 */
export async function removeUserFolder(adminClient: SupabaseClient, bucket: string, userId: string) {
  let removed = 0;
  // Always list from the start: each pass deletes what it found, so the next page moves up.
  for (let pass = 0; pass < 100; pass += 1) {
    const { data, error } = await adminClient.storage.from(bucket).list(userId, { limit: PAGE_SIZE });
    if (error) throw new Error(`Listing ${bucket} failed: ${error.message}`);
    const paths = (data ?? []).filter((item) => item.name).map((item) => `${userId}/${item.name}`);
    if (paths.length === 0) return removed;

    const { error: removeError } = await adminClient.storage.from(bucket).remove(paths);
    if (removeError) throw new Error(`Removing ${bucket} files failed: ${removeError.message}`);
    removed += paths.length;
    if (paths.length < PAGE_SIZE) return removed;
  }
  throw new Error(`Too many files to remove from ${bucket}.`);
}
