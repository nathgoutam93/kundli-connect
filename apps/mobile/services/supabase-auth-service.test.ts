// Fixtures are real output of the SQL functions in supabase/migrations, captured from a local
// database seeded with two matched users, one hidden profile and one new profile.
import { getChats, getDiscoverProfiles, getPendingIncomingLikes } from '@/services/supabase-auth-service';

import fixtures from './__fixtures__/rpc-responses.json';

// jest.mock calls are hoisted above the imports by babel-jest.
const mockRpc = jest.fn();
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    rpc: (name: string) => mockRpc(name),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'aaaaaaaa-0000-0000-0000-000000000001' } } }, error: null }) },
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }) }) },
  }),
}));

test('maps the chat, like and discover RPC payloads into app models', async () => {
  mockRpc.mockImplementation(async (name: string) => ({
    data: name === 'get_chat_previews' ? fixtures.chats : name === 'get_incoming_likes' ? fixtures.likes : fixtures.discover,
    error: null,
  }));
  const [chat] = await getChats();
  expect(chat).toMatchObject({ name: 'Bela', avatarUrl: 'https://cdn/b/1.jpg', compatibilityScore: 78, hidden: false });
  expect(chat.messages[0]).toMatchObject({ senderId: 'me', status: 'read' });
  expect(chat.participantProfile?.details.find((d) => d.label === 'work')).toBeUndefined();

  const [like] = await getPendingIncomingLikes();
  expect(like).toMatchObject({ fromName: 'Bela', openingMessage: 'hey dev', avatarUrl: 'https://cdn/b/1.jpg' });

  const discover = await getDiscoverProfiles();
  expect(discover.map((p) => p.name)).toEqual(['Dev']);
  expect(discover[0].photos).toEqual([]);
});
