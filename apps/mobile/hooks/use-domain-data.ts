import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DEFAULT_PROFILE } from '@/constants/mock-data';
import { type ChatMessage, type ChatPreview, type LikeItem } from '@/constants/mock-data';
import {
  appendMessage,
  applyMessageToPreviewPages,
  markPreviewPagesRead,
  reconcileSentMessage,
  removeMessage,
  type MessagePages,
} from '@/lib/chat-cache';
import { flattenList, mapListPages, type ListCursor, type ListPages } from '@/lib/list-pages';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import { purchaseProduct, type CheckoutCustomer, type ProductType } from '@/services/checkout';
import { getLatestInsights } from '@/services/insights-service';
import {
  dismissLike,
  getCreditAccount,
  getCreditPacks,
  getSettings,
  getSentLikes,
  getUnreadCounts,
  getSubscription,
  getSubscriptionPlans,
  passProfile,
  markIncomingLikesRead,
  updateSettings,
} from '@/services/supabase-domain-service';
import {
  applyProfileRow,
  ensureCurrentUserProfile,
  createLike,
  generateCurrentUserKundli,
  generateMatchScore,
  getChats,
  getChatMessages,
  getCurrentUserKundliSummary,
  getCurrentUserProfile,
  getDiscoverProfiles,
  getOwnPublicProfile,
  getSkippedProfiles,
  type SkippedCursor,
  KUNDLI_CHART_URL_TTL_SECONDS,
  getPendingIncomingLikes,
  markChatRead,
  replyToLike,
  sendMessage,
  updateCurrentUserProfile,
} from '@/services/supabase-auth-service';

import { uploadProfilePhotos, uploadProfilePhoto, removeProfilePhoto, reorderProfilePhotos } from '@/services/profile-photo-service';

const profileStaleTime = 5 * 60 * 1000;

export function useProfileQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.profile(user?.id ?? 'anonymous'),
    queryFn: async () => {
      let row = await getCurrentUserProfile();
      if (!row) {
        await ensureCurrentUserProfile();
        row = await getCurrentUserProfile();
      }
      if (!row || row.id !== user!.id) throw new Error("Your profile could not be loaded. Please try again.");
      return {
        ...applyProfileRow({ ...DEFAULT_PROFILE, id: user!.id }, row),
        _onboardingCompleted: row.onboarding_completed,
      };
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

export function useInsightsQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.insights(user?.id ?? 'anonymous'),
    queryFn: getLatestInsights,
    enabled: Boolean(user),
    // Insights change once a week.
    staleTime: 60 * 60 * 1000,
  });
}

export function useDiscoverProfilesQuery() {
  const { user } = useAuth();
  return useQuery({ queryKey: queryKeys.discoverProfiles(user?.id ?? 'anonymous'), queryFn: getDiscoverProfiles, enabled: Boolean(user) });
}

export function useIncomingLikesQuery() {
  const { user } = useAuth();
  return useInfiniteQuery({ queryKey: queryKeys.incomingLikes(user?.id ?? 'anonymous'), queryFn: ({ pageParam }) => getPendingIncomingLikes(pageParam),
    initialPageParam:undefined as ListCursor | undefined,getNextPageParam:(page) => page.nextCursor,select:flattenList,enabled:Boolean(user) });
}

export function useOwnPublicProfileQuery() {
  const { user } = useAuth();
  return useQuery({ queryKey:queryKeys.publicProfile(user?.id ?? 'anonymous'),queryFn:getOwnPublicProfile,enabled:Boolean(user) });
}
export function useUnreadCountsQuery() {
  const { user } = useAuth();
  return useQuery({ queryKey:queryKeys.unreadCounts(user?.id ?? 'anonymous'),queryFn:getUnreadCounts,enabled:Boolean(user),staleTime:10_000 });
}

export function useSkippedProfilesQuery() {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: queryKeys.skippedProfiles(user?.id ?? 'anonymous'),
    queryFn: ({ pageParam }) => getSkippedProfiles(pageParam),
    initialPageParam: undefined as SkippedCursor | undefined,
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(user),
  });
}

export function useSentLikesQuery() {
  const { user } = useAuth();
  return useInfiniteQuery({ queryKey: queryKeys.sentLikes(user?.id ?? 'anonymous'), queryFn: ({ pageParam }) => getSentLikes(pageParam),
    initialPageParam:undefined as ListCursor | undefined,getNextPageParam:(page) => page.nextCursor,select:flattenList,enabled:Boolean(user) });
}

export function useChatsQuery() {
  const { user } = useAuth();
  return useInfiniteQuery({ queryKey: queryKeys.chatPreviews(user?.id ?? 'anonymous'), queryFn: ({ pageParam }) => getChats(undefined,pageParam),
    initialPageParam:undefined as ListCursor | undefined,getNextPageParam:(page) => page.nextCursor,select:flattenList,enabled:Boolean(user) });
}

export function useChatPreviewQuery(chatId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...queryKeys.chatPreviews(user?.id ?? 'anonymous'), chatId],
    queryFn: async () => (await getChats(chatId)).items[0] ?? null,
    enabled: Boolean(user && chatId),
    staleTime: 0,
  });
}

export function useChatMessagesInfiniteQuery(chatId: string) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: queryKeys.chatMessages(user?.id ?? 'anonymous', chatId),
    queryFn: ({ pageParam }) => getChatMessages(chatId, { before: pageParam, limit: 30 }),
    initialPageParam: undefined as ListCursor | undefined,
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(user && chatId),
  });
}

export function useAccountQueries() {
  const { user } = useAuth();
  const id = user?.id ?? 'anonymous';
  return {
    credits: useQuery({ queryKey: queryKeys.creditAccount(id), queryFn: getCreditAccount, enabled: Boolean(user) }),
    settings: useQuery({ queryKey: queryKeys.settings(id), queryFn: getSettings, enabled: Boolean(user), staleTime: profileStaleTime }),
    subscription: useQuery({ queryKey: queryKeys.subscription(id), queryFn: getSubscription, enabled: Boolean(user), staleTime: 0, refetchOnWindowFocus: true }),
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
      scope: { id: `profile:${id}` },
      mutationFn: async ({ updates, onboardingCompleted }: { updates: Partial<typeof DEFAULT_PROFILE>; onboardingCompleted?: boolean }) => {
        await client.cancelQueries({ queryKey: queryKeys.profile(id) });
        const current = client.getQueryData<typeof DEFAULT_PROFILE>(queryKeys.profile(id));
        return updateCurrentUserProfile(updates, { onboardingCompleted, expectedUserId: id, expectedUpdatedAt: current?.updatedAt });
      },
      onSuccess: async (row) => {
        if (!client.getQueryState(queryKeys.profile(id))) return;
        await client.cancelQueries({ queryKey: queryKeys.profile(id) });
        client.setQueryData(queryKeys.profile(id), {
          ...applyProfileRow({ ...DEFAULT_PROFILE, id }, row),
          _onboardingCompleted: row.onboarding_completed,
        });
        await invalidate(queryKeys.discoverProfiles(id), queryKeys.skippedProfiles(id),queryKeys.publicProfile(id));
      },
      onError: () => invalidate(queryKeys.profile(id)),
    }),
    generateKundli: useMutation({
      mutationFn: generateCurrentUserKundli,
      onSuccess: () => invalidate(queryKeys.profile(id), queryKeys.kundli(id)),
    }),
    generateCompatibility: useMutation({
      mutationFn: (profileId: string) => generateMatchScore(profileId,id),
      onSuccess: (compatibility, profileId) => {
        client.setQueryData(queryKeys.discoverProfiles(id), (profiles: { id: string; compatibility: unknown }[] | undefined) =>
          profiles?.map((profile) => profile.id === profileId ? { ...profile, compatibility } : profile));
      },
      onSettled: () => invalidate(queryKeys.creditAccount(id), queryKeys.incomingLikes(id), queryKeys.chatPreviews(id)),
    }),
    passProfile: useMutation({
      mutationFn: passProfile,
      onMutate: async (profileId) => {
        await client.cancelQueries({ queryKey: queryKeys.discoverProfiles(id) });
        const previous = client.getQueryData(queryKeys.discoverProfiles(id));
        client.setQueryData(queryKeys.discoverProfiles(id), (profiles: { id: string }[] = []) => profiles.filter((p) => p.id !== profileId));
        return { previous };
      },
      onError: (_error, _id, context) => client.setQueryData(queryKeys.discoverProfiles(id), context?.previous),
      onSettled: () => invalidate(queryKeys.discoverProfiles(id), queryKeys.skippedProfiles(id)),
    }),
    sendLike: useMutation({
      mutationFn: ({ profileId, message }: { profileId: string; message: string }) => createLike(profileId, message),
      // Like pass, the profile leaves Discover straight away and comes back if the like fails.
      onMutate: async ({ profileId }) => {
        await client.cancelQueries({ queryKey: queryKeys.discoverProfiles(id) });
        const previous = client.getQueryData(queryKeys.discoverProfiles(id));
        client.setQueryData(queryKeys.discoverProfiles(id), (profiles: { id: string }[] = []) => profiles.filter((p) => p.id !== profileId));
        return { previous };
      },
      onError: (_error, _vars, context) => client.setQueryData(queryKeys.discoverProfiles(id), context?.previous),
      onSuccess: () => invalidate(queryKeys.discoverProfiles(id), queryKeys.skippedProfiles(id), queryKeys.sentLikes(id), queryKeys.creditAccount(id)),
    }),
    replyToLike: useMutation({
      mutationFn: ({ likeId, message }: { likeId: string; message: string }) => replyToLike(likeId, message, id),
      onSuccess: () => invalidate(queryKeys.incomingLikes(id), queryKeys.chatPreviews(id),queryKeys.unreadCounts(id)),
    }),
    dismissLike: useMutation({
      mutationFn: dismissLike,
      onMutate: async (likeId) => {
        await client.cancelQueries({ queryKey: queryKeys.incomingLikes(id) });
        const previous = client.getQueryData<ListPages<LikeItem>>(queryKeys.incomingLikes(id));
        client.setQueryData<ListPages<LikeItem>>(queryKeys.incomingLikes(id), (data) => mapListPages(data,(likes) => likes.filter((like) => like.id !== likeId)));
        return { previous };
      },
      onError: (_error, _likeId, context) => client.setQueryData(queryKeys.incomingLikes(id), context?.previous),
      onSettled: () => invalidate(queryKeys.incomingLikes(id),queryKeys.unreadCounts(id)),
    }),
    sendMessage: useMutation({
      mutationFn: ({ chatId, requestTargetId, text, pending }: { chatId: string; requestTargetId?: string; text: string; pending: ChatMessage }) => sendMessage(requestTargetId ?? chatId, text, pending.clientRequestId, id),
      // Show the message immediately; Realtime or the response then swaps in the saved copy.
      onMutate: async ({ chatId, pending }) => {
        const messagesKey = queryKeys.chatMessages(id, chatId);
        await Promise.all([
          client.cancelQueries({ queryKey: messagesKey }),
          client.cancelQueries({ queryKey: queryKeys.chatPreviews(id) }),
        ]);
        const previousPreviews = client.getQueryData<ListPages<ChatPreview>>(queryKeys.chatPreviews(id));
        client.setQueryData<MessagePages>(messagesKey, (data) => appendMessage(data, pending));
        const previews = applyMessageToPreviewPages(previousPreviews, chatId, pending);
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
      onSettled: () => invalidate(queryKeys.chatPreviews(id)),
    }),
    markRead: useMutation({
      mutationFn: markChatRead,
      onMutate: async (chatId) => {
        const previous = client.getQueryData<ListPages<ChatPreview>>(queryKeys.chatPreviews(id));
        if (previous) {
          await client.cancelQueries({ queryKey: queryKeys.chatPreviews(id), exact: true });
          client.setQueryData<ListPages<ChatPreview>>(queryKeys.chatPreviews(id), (data) => markPreviewPagesRead(data, chatId));
        }
        return { previous };
      },
      onError: (_error, _chatId, context) => {
        if (context?.previous) client.setQueryData(queryKeys.chatPreviews(id), context.previous);
      },
      onSettled: () => invalidate(queryKeys.chatPreviews(id),queryKeys.unreadCounts(id)),
    }),
    purchase: useMutation({
      mutationFn: ({ type, productId, customer }: { type: ProductType; productId: string; customer: CheckoutCustomer }) =>
        purchaseProduct({ type, id: productId }, customer),
      // Refresh even after cancelled/failed attempts: a webhook may have completed it meanwhile.
      onSettled: () => invalidate(queryKeys.creditAccount(id), queryKeys.subscription(id)),
    }),
    updateSettings: useMutation({
      scope: { id: `settings:${id}` },
      mutationFn: (updates: Parameters<typeof updateSettings>[0]) => updateSettings(updates, id),
      onSuccess: () => invalidate(queryKeys.settings(id), queryKeys.discoverProfiles(id),queryKeys.publicProfile(id)),
    }),
    markLikesRead: useMutation({
      mutationFn: markIncomingLikesRead,
      onSuccess: async (_data, ids) => {
        await client.cancelQueries({ queryKey: queryKeys.incomingLikes(id) });
        client.setQueryData<ListPages<LikeItem>>(queryKeys.incomingLikes(id), (data) => mapListPages(data,(likes) =>
          likes.map((like) => ids.includes(like.id) && !like.readAt ? { ...like, readAt: new Date().toISOString() } : like)));
        await invalidate(queryKeys.incomingLikes(id),queryKeys.unreadCounts(id));
      },
    }),
    addPhotos: useMutation({
      scope: { id: `photos:${id}` },
      mutationFn: ({ uris }: { uris: string[] }) => uploadProfilePhotos(uris, id),
      onSettled: () => invalidate(queryKeys.profile(id), queryKeys.discoverProfiles(id),queryKeys.publicProfile(id)),
    }),
    replacePhoto: useMutation({
      scope: { id: `photos:${id}` },
      mutationFn: ({ uri, previous }: { uri: string; previous: string }) => uploadProfilePhoto(uri, previous, id),
      onSettled: () => invalidate(queryKeys.profile(id), queryKeys.discoverProfiles(id),queryKeys.publicProfile(id)),
    }),
    removePhoto: useMutation({
      scope: { id: `photos:${id}` },
      mutationFn: (reference: string) => removeProfilePhoto(reference, id),
      onSuccess: () => invalidate(queryKeys.profile(id), queryKeys.discoverProfiles(id),queryKeys.publicProfile(id)),
    }),
    reorderPhotos: useMutation({
      scope: { id: `photos:${id}` },
      mutationFn: (references: string[]) => reorderProfilePhotos(references, id),
      onSuccess: () => invalidate(queryKeys.profile(id), queryKeys.discoverProfiles(id),queryKeys.publicProfile(id)),
    }),
  };
}
