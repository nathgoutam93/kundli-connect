import { getSupabaseClient } from '@/lib/supabase';

/** Must match the reasons accepted by `report_user` in the database. */
export const REPORT_REASONS = [
  { value: 'fake_profile', label: 'Fake profile', icon: 'person-remove-outline' },
  { value: 'inappropriate_photos', label: 'Inappropriate photos', icon: 'image-outline' },
  { value: 'harassment', label: 'Harassment', icon: 'hand-left-outline' },
  { value: 'offensive_messages', label: 'Offensive messages', icon: 'chatbox-ellipses-outline' },
  { value: 'spam_or_scam', label: 'Scam or spam', icon: 'cash-outline' },
  { value: 'underage', label: 'Under 18', icon: 'alert-circle-outline' },
  { value: 'other', label: 'Something else', icon: 'ellipsis-horizontal-circle-outline' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export type BlockedUser = {
  userId: string;
  name: string;
  photoUrl?: string;
  blockedAt: string;
};

/** Hides the two people from each other everywhere and ends any chat between them. */
export async function blockUser(userId: string) {
  const { error } = await getSupabaseClient().rpc('block_user', { p_user_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string) {
  const { error } = await getSupabaseClient().rpc('unblock_user', { p_user_id: userId });
  if (error) throw error;
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_blocked_users');
  if (error) throw error;
  return ((data ?? []) as { user_id: string; display_name: string | null; photo_path: string | null; blocked_at: string }[]).map(
    (row) => ({
      userId: row.user_id,
      name: row.display_name?.trim() || 'Someone',
      photoUrl: row.photo_path ? supabase.storage.from('profile-photos').getPublicUrl(row.photo_path).data.publicUrl : undefined,
      blockedAt: row.blocked_at,
    })
  );
}

/** Files a report (the server keeps a snapshot of the profile and recent messages as evidence). */
export async function reportUser({
  userId,
  reason,
  details,
  block,
}: {
  userId: string;
  reason: ReportReason;
  details?: string;
  block: boolean;
}) {
  const { data, error } = await getSupabaseClient().rpc('report_user', {
    p_user_id: userId,
    p_reason: reason,
    p_details: details?.trim() || null,
    p_block: block,
  });
  if (error) throw error;
  return data as string;
}

/** Ends the match for both people. */
export async function unmatchChat(chatId: string) {
  const { error } = await getSupabaseClient().rpc('unmatch_chat', { p_chat_id: chatId });
  if (error) throw error;
}

/** Moves a chat in or out of the caller's Hidden section. */
export async function setChatHidden(chatId: string, hidden: boolean) {
  const { error } = await getSupabaseClient().rpc('set_chat_hidden', { p_chat_id: chatId, p_hidden: hidden });
  if (error) throw error;
}

/** Permanently deletes the signed-in account (see the delete-account Edge Function). */
export async function deleteAccount() {
  const { error } = await getSupabaseClient().functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (!error) return;

  // The function's own message (e.g. a clear reason) is in the response body, not the error.
  const context = (error as { context?: Response }).context;
  const body = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
  throw new Error((body as { error?: string } | null)?.error ?? error.message ?? 'Could not delete the account.');
}
