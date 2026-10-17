import { useQueryClient } from '@tanstack/react-query';

import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  DEFAULT_PROFILE,
  DEFAULT_SUBSCRIPTION,
  type UserProfile,
} from '@/constants/mock-data';
import { useEffectiveSubscription } from '@/hooks/use-effective-subscription';
import { useAccountQueries, useChatsQuery, useDiscoverProfilesQuery, useDomainMutations, useIncomingLikesQuery, useProfileQuery, useSkippedProfilesQuery, useUnreadCountsQuery } from '@/hooks/use-domain-data';
import { createPendingMessage } from '@/lib/chat-cache';
import { getMessageRequestId } from '@/services/message-attempts';
import { signInWithSocialProvider, type SocialProvider, type SocialSignInResult } from '@/services/auth';
import type { PurchaseOutcome } from '@/services/checkout';
import { useAuth } from '@/providers/auth-provider';
import { ensureCurrentUserProfile, registerCurrentUserPushToken } from '@/services/supabase-auth-service';

export function useAppData<T = AppData>(selector?: (state: AppData) => T): T {
  const auth = useAuth();
  const client = useQueryClient();
  const profileQuery = useProfileQuery();
  const discoverQuery = useDiscoverProfilesQuery();
  const skippedQuery = useSkippedProfilesQuery();
  const likesQuery = useIncomingLikesQuery();
  const chatsQuery = useChatsQuery();
  const unreadQuery = useUnreadCountsQuery();
  const account = useAccountQueries();
  const mutations = useDomainMutations();
  const subscription = useEffectiveSubscription(account.subscription.data ?? DEFAULT_SUBSCRIPTION);
  const profile = profileQuery.data ?? { ...DEFAULT_PROFILE, id: auth.user?.id ?? DEFAULT_PROFILE.id };
  const settings = account.settings.data ?? { notifications: DEFAULT_NOTIFICATIONS, privacy: DEFAULT_PRIVACY };

  const errors = [
    profileQuery.error,
    discoverQuery.error,
    likesQuery.error,
    chatsQuery.error,
    account.credits.error,
    account.settings.error,
    account.subscription.error,
    account.plans.error,
    account.creditPacks.error,
    ...Object.values(mutations).map((mutation) => mutation.error),
  ].filter(Boolean);
  const serviceError = errors[0] instanceof Error ? errors[0].message : undefined;
  const isServiceBusy = Object.values(mutations).some((mutation) => mutation.isPending);
  const isHydrated = !auth.isInitializing && (!auth.user || !profileQuery.isPending);

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!profileQuery.data || profileQuery.isError) throw new Error('Load your profile before saving changes.');
    await mutations.updateProfile.mutateAsync({ updates });
    if (updates.photoUris) await mutations.reorderPhotos.mutateAsync(updates.photoUris);
  }

  const state: AppData = {
    isHydrated,
    isAuthenticated: Boolean(auth.user),
    hasCompletedOnboarding: Boolean(profileQuery.data?._onboardingCompleted),
    isServiceBusy,
    serviceError,
    profileError: profileQuery.isError,
    discoverError: discoverQuery.isError,
    skippedError: skippedQuery.isError,
    likesError: likesQuery.isError,
    chatsError: chatsQuery.isError,
    settingsError: account.settings.isError,
    settingsReady: account.settings.isSuccess,
    isLoadingDiscover: discoverQuery.isPending,
    isLoadingLikes: likesQuery.isPending,
    isLoadingChats: chatsQuery.isPending,
    hasMoreLikes:Boolean(likesQuery.hasNextPage),
    isLoadingMoreLikes:likesQuery.isFetchingNextPage,
    loadMoreLikes:async () => { await likesQuery.fetchNextPage(); },
    hasMoreChats:Boolean(chatsQuery.hasNextPage),
    isLoadingMoreChats:chatsQuery.isFetchingNextPage,
    loadMoreChats:async () => { await chatsQuery.fetchNextPage(); },
    unreadLikes:unreadQuery.data?.likes ?? (likesQuery.data ?? []).filter((like) => !like.readAt).length,
    unreadMessages:unreadQuery.data?.messages ?? (chatsQuery.data ?? []).reduce((total,chat) => total+(chat.hidden ? 0 : chat.unreadCount),0),
    profile,
    discoverProfiles: discoverQuery.data ?? [],
    skippedProfiles: skippedQuery.data?.pages.flatMap((page) => page.profiles) ?? [],
    hasMoreSkipped: Boolean(skippedQuery.hasNextPage),
    isLoadingSkipped: skippedQuery.isPending || skippedQuery.isFetchingNextPage,
    loadMoreSkipped: async () => { await skippedQuery.fetchNextPage(); },
    refreshSkipped: async () => { await skippedQuery.refetch(); },
    likedProfileIds: [],
    likes: likesQuery.data ?? [],
    chats: chatsQuery.data ?? [],
    creditsBalance: account.credits.data?.balance ?? 0,
    creditHistory: account.credits.data?.history ?? [],
    subscription,
    subscriptionPlans: account.plans.data ?? [],
    creditPacks: account.creditPacks.data ?? [],
    notifications: settings.notifications,
    privacy: settings.privacy,
    requestOtp: auth.requestOtp,
    setPhoneNumber: () => undefined,
    completeOtpLogin: async (otp, phoneNumber) => {
      await auth.verifyOtp(phoneNumber, otp);
      await ensureCurrentUserProfile();
      await client.invalidateQueries();
      void registerCurrentUserPushToken({ requestPermission: false }).catch(() => undefined);
    },
    signInWithProvider: async (provider) => {
      const result = await signInWithSocialProvider(provider);
      if (result.status === 'success') {
        await ensureCurrentUserProfile();
        await client.invalidateQueries();
        void registerCurrentUserPushToken({ requestPermission: false }).catch(() => undefined);
      }
      return result;
    },
    completeOnboarding: async () => {
      if (!profileQuery.data || profileQuery.isError) throw new Error('Load your profile before continuing.');
      // Verify/regenerate the chart before birth details become immutable.
      await mutations.generateKundli.mutateAsync();
      await mutations.updateProfile.mutateAsync({ updates: {}, onboardingCompleted: true });
    },
    updateProfile,
    generateKundli: () => mutations.generateKundli.mutateAsync(),
    generateCompatibility: (profileId) => mutations.generateCompatibility.mutateAsync(profileId),
    refreshDiscoverProfiles: async () => { await discoverQuery.refetch(); },
    refreshLikes: async () => { await likesQuery.refetch(); },
    refreshChats: async () => { await chatsQuery.refetch(); },
    refreshSettings: async () => { await account.settings.refetch(); },
    loadEarlierChatMessages: async () => { await chatsQuery.refetch(); },
    refreshProfile: async () => { await profileQuery.refetch(); },
    addProfilePhotos: async (uris) => mutations.addPhotos.mutateAsync({ uris }),
    replaceProfilePhoto: (uri, previous) => mutations.replacePhoto.mutateAsync({ uri, previous }),
    removeProfilePhoto: async (uri) => mutations.removePhoto.mutateAsync(uri),
    passProfile: async (profileId) => mutations.passProfile.mutateAsync(profileId),
    sendLike: async (profileId, message) => {
      await mutations.sendLike.mutateAsync({ profileId, message });
      return true;
    },
    replyToLike: async (likeId, message) => mutations.replyToLike.mutateAsync({ likeId, message }),
    dismissLike: async (likeId) => mutations.dismissLike.mutateAsync(likeId),
    sendChatMessage: async (chatId, text, requestTargetId) => {
      if (!auth.user) throw new Error('Please sign in again.');
      const requestId = await getMessageRequestId({ userId: auth.user.id, kind: 'send', targetId: requestTargetId ?? chatId, text });
      await mutations.sendMessage.mutateAsync({ chatId, requestTargetId, text, pending: createPendingMessage(text,new Date(),requestId) });
    },
    markChatRead: async (chatId) => { await mutations.markRead.mutateAsync(chatId); },
    markLikesRead: (ids) => mutations.markLikesRead.mutateAsync(ids),
    purchaseCreditPack: (packId) =>
      mutations.purchase.mutateAsync({ type: 'credit_pack', productId: packId, customer: { name: profile.name, email: profile.email, phone: profile.phoneNumber } }),
    purchaseSubscription: (planId) =>
      mutations.purchase.mutateAsync({ type: 'subscription', productId: planId, customer: { name: profile.name, email: profile.email, phone: profile.phoneNumber } }),
    // Purchases are recorded server-side, so restoring means re-reading the account.
    restorePurchases: async () => {
      const results = await Promise.all([account.subscription.refetch(), account.credits.refetch()]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    updateNotifications: async (updates) =>
      mutations.updateSettings.mutateAsync({ notifications: updates }),
    updatePrivacy: async (updates) =>
      mutations.updateSettings.mutateAsync({ privacy: updates }),
    hydrateAuthSession: async () => undefined,
    logout: async () => {
      await auth.logout();
      client.clear();
    },
  };

  return selector ? selector(state) : (state as T);
}

export type AppData = {
  isHydrated: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  isServiceBusy: boolean;
  /** First load of a list is still in flight (no cached data yet); used for skeletons. */
  isLoadingDiscover: boolean;
  isLoadingLikes: boolean;
  isLoadingChats: boolean;
  hasMoreLikes:boolean;
  isLoadingMoreLikes:boolean;
  loadMoreLikes:() => Promise<void>;
  hasMoreChats:boolean;
  isLoadingMoreChats:boolean;
  loadMoreChats:() => Promise<void>;
  unreadLikes:number;
  unreadMessages:number;
  serviceError?: string;
  profileError: boolean;
  discoverError: boolean;
  skippedError: boolean;
  likesError: boolean;
  chatsError: boolean;
  settingsError: boolean;
  settingsReady: boolean;
  profile: UserProfile;
  discoverProfiles: ReturnType<typeof useDiscoverProfilesQuery>['data'] extends infer D ? NonNullable<D> : never;
  skippedProfiles: NonNullable<ReturnType<typeof useDiscoverProfilesQuery>['data']>;
  hasMoreSkipped: boolean;
  isLoadingSkipped: boolean;
  loadMoreSkipped: () => Promise<void>;
  refreshSkipped: () => Promise<void>;
  likedProfileIds: string[];
  likes: NonNullable<ReturnType<typeof useIncomingLikesQuery>['data']>;
  chats: NonNullable<ReturnType<typeof useChatsQuery>['data']>;
  creditsBalance: number;
  creditHistory: NonNullable<ReturnType<typeof useAccountQueries>['credits']['data']>['history'];
  subscription: NonNullable<ReturnType<typeof useAccountQueries>['subscription']['data']>;
  subscriptionPlans: NonNullable<ReturnType<typeof useAccountQueries>['plans']['data']>;
  creditPacks: NonNullable<ReturnType<typeof useAccountQueries>['creditPacks']['data']>;
  notifications: typeof DEFAULT_NOTIFICATIONS;
  privacy: typeof DEFAULT_PRIVACY;
  requestOtp: (phone: string) => Promise<unknown>;
  setPhoneNumber: (phone: string) => void;
  completeOtpLogin: (otp: string, phone: string) => Promise<void>;
  signInWithProvider: (provider: SocialProvider) => Promise<SocialSignInResult>;
  completeOnboarding: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  generateKundli: () => Promise<unknown>;
  generateCompatibility: (profileId: string) => Promise<any>;
  refreshDiscoverProfiles: () => Promise<void>;
  refreshLikes: () => Promise<void>;
  refreshChats: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  loadEarlierChatMessages: (chatId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  addProfilePhotos: (uris: string[]) => Promise<import('@/services/profile-photo-service').PhotoUploadResult[]>;
  replaceProfilePhoto: (uri: string, previous: string) => Promise<string>;
  removeProfilePhoto: (uri: string) => Promise<void>;
  passProfile: (profileId: string) => Promise<void>;
  sendLike: (profileId: string, message: string) => Promise<boolean>;
  replyToLike: (likeId: string, message: string) => Promise<string | undefined>;
  dismissLike: (likeId: string) => Promise<void>;
  sendChatMessage: (chatId: string, text: string, requestTargetId?: string) => Promise<void>;
  markChatRead: (chatId: string) => Promise<void>;
  markLikesRead: (ids: string[]) => Promise<void>;
  purchaseCreditPack: (packId: string) => Promise<PurchaseOutcome>;
  purchaseSubscription: (planId: string) => Promise<PurchaseOutcome>;
  restorePurchases: () => Promise<void>;
  updateNotifications: (updates: Partial<typeof DEFAULT_NOTIFICATIONS>) => Promise<void>;
  updatePrivacy: (updates: Partial<typeof DEFAULT_PRIVACY>) => Promise<void>;
  hydrateAuthSession: () => Promise<void>;
  logout: () => Promise<void>;
};
