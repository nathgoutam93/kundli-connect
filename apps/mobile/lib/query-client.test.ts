import { queryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';

describe('query architecture', () => {
  afterEach(() => queryClient.clear());

  it('scopes server-owned query keys by user', () => {
    expect(queryKeys.profile('user-a')).not.toEqual(queryKeys.profile('user-b'));
    expect(queryKeys.chatMessages('user-a', 'chat-a')).toEqual([
      'user',
      'user-a',
      'chat-messages',
      'chat-a',
    ]);
  });

  it('uses mobile-friendly cache defaults with transient query retries', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(300_000);
    expect(defaults.queries?.gcTime).toBe(1_800_000);
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('can clear all user-scoped query data on logout', () => {
    queryClient.setQueryData(queryKeys.profile('user-a'), { name: 'A' });
    queryClient.setQueryData(queryKeys.settings('user-a'), { likes: true });
    queryClient.clear();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
