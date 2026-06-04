import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  DEFAULT_PROFILE,
  DEFAULT_SUBSCRIPTION,
  MOCK_ACTIVITY,
  MOCK_CREDIT_HISTORY,
  MOCK_SUBSCRIPTION_PLANS,
  type ActivityItem,
  type ChatPreview,
  type CompatibilityResult,
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
  mockCreditsService,
  mockDiscoveryService,
  mockLikesService,
  mockNotificationsService,
  mockOnboardingService,
  mockPrivacyService,
  mockProfileService,
  mockSubscriptionsService,
} from '@/services/mock-services';
import {
  applyProfileRow,
  ensureCurrentUserProfile,
  getDiscoverProfiles,
  getPendingIncomingLikes,
  getCurrentSession,
  createLike,
  replyToLike as replyToLikeInSupabase,
  generateCurrentUserKundli,
  generateMatchScore,
  getChatMessages,
  getChats,
  getCurrentUserProfile,
  requestPhoneOtp,
  markChatRead as markChatReadInSupabase,
  registerCurrentUserPushToken,
  sendMessage as sendChatMessageInSupabase,
  signOut,
  deleteCurrentUserProfilePhoto,
  updateCurrentUserProfile,
  updateCurrentUserProfilePhotoOrder,
  uploadCurrentUserProfilePhoto,
  verifyPhoneOtp,
  type KundliSummary,
} from '@/services/supabase-auth-service';

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
  completeOtpLogin: (otp: string, phoneNumber: string) => Promise<void>;
  completeGoogleLogin: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateProfile: (profileUpdates: Partial<UserProfile>) => Promise<void>;
  generateKundli: () => Promise<KundliSummary>;
  generateCompatibility: (profileId: string) => Promise<CompatibilityResult>;
  refreshDiscoverProfiles: () => Promise<void>;
  refreshLikes: () => Promise<void>;
  refreshChats: () => Promise<void>;
  loadEarlierChatMessages: (chatId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  addProfilePhotos: (photoUris: string[]) => Promise<string[]>;
  removeProfilePhoto: (photoUri: string) => Promise<void>;
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
  hydrateAuthSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const initialPersistedState = {
  isAuthenticated: false,
  hasCompletedOnboarding: false,
  profile: DEFAULT_PROFILE,
  skippedProfileIds: [] as string[],
  likedProfileIds: [] as string[],
  likes: [] as LikeItem[],
  chats: [],
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
      discoverProfiles: [],
      subscriptionPlans: MOCK_SUBSCRIPTION_PLANS,
      hydrateAuthSession: async () => {
        await withBusy(set, async () => {
          const session = await getCurrentSession();

          if (!session) {
            set({
              isAuthenticated: false,
              hasCompletedOnboarding: false,
            });
            return;
          }

          const profileRow = await getCurrentUserProfile();
          set((state) => ({
            isAuthenticated: true,
            hasCompletedOnboarding: Boolean(profileRow?.onboarding_completed),
            profile: profileRow ? applyProfileRow(state.profile, profileRow) : state.profile,
          }));

          const [discoverProfiles, likes, chats] = await Promise.all([
            getDiscoverProfiles(),
            getPendingIncomingLikes(),
            getChats(15),
          ]);
          set({ discoverProfiles, likes, chats });

          registerCurrentUserPushToken({ requestPermission: false }).catch((error) => {
            console.warn('Push token refresh failed during session hydration.', error);
          });
        });
      },
      requestOtp: async (phoneNumber) => {
        await withBusy(set, () => requestPhoneOtp(phoneNumber));
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
      completeOtpLogin: async (otp, phoneNumber) => {
        await withBusy(set, async () => {
          await verifyPhoneOtp(phoneNumber, otp);
          const user = await ensureCurrentUserProfile();
          let profileRow: Awaited<ReturnType<typeof getCurrentUserProfile>> = null;

          try {
            profileRow = await getCurrentUserProfile();
          } catch (error) {
            console.warn('Supabase profile fetch after OTP verification failed; continuing login.', error);
          }

          set((state) => ({
            isAuthenticated: true,
            hasCompletedOnboarding: Boolean(profileRow?.onboarding_completed),
            profile: {
              ...(profileRow ? applyProfileRow(state.profile, profileRow) : state.profile),
              id: user.id,
              phoneNumber: user.phone || phoneNumber,
              updatedAt: new Date().toISOString(),
            },
          }));

          registerCurrentUserPushToken({ requestPermission: false }).catch((error) => {
            console.warn('Push token refresh failed after OTP login.', error);
          });
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
          await updateCurrentUserProfile(profile, { onboardingCompleted: true });
          let kundliStatus = profile.kundliStatus;

          if (kundliStatus !== 'generated') {
            try {
              await generateCurrentUserKundli();
              kundliStatus = 'generated';
            } catch {
              kundliStatus = 'failed';
            }
          }

          set({
            profile: {
              ...profile,
              kundliStatus,
            },
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
          if (get().isAuthenticated) {
            await updateCurrentUserProfile(profile);
            if (profileUpdates.photoUris !== undefined) {
              await updateCurrentUserProfilePhotoOrder(profile.photoUris ?? []);
            }
          }
          set({ profile });
        });
      },
      generateKundli: async () => {
        set((state) => ({
          profile: {
            ...state.profile,
            kundliStatus: 'pending',
            updatedAt: new Date().toISOString(),
          },
        }));

        return withBusy(set, async () => {
          try {
            const summary = await generateCurrentUserKundli();
            set((state) => ({
              profile: {
                ...state.profile,
                kundliStatus: 'generated',
                updatedAt: new Date().toISOString(),
              },
            }));
            return summary;
          } catch (error) {
            set((state) => ({
              profile: {
                ...state.profile,
                kundliStatus: 'failed',
                updatedAt: new Date().toISOString(),
              },
            }));
            throw error;
          }
        });
      },
      generateCompatibility: async (profileId) => {
        return withBusy(set, () => generateMatchScore(profileId));
      },
      refreshDiscoverProfiles: async () => {
        if (!get().isAuthenticated) {
          set({ discoverProfiles: [] });
          return;
        }

        await withBusy(set, async () => {
          const discoverProfiles = await getDiscoverProfiles();
          set({ discoverProfiles });
        });
      },
      refreshLikes: async () => {
        if (!get().isAuthenticated) {
          set({ likes: [] });
          return;
        }

        await withBusy(set, async () => {
          const likes = await getPendingIncomingLikes();
          set({ likes });
        });
      },
      refreshChats: async () => {
        if (!get().isAuthenticated) {
          set({ chats: [] });
          return;
        }

        await withBusy(set, async () => {
          const chats = await getChats(15);
          set({ chats });
        });
      },
      loadEarlierChatMessages: async (chatId) => {
        const chat = get().chats.find((item) => item.id === chatId);
        const oldestMessage = chat?.messages[0];
        if (!chat || !oldestMessage || !chat.hasMoreMessages) {
          return;
        }

        await withBusy(set, async () => {
          const page = await getChatMessages(chatId, {
            before: oldestMessage.createdAt,
            limit: 30,
          });

          set((state) => ({
            chats: state.chats.map((item) =>
              item.id === chatId
                ? {
                    ...item,
                    hasMoreMessages: page.hasMoreMessages,
                    messages: [...page.messages, ...item.messages],
                  }
                : item
            ),
          }));
        });
      },
      refreshProfile: async () => {
        if (!get().isAuthenticated) {
          return;
        }

        await withBusy(set, async () => {
          const profileRow = await getCurrentUserProfile();
          if (!profileRow) {
            return;
          }

          set((state) => ({
            hasCompletedOnboarding: Boolean(profileRow.onboarding_completed),
            profile: applyProfileRow(state.profile, profileRow),
          }));
        });
      },
      addProfilePhotos: async (photoUris) => {
        const localUris = photoUris.filter((uri) => uri.trim());
        if (localUris.length === 0) {
          return [];
        }

        return withBusy(set, async () => {
          const existingUris = get().profile.photoUris ?? [];
          const uploadedUris: string[] = [];

          for (const [index, photoUri] of localUris.entries()) {
            const uploadedUri = await uploadCurrentUserProfilePhoto(photoUri, existingUris.length + index);
            uploadedUris.push(uploadedUri);
          }

          set((state) => ({
            profile: {
              ...state.profile,
              photoUris: [...(state.profile.photoUris ?? []), ...uploadedUris],
              updatedAt: new Date().toISOString(),
            },
          }));

          return uploadedUris;
        });
      },
      removeProfilePhoto: async (photoUri) => {
        set((state) => ({
          profile: {
            ...state.profile,
            photoUris: (state.profile.photoUris ?? []).filter((uri) => uri !== photoUri),
            updatedAt: new Date().toISOString(),
          },
        }));

        await withBusy(set, () => deleteCurrentUserProfilePhoto(photoUri));
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
        await withBusy(set, () => createLike(profileId, message));
        return true;
      },
      replyToLike: async (likeId, message) => {
        const like = get().likes.find((item) => item.id === likeId);
        if (!like) {
          return undefined;
        }

        const chat = await withBusy(set, () => replyToLikeInSupabase(likeId, message));
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

        const message = await withBusy(set, () => sendChatMessageInSupabase(chatId, trimmedText));
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
        const readAt = new Date().toISOString();
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  unreadCount: 0,
                  messages: chat.messages.map((message) =>
                    message.senderId === 'me'
                      ? message
                      : {
                          ...message,
                          status: 'read',
                          readAt: message.readAt ?? readAt,
                        }
                  ),
                }
              : chat
          ),
        }));
        await withBusy(set, () => markChatReadInSupabase(chatId));
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
        await withBusy(set, () => signOut());
        set({
          ...initialPersistedState,
          discoverProfiles: [],
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
