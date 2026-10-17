import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { DEFAULT_PROFILE } from '@/constants/mock-data';
import { queryKeys } from '@/lib/query-keys';
import { generateMatchScore, getPendingIncomingLikes, markChatRead, sendMessage, updateCurrentUserProfile } from '@/services/supabase-auth-service';
import { useDomainMutations, useIncomingLikesQuery, useUnreadCountsQuery } from './use-domain-data';
import { getUnreadCounts, markIncomingLikesRead, updateSettings } from '@/services/supabase-domain-service';

jest.mock('@/services/supabase-domain-service', () => ({ updateSettings: jest.fn(), markIncomingLikesRead: jest.fn(), getUnreadCounts: jest.fn() }));

jest.mock('@/services/profile-photo-service', () => ({ uploadProfilePhotos: jest.fn(), uploadProfilePhoto: jest.fn(), removeProfilePhoto: jest.fn(), reorderProfilePhotos: jest.fn() }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/services/supabase-auth-service', () => ({
  updateCurrentUserProfile: jest.fn(),
  markChatRead: jest.fn(),
  sendMessage: jest.fn(),
  generateMatchScore: jest.fn(),
  getPendingIncomingLikes: jest.fn(),
  applyProfileRow: (base: object, row: { display_name: string }) => ({ ...base, name: row.display_name }),
}));

function pages<T>(items: T[]) { return { pages: [{ items }], pageParams: [undefined] }; }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useDomainMutations(), { wrapper }) };
}

test('marking a chat read while previews are loading leaves the pending list intact', async () => {
  const { client, result, unmount } = setup();
  let resolvePreviews!: (value: ReturnType<typeof pages<{ id: string; unreadCount: number }>>) => void;
  const pending = client.fetchQuery({ queryKey: queryKeys.chatPreviews('me'), queryFn: () => new Promise((resolve) => { resolvePreviews = resolve; }) });
  jest.mocked(markChatRead).mockResolvedValue('now');
  await act(async () => { await result.current.markRead.mutateAsync('chat'); });
  expect(client.getQueryData(queryKeys.chatPreviews('me'))).toBeUndefined();
  resolvePreviews(pages([{ id: 'chat', unreadCount: 0 }]));
  await pending;
  expect(client.getQueryData(queryKeys.chatPreviews('me'))).toEqual(pages([{ id: 'chat', unreadCount: 0 }]));
  unmount();
  client.clear();
});

test('failed profile saves preserve confirmed cached values and onboarding status', async () => {
  const { client, result, unmount } = setup();
  const saved = { ...DEFAULT_PROFILE, id: 'me', bio: 'My saved bio', _onboardingCompleted: true };
  client.setQueryData(queryKeys.profile('me'), saved);
  jest.mocked(updateCurrentUserProfile).mockRejectedValue(new Error('Offline'));
  await act(async () => {
    await expect(result.current.updateProfile.mutateAsync({ updates: { bio: 'Unsaved draft' } })).rejects.toThrow('Offline');
  });
  expect(client.getQueryData(queryKeys.profile('me'))).toEqual(saved);
  expect(updateCurrentUserProfile).toHaveBeenLastCalledWith({ bio: 'Unsaved draft' }, { expectedUserId: 'me', expectedUpdatedAt: saved.updatedAt, onboardingCompleted: undefined });
  unmount();
  client.clear();
});

test('profile writes serialize across hook instances for the same user', async () => {
  const { client, wrapper } = (() => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
    return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
  })();
  client.setQueryData(queryKeys.profile('me'), { ...DEFAULT_PROFILE, _onboardingCompleted: false });
  const hooks = renderHook(() => [useDomainMutations(), useDomainMutations()] as const, { wrapper });
  let release!: () => void;
  jest.mocked(updateCurrentUserProfile).mockReset();
  jest.mocked(updateCurrentUserProfile)
    .mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { id: 'me', display_name: 'Saved', onboarding_completed: false } as Awaited<ReturnType<typeof updateCurrentUserProfile>>;
    })
    .mockResolvedValue({ id: 'me', display_name: 'Saved', onboarding_completed: false } as Awaited<ReturnType<typeof updateCurrentUserProfile>>);
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = hooks.result.current[0].updateProfile.mutateAsync({ updates: { height: '170 cm' } });
    second = hooks.result.current[1].updateProfile.mutateAsync({ updates: { religiousBeliefs: 'Hindu' } });
  });
  await waitFor(() => expect(updateCurrentUserProfile).toHaveBeenCalledTimes(1));
  await act(async () => { release(); await Promise.all([first, second]); });
  expect(updateCurrentUserProfile).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(queryKeys.profile('me'))).toMatchObject({ _onboardingCompleted: false });
  hooks.unmount();
  client.clear();
});

test('a match score refreshes credits and stores only the returned report', async () => {
  const { client, result, unmount } = setup();
  const report = { id: 'real', generatedAt: '2026-10-16T00:00:00Z', overallScore: 0, summary: '', breakdown: [], yogas: [], doshas: [] };
  client.setQueryData(queryKeys.creditAccount('me'), { balance: 5 });
  client.setQueryData(queryKeys.discoverProfiles('me'), [{ id: 'other', compatibility: null }]);
  jest.mocked(generateMatchScore).mockResolvedValue(report);
  await act(async () => { await result.current.generateCompatibility.mutateAsync('other'); });
  expect(client.getQueryState(queryKeys.creditAccount('me'))?.isInvalidated).toBe(true);
  expect(client.getQueryData(queryKeys.discoverProfiles('me'))).toEqual([{ id: 'other', compatibility: report }]);
  unmount();
  client.clear();
});

test('rapid settings patches serialize and retain both independently changed fields', async () => {
  const { client, result, unmount } = setup();
  let release!: () => void;
  jest.mocked(updateSettings).mockReset().mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => { release = resolve; });
  }).mockResolvedValue(undefined);
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = result.current.updateSettings.mutateAsync({ notifications: { likes: false } });
    second = result.current.updateSettings.mutateAsync({ notifications: { messages: false } });
  });
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  await act(async () => { release(); await Promise.all([first,second]); });
  expect(jest.mocked(updateSettings).mock.calls.map(([patch]) => patch)).toEqual([
    { notifications: { likes: false } }, { notifications: { messages: false } },
  ]);
  unmount(); client.clear();
});

test('only successful read writes clear the badge in cached likes', async () => {
  const { client, result, unmount } = setup();
  client.setQueryData(queryKeys.incomingLikes('me'), pages([{ id: 'visible' }, { id: 'offscreen' }]));
  jest.mocked(markIncomingLikesRead).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
  await act(async () => { await expect(result.current.markLikesRead.mutateAsync(['visible'])).rejects.toThrow('Offline'); });
  expect(client.getQueryData(queryKeys.incomingLikes('me'))).toEqual(pages([{ id: 'visible' }, { id: 'offscreen' }]));
  await act(async () => { await result.current.markLikesRead.mutateAsync(['visible']); });
  expect(client.getQueryData(queryKeys.incomingLikes('me'))).toEqual(pages([{ id: 'visible', readAt: expect.any(String) }, { id: 'offscreen' }]));
  unmount(); client.clear();
});


test('a failed next page retains loaded likes and account-wide badges, then retries at the same cursor', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const cursor = { at: 'same-time', id: '30' };
  const first = Array.from({ length: 30 }, (_, n) => ({ id: String(n) })) as Awaited<ReturnType<typeof getPendingIncomingLikes>>['items'];
  const tail = Array.from({ length: 10 }, (_, n) => ({ id: String(n+30) })) as typeof first;
  jest.mocked(getPendingIncomingLikes).mockReset().mockResolvedValueOnce({ items: first, nextCursor: cursor }).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ items: tail });
  jest.mocked(getUnreadCounts).mockResolvedValue({ likes: 40, messages: 80 });
  const hook = renderHook(() => {
    const likes = useIncomingLikesQuery();
    const unread = useUnreadCountsQuery();
    return { likes, unread, failed: likes.isFetchNextPageError };
  }, { wrapper });
  await waitFor(() => expect(hook.result.current.likes.data).toHaveLength(30));
  await waitFor(() => expect(hook.result.current.unread.data?.likes).toBe(40));
  await act(async () => { await hook.result.current.likes.fetchNextPage(); });
  await waitFor(() => expect(hook.result.current.failed).toBe(true));
  expect(hook.result.current.likes.data).toHaveLength(30);
  expect(hook.result.current.unread.data).toEqual({ likes: 40, messages: 80 });
  await act(async () => { await hook.result.current.likes.fetchNextPage(); });
  await waitFor(() => expect(hook.result.current.likes.data).toHaveLength(40));
  expect(hook.result.current.likes.hasNextPage).toBe(false);
  expect(jest.mocked(getPendingIncomingLikes).mock.calls).toEqual([[undefined], [cursor], [cursor]]);
  hook.unmount(); client.clear();
});


test('a repaired chat uses its canonical message cache and keeps the original retry target', async () => {
  const { client, result, unmount } = setup();
  const pending = { id: 'pending-request', text: 'Retry me', createdAt: '2026-01-01', senderId: 'me', status: 'sent' as const, clientRequestId: 'request' };
  const saved = { ...pending, id: 'saved' };
  client.setQueryData(queryKeys.chatMessages('me', 'canonical'), { pages: [{ messages: [], hasMoreMessages: false }], pageParams: [undefined] });
  jest.mocked(sendMessage).mockResolvedValue(saved);
  await act(async () => { await result.current.sendMessage.mutateAsync({ chatId: 'canonical', requestTargetId: 'historical', text: pending.text, pending }); });
  expect(sendMessage).toHaveBeenLastCalledWith('historical', 'Retry me', 'request', 'me');
  expect(client.getQueryData(queryKeys.chatMessages('me', 'canonical'))).toMatchObject({ pages: [{ messages: [saved] }] });
  expect(client.getQueryData(queryKeys.chatMessages('me', 'historical'))).toBeUndefined();
  unmount(); client.clear();
});
