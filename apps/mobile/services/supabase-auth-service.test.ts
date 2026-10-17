// Fixtures are real output of the SQL functions in supabase/migrations, captured from a local
// database seeded with two matched users, one hidden profile and one new profile. Cards carry
// an age but no birth date or contact details.
import { getChats, getDiscoverProfiles, getPendingIncomingLikes, getSkippedProfiles, getChatMessages, getOwnPublicProfile, applyProfileRow } from '@/services/supabase-auth-service';
import { DEFAULT_PROFILE } from '@/constants/mock-data';

import fixtures from './__fixtures__/rpc-responses.json';

// jest.mock calls are hoisted above the imports by babel-jest.
const mockRpc = jest.fn();
const mockSingle = jest.fn();
const mockResolve = jest.fn();
beforeEach(() => { mockResolve.mockReset().mockImplementation((id: string) => ({ data: id, error: null })); });
const mockEq = jest.fn();
const mockFrom = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (name: string) => { mockFrom(name); return { select: () => ({ eq: (key: string, value: string) => { mockEq(key, value); return { single: mockSingle }; } }) }; },
    rpc: (name: string, args?: unknown) => name === 'resolve_chat_id' ? mockResolve((args as { p_chat_id: string }).p_chat_id) : mockRpc(name, args),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'aaaaaaaa-0000-0000-0000-000000000001' } } }, error: null }) },
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }) }) },
  }),
}));

test('maps the chat, like and discover RPC payloads into app models', async () => {
  mockRpc.mockImplementation(async (name: string) => ({
    data: name === 'get_chat_previews_page' ? fixtures.chats : name === 'get_incoming_likes_page' ? fixtures.likes : fixtures.discover,
    error: null,
  }));
  const { items: [chat] } = await getChats();
  expect(chat).toMatchObject({ name: 'Bela', avatarUrl: 'profile-photo://b/1.jpg', compatibilityScore: 78, hidden: false });
  expect(chat.participantProfile?.age).toBeGreaterThanOrEqual(28);
  expect(chat.messages[0]).toMatchObject({ senderId: 'me', status: 'read' });
  expect(chat.participantProfile?.details.find((d) => d.label === 'work')).toBeUndefined();

  const { items: [like] } = await getPendingIncomingLikes();
  expect(like).toMatchObject({ fromName: 'Bela', openingMessage: 'hey dev', avatarUrl: 'profile-photo://b/1.jpg' });

  const discover = await getDiscoverProfiles();
  expect(discover.map((p) => p.name)).toEqual(['Dev']);
  expect(discover[0].photos).toEqual([]);
});

test('missing reports and empty biographies remain absent throughout service mapping', async () => {
  mockRpc.mockImplementation(async (name: string) => ({ data: name === 'get_chat_previews_page'
    ? fixtures.chats.map((row) => ({ ...row, compatibility_report: null }))
    : name === 'get_incoming_likes_page' ? fixtures.likes : fixtures.discover.map((row) => ({ ...row, bio: null })), error: null }));
  expect((await getChats()).items[0]).toMatchObject({ compatibilityScore: null });
  expect((await getPendingIncomingLikes()).items[0].compatibility).toBeNull();
  expect((await getDiscoverProfiles())[0]).toMatchObject({ bio: '', compatibility: null });
});

test('read timestamps survive service mapping and legacy cities are never shown as India', async () => {
  mockRpc.mockResolvedValue({ data: fixtures.likes.map((row) => ({ ...row, read_at: '2026-10-17T00:00:00Z', profile: { ...row.profile, location: 'India' } })), error: null });
  expect((await getPendingIncomingLikes()).items[0]).toMatchObject({ readAt: '2026-10-17T00:00:00Z', location: 'City not set' });
  const legacy = { ...fixtures.discover[0], location: null } as unknown as Parameters<typeof applyProfileRow>[1];
  expect(applyProfileRow({ ...DEFAULT_PROFILE, location: 'India' }, legacy).location).toBe('');
});

test('skipped requests send a deterministic cursor to their own RPC', async () => {
  mockRpc.mockResolvedValue({ data: fixtures.discover, error: null });
  const cursor = { createdAt: '2026-10-17T00:00:00Z', id: 'last-profile' };
  const page = await getSkippedProfiles(cursor);
  expect(mockRpc).toHaveBeenLastCalledWith('get_skipped_profiles', { p_limit: 50, p_before: cursor.createdAt, p_before_id: cursor.id });
  expect(page.profiles.map((profile) => profile.name)).toEqual(['Dev']);
  expect(page.nextCursor).toBeUndefined();
});


test('direct chat lookups send the ID into the bounded server query', async () => {
  mockRpc.mockResolvedValue({ data: fixtures.chats, error: null });
  await getChats('older-chat');
  expect(mockRpc).toHaveBeenLastCalledWith('get_chat_previews_page', { p_limit: 1, p_before: null, p_before_id: null, p_chat_id: 'older-chat' });
});

test('message lookahead carries both timestamp and ID, including tied timestamps', async () => {
  const rows = Array.from({ length: 31 }, (_, n) => ({ id: String(31-n), created_at: '2026-10-17T00:00:00Z', sender_id: 'other', body: String(n), status: 'sent' }));
  mockRpc.mockResolvedValue({ data: rows, error: null });
  const page = await getChatMessages('chat');
  expect(page.messages.map((message) => message.id)).toEqual(rows.slice(0, 30).reverse().map((row) => row.id));
  expect(page.nextCursor).toEqual({ at: rows[29].created_at, id: rows[29].id });
  await getChatMessages('chat', { before: page.nextCursor });
  expect(mockRpc).toHaveBeenLastCalledWith('get_chat_messages_page', { p_chat_id: 'chat', p_limit: 31, p_before: rows[29].created_at, p_before_id: rows[29].id });
});

test('own preview and Discover share the same public-card mapping and omit hidden details', async () => {
  const row = { ...fixtures.discover[0], bio: null, workplace: 'Hidden', workplace_visible_on_profile: false, job_role: 'Hidden', job_role_visible_on_profile: false, school: 'Hidden', school_visible_on_profile: false, education_level: 'Hidden', education_level_visible_on_profile: false, family_plans: 'Hidden', family_plans_visible_on_profile: false, drinking: 'Hidden', drinking_visible_on_profile: false, smoking: 'Hidden', smoking_visible_on_profile: false };
  mockSingle.mockResolvedValue({ data: row, error: null });
  mockRpc.mockResolvedValue({ data: [row], error: null });
  const preview = await getOwnPublicProfile();
  expect(preview).toEqual((await getDiscoverProfiles())[0]);
  expect(preview.bio).toBe('');
  expect(preview.details.some((detail) => ['work', 'education', 'family', 'drinking', 'smoking'].includes(detail.label))).toBe(false);
  expect(mockFrom).toHaveBeenLastCalledWith('profile_cards');
  expect(mockEq).toHaveBeenLastCalledWith('id', 'aaaaaaaa-0000-0000-0000-000000000001');
  mockSingle.mockResolvedValue({ data: null, error: new Error('Offline') });
  await expect(getOwnPublicProfile()).rejects.toThrow('Offline');
});


test('historical chat links resolve before fetching the preview and fail closed when access ends', async () => {
  mockResolve.mockResolvedValue({ data: 'canonical', error: null });
  mockRpc.mockResolvedValue({ data: fixtures.chats, error: null });
  await getChats('historical');
  expect(mockResolve).toHaveBeenLastCalledWith('historical');
  expect(mockRpc).toHaveBeenLastCalledWith('get_chat_previews_page', { p_chat_id: 'canonical', p_limit: 1, p_before: null, p_before_id: null });
  mockRpc.mockClear();
  mockResolve.mockResolvedValue({ data: null, error: null });
  expect((await getChats('historical')).items).toEqual([]);
  expect(mockRpc).not.toHaveBeenCalled();
  mockResolve.mockResolvedValue({ data: null, error: new Error('Offline') });
  await expect(getChats('historical')).rejects.toThrow('Offline');
});
