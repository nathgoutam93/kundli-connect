import { markIncomingLikesRead, updateSettings } from './supabase-domain-service';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } }, error: null }) },
  rpc: mockRpc,
}) }));
beforeEach(() => { mockRpc.mockReset().mockResolvedValue({ data: null, error: null }); });

test('sends only changed settings, including explicit false values', async () => {
  await updateSettings({ notifications: { likes: false } });
  await updateSettings({ privacy: { profileDiscoverable: false } });
  expect(mockRpc.mock.calls).toEqual([
    ['update_settings_fields', { p_updates: { notify_likes: false }, p_expected_user_id: 'me' }],
    ['update_settings_fields', { p_updates: { profile_discoverable: false }, p_expected_user_id: 'me' }],
  ]);
});

test('queued settings from a previous account cannot be written to the next account', async () => {
  await expect(updateSettings({ notifications: { likes: false } }, 'previous-account')).rejects.toThrow('session changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('failed setting and read writes reject instead of claiming success', async () => {
  mockRpc.mockResolvedValue({ error: new Error('Offline') });
  await expect(updateSettings({ notifications: { messages: false } })).rejects.toThrow('Offline');
  await expect(markIncomingLikesRead(['visible'])).rejects.toThrow('Offline');
});

test('only sends the IDs of viewed likes and ignores an empty set', async () => {
  await markIncomingLikesRead([]);
  expect(mockRpc).not.toHaveBeenCalled();
  await markIncomingLikesRead(['visible']);
  expect(mockRpc).toHaveBeenCalledWith('mark_incoming_likes_read', { p_ids: ['visible'] });
});
