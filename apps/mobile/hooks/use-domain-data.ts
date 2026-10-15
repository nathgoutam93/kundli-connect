import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DEFAULT_PROFILE } from '@/constants/mock-data';
import { type ChatMessage, type ChatPreview, type LikeItem } from '@/constants/mock-data';
import {
  appendMessage,
  applyMessageToPreviews,
  reconcileSentMessage,
  removeMessage,
  type MessagePages,
} from '@/lib/chat-cache';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import { purchaseProduct, type CheckoutCustomer, type ProductType } from '@/services/checkout';
import {
  dismissLike,
  getActivity,
  getCreditAccount,
  getCreditPacks,
  getSettings,
  getSentLikes,
  getSubscription,
  getSubscriptionPlans,
  passProfile,
  updateSettings,
} from '@/services/supabase-domain-service';
import {
  applyProfileRow,
  createLike,
  deleteCurrentUserProfilePhoto,
  generateCurrentUserKundli,
  generateMatchScore,
  getChats,
  getChatMessages,
  getCurrentUserKundliSummary,
  getCurrentUserProfile,
  getDiscoverProfiles,
  KUNDLI_CHART_URL_TTL_SECONDS,
  getPendingIncomingLikes,
  markChatRead,
  replyToLike,
  sendMessage,
  updateCurrentUserProfile,
  updateCurrentUserProfilePhotoOrder,
  uploadCurrentUserProfilePhoto,
} from '@/services/supabase-auth-service';

const profileStaleTime = 5 * 60 * 1000;

export function useProfileQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.profile(user?.id ?? 'anonymous'),
    queryFn: async () => {
      const row = await getCurrentUserProfile();
      return row
        ? Object.assign(applyProfileRow({ ...DEFAULT_PROFILE, id: user!.id }, row), {
            _onboardingCompleted: row.onboarding_completed,
          })
        : Object.assign({ ...DEFAULT_PROFILE, id: user!.id }, { _onboardingCompleted: false });
    },
    enabled: Boolean(user),
    staleTime: profileStaleTime,
  });
}

export function useKundliQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.kundli(user?.id ?? 'anonymous'),
    queryFn: getCurrentUserKundliSummary,
    enabled: Boolean(user),
    // Chart images use signed URLs; refetch before they expire rather than caching forever.
    staleTime: (KUNDLI_CHART_URL_TTL_SECONDS - 10 * 60) * 1000,
  });
}

export function useDiscoverProfilesQuery() {
  const { user } = useAuth();
  return useQuery({ queryKey: queryKeys.discoverProfiles(user?.id ?? 'anonymous'), queryFn: getDiscoverProfiles, enabled: Boolean(user) });
}

export function useIncomingLikesQuery() {
  const { user } = useAuth();
  return useQuery({ queryKey: queryKeys.incomingLikes(user?.id ?? 'anonymous'), queryFn: getPendingIncomingLikes, enabled: Boolean(user) });
}

export function useSentLikesQuery() {
  const { user } = useAuth();
  return useQuery({ queryKey: queryKeys.sentLikes(user?.id ?? 'anonymous'), queryFn: getSentLikes, enabled: Boolean(user) });
}

export function useChatsQuery() {
  const { user } = useAuth();
  return useQuery({ queryKey: queryKeys.chatPreviews(user?.id ?? 'anonymous'), queryFn: getChats, enabled: Boolean(user) });
}

export function useChatMessagesInfiniteQuery(chatId: string) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: queryKeys.chatMessages(user?.id ?? 'anonymous', chatId),
    queryFn: ({ pageParam }) => getChatMessages(chatId, { before: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.hasMoreMessages ? page.messages[0]?.createdAt : undefined,
    enabled: Boolean(user && chatId),
  });
}

export function useAccountQueries() {
  const { user } = useAuth();
  const id = user?.id ?? 'anonymous';
  return {
    activity: useQuery({ queryKey: queryKeys.activity(id), queryFn: getActivity, enabled: Boolean(user) }),
    credits: useQuery({ queryKey: queryKeys.creditAccount(id), queryFn: getCreditAccount, enabled: Boolean(user) }),
    settings: useQuery({ queryKey: queryKeys.settings(id), queryFn: getSettings, enabled: Boolean(user), staleTime: profileStaleTime }),
    subscription: useQuery({ queryKey: queryKeys.subscription(id), queryFn: getSubscription, enabled: Boolean(user), staleTime: profileStaleTime }),
    plans: useQuery({ queryKey: queryKeys.subscriptionPlans, queryFn: getSubscriptionPlans, enabled: Boolean(user), staleTime: profileStaleTime }),
    creditPacks: useQuery({ queryKey: queryKeys.creditPacks, queryFn: getCreditPacks, enabled: Boolean(user), staleTime: profileStaleTime }),
  };
}

export function useDomainMutations() {
  const { user } = useAuth();
  const client = useQueryClient();
  const id = user?.id ?? 'anonymous';
  const invalidate = (...keys: readonly (readonly unknown[])[]) =>
    Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
  return {
    updateProfile: useMutation({
      mutationFn: ({ profile, onboardingCompleted }: { profile: typeof DEFAULT_PROFILE; onboardingCompleted?: boolean }) =>
        updateCurrentUserProfile(profile, { onboardingCompleted }),
      onSuccess: () => invalidate(queryKeys.profile(id), queryKeys.discoverProfiles(id)),
    }),
    generateKundli: useMutation({
      mutationFn: generateCurrentUserKundli,
      onSuccess: () => invalidate(queryKeys.profile(id), queryKeys.kundli(id)),
    }),
    generateCompatibility: useMutation({ mutationFn: generateMatchScore }),
    passProfile: useMutation({
      mutationFn: passProfile,
      onMutate: async (profileId) => {
        await client.cancelQueries({ queryKey: queryKeys.discoverProfiles(id) });
        const previous = client.getQueryData(queryKeys.discoverProfiles(id));
        client.setQueryData(queryKeys.discoverProfiles(id), (profiles: { id: string }[] = []) => profiles.filter((p) => p.id !== profileId));
        return { previous };
      },
      onError: (_error, _id, context) => client.setQueryData(queryKeys.discoverProfiles(id), context?.previous),
      onSettled: () => invalidate(queryKeys.discoverProfiles(id)),
    }),
    sendLike: useMutation({
      mutationFn: ({ profileId, message }: { profileId: string; message: string }) => createLike(profileId, message),
      onSuccess: () => invalidate(queryKeys.discoverProfiles(id), queryKeys.sentLikes(id), queryKeys.creditAccount(id), queryKeys.activity(id)),
    }),
    replyToLike: useMutation({
      mutationFn: ({ likeId, message }: { likeId: string; message: string }) => replyToLike(likeId, message),
      onSuccess: () => invalidate(queryKeys.incomingLikes(id), queryKeys.chatPreviews(id), queryKeys.activity(id)),
    }),
    dismissLike: useMutation({
      mutationFn: dismissLike,
      onMutate: async (likeId) => {
        await client.cancelQueries({ queryKey: queryKeys.incomingLikes(id) });
        const previous = client.getQueryData<LikeItem[]>(queryKeys.incomingLikes(id));
        client.setQueryData<LikeItem[]>(queryKeys.incomingLikes(id), (likes = []) => likes.filter((like) => like.id !== likeId));
        return { previous };
      },
      onError: (_error, _likeId, context) => client.setQueryData(queryKeys.incomingLikes(id), context?.previous),
      onSettled: () => invalidate(queryKeys.incomingLikes(id)),
    }),
    sendMessage: useMutation({
      mutationFn: ({ chatId, text }: { chatId: string; text: string; pending: ChatMessage }) => sendMessage(chatId, text),
      // Show the message immediately; Realtime or the response then swaps in the saved copy.
      onMutate: async ({ chatId, pending }) => {
        const messagesKey = queryKeys.chatMessages(id, chatId);
        await Promise.all([
          client.cancelQueries({ queryKey: messagesKey }),
          client.cancelQueries({ queryKey: queryKeys.chatPreviews(id) }),
        ]);
        const previousPreviews = client.getQueryData<ChatPreview[]>(queryKeys.chatPreviews(id));
        client.setQueryData<MessagePages>(messagesKey, (data) => appendMessage(data, pending));
        const previews = applyMessageToPreviews(previousPreviews, chatId, pending);
        if (previews) {
          client.setQueryData(queryKeys.chatPreviews(id), previews);
        }
        return { previousPreviews };
      },
      onSuccess: (saved, { chatId, pending }) => {
        client.setQueryData<MessagePages>(queryKeys.chatMessages(id, chatId), (data) =>
          reconcileSentMessage(data, pending.id, saved)
        );
      },
      onError: (_error, { chatId, pending }, context) => {
        client.setQueryData<MessagePages>(queryKeys.chatMessages(id, chatId), (data) => removeMessage(data, pending.id));
        client.setQueryData(queryKeys.chatPreviews(id), context?.previousPreviews);
      },
    }),
    markRead: useMutation({
      mutationFn: markChatRead,
      onMutate: async (chatId) => {
        await client.cancelQueries({ queryKey: queryKeys.chatPreviews(id) });
        const previous = client.getQueryData<ChatPreview[]>(queryKeys.chatPreviews(id));
        client.setQueryData<ChatPreview[]>(queryKeys.chatPreviews(id), (chats = []) =>
          chats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat))
        );
        return { previous };
      },
      onError: (_error, _chatId, context) => client.setQueryData(queryKeys.chatPreviews(id), context?.previous),
    }),
    purchase: useMutation({
      mutationFn: ({ type, productId, customer }: { type: ProductType; productId: string; customer: CheckoutCustomer }) =>
        purchaseProduct({ type, id: productId }, customer),
      // Refresh even after cancelled/failed attempts: a webhook may have completed it meanwhile.
      onSettled: () => invalidate(queryKeys.creditAccount(id), queryKeys.subscription(id), queryKeys.activity(id)),
    }),
    updateSettings: useMutation({
      mutationFn: ({ notifications, privacy }: Parameters<typeof updateSettings> extends [infer A, infer B] ? { notifications: A; privacy: B } : never) =>
        updateSettings(notifications, privacy),
      onSuccess: () => invalidate(queryKeys.settings(id), queryKeys.discoverProfiles(id)),
    }),
    addPhotos: useMutation({
      mutationFn: async ({ uris, existingCount }: { uris: string[]; existingCount: number }) =>
        Promise.all(uris.map((uri, index) => uploadCurrentUserProfilePhoto(uri, existingCount + index))),
      onSuccess: () => invalidate(queryKeys.profile(id), queryKeys.discoverProfiles(id)),
    }),
    removePhoto: useMutation({
      mutationFn: deleteCurrentUserProfilePhoto,
      onSuccess: () => invalidate(queryKeys.profile(id), queryKeys.discoverProfiles(id)),
    }),
    reorderPhotos: useMutation({
      mutationFn: updateCurrentUserProfilePhotoOrder,
      onSuccess: () => invalidate(queryKeys.profile(id), queryKeys.discoverProfiles(id)),
    }),
  };
}
