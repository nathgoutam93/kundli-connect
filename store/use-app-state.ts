import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  DEFAULT_PROFILE,
  DEFAULT_SUBSCRIPTION,
  MOCK_ACTIVITY,
  MOCK_CHATS,
  MOCK_CREDIT_HISTORY,
  MOCK_DISCOVER_PROFILES,
  MOCK_LIKES,
  MOCK_SUBSCRIPTION_PLANS,
  type ActivityItem,
  type ChatPreview,
  type CreditHistoryItem,
  type DiscoverProfile,
  type LikeItem,
  type NotificationSettings,
  type PrivacySettings,
  type SubscriptionPlan,
  type SubscriptionState,
  type UserProfile,
} from '@/constants/mock-data';
import {
  mockAuthService,
  mockChatService,
  mockCreditsService,
  mockDiscoveryService,
  mockLikesService,
  mockNotificationsService,
  mockOnboardingService,
  mockPrivacyService,
  mockProfileService,
  mockSubscriptionsService,
} from '@/services/mock-services';

type AppState = {
  isHydrated: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  isServiceBusy: boolean;
  serviceError?: string;
  profile: UserProfile;
  discoverProfiles: DiscoverProfile[];
  skippedProfileIds: string[];
  likedProfileIds: string[];
  likes: LikeItem[];
  chats: ChatPreview[];
  activity: ActivityItem[];
  creditsBalance: number;
  creditHistory: CreditHistoryItem[];
  subscription: SubscriptionState;
  subscriptionPlans: SubscriptionPlan[];
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  requestOtp: (phoneNumber: string) => Promise<void>;
  setPhoneNumber: (phoneNumber: string) => void;
  completeOtpLogin: (otp?: string) => Promise<void>;
  completeGoogleLogin: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateProfile: (profileUpdates: Partial<UserProfile>) => Promise<void>;
  passProfile: (profileId: string) => Promise<void>;
  consumeCredit: (reason: string) => Promise<boolean>;
  sendLike: (profileId: string, message: string) => Promise<boolean>;
  replyToLike: (likeId: string, message: string) => Promise<string | undefined>;
  dismissLike: (likeId: string) => Promise<void>;
  sendChatMessage: (chatId: string, text: string) => Promise<void>;
  markChatRead: (chatId: string) => Promise<void>;
  purchaseCredits: (amount: number) => Promise<void>;
  purchaseSubscription: (planId: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  updateNotifications: (settings: Partial<NotificationSettings>) => Promise<void>;
  updatePrivacy: (settings: Partial<PrivacySettings>) => Promise<void>;
  logout: () => Promise<void>;
};

const initialPersistedState = {
  isAuthenticated: false,
  hasCompletedOnboarding: false,
  profile: DEFAULT_PROFILE,
  skippedProfileIds: [] as string[],
  likedProfileIds: [] as string[],
  likes: MOCK_LIKES,
  chats: MOCK_CHATS,
  activity: MOCK_ACTIVITY,
  creditsBalance: 12,
  creditHistory: MOCK_CREDIT_HISTORY,
  subscription: DEFAULT_SUBSCRIPTION,
  notifications: DEFAULT_NOTIFICATIONS,
  privacy: DEFAULT_PRIVACY,
};

const memoryFallbackStorage: StateStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

const safeStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return memoryFallbackStorage.getItem(name);
    }
  },
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
      return;
    } catch {
      return memoryFallbackStorage.setItem(name, value);
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
      return;
    } catch {
      return memoryFallbackStorage.removeItem(name);
    }
  },
};

function withBusy<T>(set: (partial: Partial<AppState>) => void, task: () => Promise<T>) {
  set({ isServiceBusy: true, serviceError: undefined });
  return task()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      set({ serviceError: message });
      throw error;
    })
    .finally(() => set({ isServiceBusy: false }));
}

export const useAppState = create<AppState>()(
  persist(
    (set, get) => ({
      isHydrated: false,
      isServiceBusy: false,
      ...initialPersistedState,
      discoverProfiles: MOCK_DISCOVER_PROFILES,
      subscriptionPlans: MOCK_SUBSCRIPTION_PLANS,
      requestOtp: async (phoneNumber) => {
        await withBusy(set, () => mockAuthService.requestOtp(phoneNumber));
      },
      setPhoneNumber: (phoneNumber) => {
        set((state) => ({
          profile: {
            ...state.profile,
            phoneNumber,
            updatedAt: new Date().toISOString(),
          },
        }));
      },
      completeOtpLogin: async (otp = '0000') => {
        await withBusy(set, async () => {
          const phoneNumber = get().profile.phoneNumber;
          await mockAuthService.verifyOtp(phoneNumber, otp);
          set({ isAuthenticated: true });
        });
      },
      completeGoogleLogin: async () => {
        await withBusy(set, async () => {
          const result = await mockAuthService.signInWithGoogle();
          set((state) => ({
            isAuthenticated: true,
            profile: {
              ...state.profile,
              email: state.profile.email || result.email,
              updatedAt: new Date().toISOString(),
            },
          }));
        });
      },
      completeOnboarding: async () => {
        await withBusy(set, async () => {
          const profile = await mockOnboardingService.complete(get().profile);
          set({
            profile,
            hasCompletedOnboarding: true,
          });
        });
      },
      updateProfile: async (profileUpdates) => {
        const optimisticProfile = {
          ...get().profile,
          ...profileUpdates,
          updatedAt: new Date().toISOString(),
        };
        set({ profile: optimisticProfile });
        await withBusy(set, async () => {
          const profile = await mockProfileService.updateProfile(get().profile, profileUpdates);
          set({ profile });
        });
      },
      passProfile: async (profileId) => {
        set((state) => ({
          skippedProfileIds: [...new Set([...state.skippedProfileIds, profileId])],
        }));
        await withBusy(set, () => mockDiscoveryService.passProfile(profileId));
      },
      consumeCredit: async (reason) => {
        if (get().subscription.status === 'active') {
          return true;
        }

        if (get().creditsBalance <= 0) {
          set({ serviceError: 'You need credits to continue.' });
          return false;
        }

        const createdAt = new Date().toISOString();
        set((state) => {
          const nextBalance = Math.max(state.creditsBalance - 1, 0);

          return {
            creditsBalance: nextBalance,
            creditHistory: [
              {
                id: `credit-use-${Date.now()}`,
                createdAt,
                title: reason,
                amount: -1,
                balanceAfter: nextBalance,
              },
              ...state.creditHistory,
            ],
            activity: [
              {
                id: `activity-credit-use-${Date.now()}`,
                createdAt,
                type: 'credit',
                title: 'Credit used',
                description: reason,
                time: 'Just now',
              },
              ...state.activity,
            ],
            serviceError: undefined,
          };
        });

        return true;
      },
      sendLike: async (profileId, message) => {
        const profile = get().discoverProfiles.find((item) => item.id === profileId);
        if (!profile) {
          return false;
        }

        const hasCredit = await get().consumeCredit(`Liked ${profile.name}`);
        if (!hasCredit) {
          return false;
        }

        set((state) => ({
          likedProfileIds: [...new Set([...state.likedProfileIds, profileId])],
          activity: [
            {
              id: `activity-like-${profileId}-${Date.now()}`,
              createdAt: new Date().toISOString(),
              type: 'like',
              title: `You liked ${profile.name}`,
              description: message.trim() || 'You sent a like.',
              time: 'Just now',
            },
            ...state.activity,
          ],
        }));
        await withBusy(set, () => mockDiscoveryService.likeProfile(profile, message));
        return true;
      },
      replyToLike: async (likeId, message) => {
        const like = get().likes.find((item) => item.id === likeId);
        if (!like) {
          return undefined;
        }

        const chat = await withBusy(set, () => mockLikesService.replyToLike(like, message));
        set((state) => ({
          likes: state.likes.filter((item) => item.id !== likeId),
          chats: [chat, ...state.chats.filter((item) => item.id !== chat.id)],
          activity: [
            {
              id: `activity-reply-${like.id}`,
              createdAt: new Date().toISOString(),
              type: 'match',
              title: `You matched with ${like.fromName}`,
              description: `You replied: ${message.trim()}`,
              time: 'Just now',
            },
            ...state.activity,
          ],
        }));

        return chat.id;
      },
      dismissLike: async (likeId) => {
        set((state) => ({
          likes: state.likes.filter((item) => item.id !== likeId),
        }));
        await withBusy(set, () => mockLikesService.dismissLike(likeId));
      },
      sendChatMessage: async (chatId, text) => {
        const chat = get().chats.find((item) => item.id === chatId);
        const trimmedText = text.trim();
        if (!chat || !trimmedText) {
          return;
        }

        const message = await withBusy(set, () => mockChatService.sendMessage(chat, trimmedText));
        set((state) => ({
          chats: state.chats.map((item) =>
            item.id === chatId
              ? {
                  ...item,
                  updatedAt: message.createdAt,
                  lastMessage: message.text,
                  unreadCount: 0,
                  messages: [...item.messages, message],
                }
              : item
          ),
        }));
      },
      markChatRead: async (chatId) => {
        set((state) => ({
          chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat)),
        }));
        await withBusy(set, () => mockChatService.markRead(chatId));
      },
      purchaseCredits: async (amount) => {
        const result = await withBusy(set, () => mockCreditsService.purchaseCredits(get().creditsBalance, amount));
        set((state) => ({
          creditsBalance: result.balance,
          creditHistory: [result.historyItem, ...state.creditHistory],
          activity: [
            {
              id: `activity-credit-${result.historyItem.id}`,
              createdAt: result.historyItem.createdAt,
              type: 'credit',
              title: result.historyItem.title,
              description: `Balance is now ${result.balance}.`,
              time: 'Just now',
            },
            ...state.activity,
          ],
        }));
      },
      purchaseSubscription: async (planId) => {
        const plan = get().subscriptionPlans.find((item) => item.id === planId);
        if (!plan) {
          return;
        }

        const subscription = await withBusy(set, () => mockSubscriptionsService.purchasePlan(plan));
        set((state) => ({
          subscription,
          creditsBalance: state.creditsBalance + plan.creditBonus,
          creditHistory: [
            {
              id: `credit-sub-${Date.now()}`,
              createdAt: new Date().toISOString(),
              title: `${plan.name} plan bonus`,
              amount: plan.creditBonus,
              balanceAfter: state.creditsBalance + plan.creditBonus,
            },
            ...state.creditHistory,
          ],
          activity: [
            {
              id: `activity-sub-${plan.id}`,
              createdAt: new Date().toISOString(),
              type: 'subscription',
              title: `${plan.name} activated`,
              description: `${plan.creditBonus} credits added.`,
              time: 'Just now',
            },
            ...state.activity,
          ],
        }));
      },
      restorePurchases: async () => {
        const subscription = await withBusy(set, () => mockSubscriptionsService.restorePurchases());
        set({ subscription });
      },
      updateNotifications: async (settings) => {
        const notifications = { ...get().notifications, ...settings };
        set({ notifications });
        await withBusy(set, async () => {
          set({ notifications: await mockNotificationsService.update(notifications) });
        });
      },
      updatePrivacy: async (settings) => {
        const privacy = { ...get().privacy, ...settings };
        set({ privacy });
        await withBusy(set, async () => {
          set({ privacy: await mockPrivacyService.update(privacy) });
        });
      },
      logout: async () => {
        await withBusy(set, () => mockAuthService.logout());
        set({
          ...initialPersistedState,
          discoverProfiles: MOCK_DISCOVER_PROFILES,
          subscriptionPlans: MOCK_SUBSCRIPTION_PLANS,
          isServiceBusy: false,
          serviceError: undefined,
        });
      },
    }),
    {
      name: 'kundalikonnect-local-state-v2',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        profile: state.profile,
        skippedProfileIds: state.skippedProfileIds,
        likedProfileIds: state.likedProfileIds,
        likes: state.likes,
        chats: state.chats,
        activity: state.activity,
        creditsBalance: state.creditsBalance,
        creditHistory: state.creditHistory,
        subscription: state.subscription,
        notifications: state.notifications,
        privacy: state.privacy,
      }),
      onRehydrateStorage: () => () => {
        useAppState.setState({ isHydrated: true });
      },
    }
  )
);
