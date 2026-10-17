import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { MessagePages, RealtimeMessageRow } from '@/lib/chat-cache';
import { queryKeys } from '@/lib/query-keys';
import { useRealtimeSync } from './use-realtime-sync';

let mockBirthChange: () => void;
let mockUpdate: (payload: { new: RealtimeMessageRow }) => void;
const mockChannel: { on: jest.Mock; subscribe: jest.Mock } = {
  on: jest.fn((_event: string, filter: { event: string; table: string }, callback: typeof mockUpdate) => {
    if (filter.event === 'UPDATE' && filter.table === 'messages') mockUpdate = callback;
    if (filter.table === 'user_data_versions') mockBirthChange = () => callback({ new: row });
    return mockChannel;
  }),
  subscribe: jest.fn(() => mockChannel),
};
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ channel: () => mockChannel, removeChannel: async () => undefined }) }));

const row: RealtimeMessageRow = { id: 'moved', chat_id: 'canonical', sender_id: 'them', body: 'Historical message', status: 'read', read_at: '2026-01-02', created_at: '2026-01-01' };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useRealtimeSync(), { wrapper });
  return { client, close: () => { hook.unmount(); client.clear(); } };
}

test('moving a historical message refreshes source-link resolution without creating an empty thread/list cache', () => {
  const { client, close } = setup();
  const sourceLink = [...queryKeys.chatPreviews('me'), 'historical'];
  client.setQueryData(sourceLink, { id: 'historical' });
  act(() => mockUpdate({ new: row }));
  expect(client.getQueryState(sourceLink)?.isInvalidated).toBe(true);
  expect(client.getQueryData(sourceLink)).toEqual({ id: 'historical' });
  expect(client.getQueryState(queryKeys.chatMessages('me', 'canonical'))).toBeUndefined();
  expect(client.getQueryState(queryKeys.chatPreviews('me'))).toBeUndefined();
  close();
});

test('a normal read receipt updates the loaded message while retaining its page cursor', () => {
  const { client, close } = setup();
  const cursor = { at: '2025-01-01', id: 'older' };
  const messagesKey = queryKeys.chatMessages('me', 'canonical');
  const start: MessagePages = { pages: [{ messages: [{ id: 'moved', senderId: 'them', text: row.body, createdAt: row.created_at, status: 'sent' }], hasMoreMessages: true, nextCursor: cursor }], pageParams: [undefined] };
  client.setQueryData(messagesKey, start);
  client.setQueryData(queryKeys.chatPreviews('me'), { pages: [{ items: [] }], pageParams: [undefined] });
  act(() => mockUpdate({ new: row }));
  const updated = client.getQueryData<MessagePages>(messagesKey)!;
  expect(updated.pages[0].messages[0]).toMatchObject({ status: 'read', readAt: row.read_at });
  expect(updated.pages[0].nextCursor).toBe(cursor);
  expect(client.getQueryState(queryKeys.chatPreviews('me'))?.isInvalidated).toBe(false);
  close();
});


test('a correction clears stale owner/partner reports and chart caches without removing the open message draft cache', () => {
  const { client, close } = setup();
  const keys = [queryKeys.profile('me'), queryKeys.kundli('me'), queryKeys.insights('me'), queryKeys.publicProfile('me'), queryKeys.discoverProfiles('me'), queryKeys.skippedProfiles('me'), queryKeys.incomingLikes('me'), [...queryKeys.chatPreviews('me'), 'open-chat']];
  for (const key of keys) client.setQueryData(key, { old: true });
  const pending = { pages: [{ messages: [{ id: 'pending-draft' }], hasMoreMessages: false }], pageParams: [undefined] };
  client.setQueryData(queryKeys.chatMessages('me', 'open-chat'), pending);
  client.setQueryData(queryKeys.kundli('other-account'), { old: 'other account' });
  act(() => mockBirthChange());
  for (const key of keys) expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryData(queryKeys.chatMessages('me', 'open-chat'))).toEqual(pending);
  expect(client.getQueryData(queryKeys.kundli('other-account'))).toEqual({ old: 'other account' });
  close();
});
