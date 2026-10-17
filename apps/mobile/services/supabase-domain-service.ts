import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  DEFAULT_SUBSCRIPTION,
  type CreditHistoryItem,
  type CreditPack,
  type NotificationSettings,
  type PrivacySettings,
  type SubscriptionPlan,
  type SubscriptionState,
} from '@/constants/mock-data';
import { getSupabaseClient } from '@/lib/supabase';
import { cursorArgs, listPage, type ListCursor } from '@/lib/list-pages';

async function getSessionUser() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function getSentLikes(before?: ListCursor) {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.rpc('get_sent_likes_page',cursorArgs(before));
  if (error) throw error;
  return listPage((data ?? []) as { id:string; to_user_id:string; status:string; opening_message:string | null; created_at:string }[],(row) => row,(row) => ({ at:row.created_at,id:row.id }));
}

export async function getUnreadCounts(): Promise<{ likes:number; messages:number }> {
  const { data,error } = await getSupabaseClient().rpc('get_social_unread_counts');
  if (error) throw error;
  return { likes:Number(data?.likes ?? 0),messages:Number(data?.messages ?? 0) };
}

export async function passProfile(profileId: string) {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();
  if (!user) throw new Error('Not authenticated.');
  const { error } = await supabase.from('discovery_passes').upsert({ user_id: user.id, passed_user_id: profileId });
  if (error) throw error;
}

export async function dismissLike(likeId: string) {
  const { error } = await getSupabaseClient().from('likes').update({ status: 'dismissed' }).eq('id', likeId);
  if (error) throw error;
}

export async function getSettings() {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();
  if (!user) return { notifications: DEFAULT_NOTIFICATIONS, privacy: DEFAULT_PRIVACY };
  const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return {
    notifications: {
      likes: data?.notify_likes ?? DEFAULT_NOTIFICATIONS.likes,
      matches: data?.notify_matches ?? DEFAULT_NOTIFICATIONS.matches,
      messages: data?.notify_messages ?? DEFAULT_NOTIFICATIONS.messages,
      astrologyReports: data?.notify_astrology_reports ?? DEFAULT_NOTIFICATIONS.astrologyReports,
    },
    privacy: {
      profileDiscoverable: data?.profile_discoverable ?? DEFAULT_PRIVACY.profileDiscoverable,
    },
  };
}

export type SettingsPatch = { notifications?: Partial<NotificationSettings>; privacy?: Partial<PrivacySettings> };

export async function updateSettings({ notifications, privacy }: SettingsPatch, expectedUserId?: string) {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();
  if (!user) throw new Error('Not authenticated.');
  if (expectedUserId && user.id !== expectedUserId) throw new Error('Your session changed. Open settings again.');
  const patch: Record<string, boolean> = {};
  if (notifications?.likes !== undefined) patch.notify_likes = notifications.likes;
  if (notifications?.matches !== undefined) patch.notify_matches = notifications.matches;
  if (notifications?.messages !== undefined) patch.notify_messages = notifications.messages;
  if (notifications?.astrologyReports !== undefined) patch.notify_astrology_reports = notifications.astrologyReports;
  if (privacy?.profileDiscoverable !== undefined) patch.profile_discoverable = privacy.profileDiscoverable;
  const { error } = await supabase.rpc('update_settings_fields', { p_updates: patch, p_expected_user_id: expectedUserId ?? user.id });
  if (error) throw error;
}

export async function markIncomingLikesRead(ids: string[]) {
  if (!ids.length) return;
  const { error } = await getSupabaseClient().rpc('mark_incoming_likes_read', { p_ids: ids.slice(0, 100) });
  if (error) throw error;
}

const CREDIT_HISTORY_LIMIT = 50;

export async function getCreditAccount() {
  const supabase = getSupabaseClient();
  const [{ data: balance, error: balanceError }, { data, error }] = await Promise.all([
    supabase.rpc('get_credit_balance'),
    supabase
      .from('credit_transactions')
      .select('id, amount, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(CREDIT_HISTORY_LIMIT),
  ]);
  if (balanceError) throw balanceError;
  if (error) throw error;
  let runningBalance = Number(balance ?? 0);
  const history: CreditHistoryItem[] = (data ?? []).map((item) => {
    const result = {
      id: item.id,
      createdAt: item.created_at,
      title: /^Generated compatibility/i.test(item.reason) ? 'Compatibility report'
        : /^Sent a like/i.test(item.reason) ? 'Like sent'
        : item.reason.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, 'a member'),
      amount: item.amount,
      balanceAfter: runningBalance,
    };
    runningBalance -= item.amount;
    return result;
  });
  return { balance: Number(balance ?? 0), history };
}

export async function getCreditPacks(): Promise<CreditPack[]> {
  const { data, error } = await getSupabaseClient()
    .from('credit_packs')
    .select('id, name, credits, price_minor, currency')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((pack) => ({
    id: pack.id,
    name: pack.name,
    credits: pack.credits,
    priceMinor: pack.price_minor,
    currency: pack.currency,
  }));
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await getSupabaseClient().from('subscription_plans').select('*').eq('active', true);
  if (error) throw error;
  return (data ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    priceLabel: plan.price_label,
    priceMinor: plan.price_minor ?? undefined,
    currency: plan.currency ?? 'INR',
    cadence: plan.cadence,
    badge: plan.badge ?? undefined,
    features: plan.features as string[],
    creditBonus: plan.credit_bonus,
  }));
}

export async function getSubscription(): Promise<SubscriptionState> {
  const requestedAt = Date.now();
  const { data, error } = await getSupabaseClient().rpc('get_effective_subscription');
  if (error) throw error;
  const remaining = Number(data?.remainingMs);
  return data ? {
    status: data.status as SubscriptionState['status'],
    planId: data.planId ?? undefined,
    renewalDate: data.renewalDate ?? undefined,
    restoredAt: data.restoredAt ?? undefined,
    expiresAt: requestedAt + (Number.isFinite(remaining) ? Math.max(0, remaining) : 0),
  } : DEFAULT_SUBSCRIPTION;
}
