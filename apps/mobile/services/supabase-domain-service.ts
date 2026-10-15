import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  DEFAULT_SUBSCRIPTION,
  type ActivityItem,
  type CreditHistoryItem,
  type CreditPack,
  type NotificationSettings,
  type PrivacySettings,
  type SubscriptionPlan,
  type SubscriptionState,
} from '@/constants/mock-data';
import { getSupabaseClient } from '@/lib/supabase';

async function getSessionUser() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function getSentLikes() {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('likes')
    .select('id, to_user_id, opening_message, status, created_at')
    .eq('from_user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
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
      showDistance: data?.show_distance ?? DEFAULT_PRIVACY.showDistance,
      showOnlineStatus: data?.show_online_status ?? DEFAULT_PRIVACY.showOnlineStatus,
      profileDiscoverable: data?.profile_discoverable ?? DEFAULT_PRIVACY.profileDiscoverable,
    },
  };
}

export async function updateSettings(notifications: NotificationSettings, privacy: PrivacySettings) {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();
  if (!user) throw new Error('Not authenticated.');
  const { error } = await supabase.from('user_settings').upsert({
    user_id: user.id,
    notify_likes: notifications.likes,
    notify_matches: notifications.matches,
    notify_messages: notifications.messages,
    notify_astrology_reports: notifications.astrologyReports,
    show_distance: privacy.showDistance,
    show_online_status: privacy.showOnlineStatus,
    profile_discoverable: privacy.profileDiscoverable,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getActivity(): Promise<ActivityItem[]> {
  const { data, error } = await getSupabaseClient()
    .from('activity_events')
    .select('id, event_type, title, description, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((item) => ({
    id: item.id,
    createdAt: item.created_at,
    type: item.event_type as ActivityItem['type'],
    title: item.title,
    description: item.description,
    time: new Date(item.created_at).toLocaleDateString(),
    readAt: item.read_at ?? undefined,
  }));
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
      title: item.reason,
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
  const { data, error } = await getSupabaseClient()
    .from('user_subscriptions')
    .select('plan_id, status, renewal_date, restored_at')
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        status: data.status as SubscriptionState['status'],
        planId: data.plan_id ?? undefined,
        renewalDate: data.renewal_date ?? undefined,
        restoredAt: data.restored_at ?? undefined,
      }
    : DEFAULT_SUBSCRIPTION;
}
