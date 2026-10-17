import AsyncStorage from '@react-native-async-storage/async-storage';
import { confirmMessageRequest, getMessageRequestId } from './message-attempts';
import { sendMessage, replyToLike, generateMatchScore } from './supabase-auth-service';

const mockStorage = new Map<string,string>();
let mockSequence = 0;
const mockUser = 'e4000000-0000-4000-8000-000000000001';
const mockInvoke = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string,value: string) => { mockStorage.set(key,value); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string,text: string) => require('crypto').createHash('sha256').update(text).digest('hex'),
  randomUUID: () => `e4100000-0000-4000-8000-${String(++mockSequence).padStart(12,'0')}`,
}));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: mockUser } } }, error: null }) },
  functions: { invoke: mockInvoke },
}) }));
beforeEach(() => { jest.clearAllMocks(); mockStorage.clear(); mockSequence=0; mockInvoke.mockReset(); });

const attempt = { userId: 'me', kind: 'send' as const, targetId: 'chat', text: 'Private message' };
test('concurrent retries share an ID; confirmation permits a new identical message', async () => {
  const [first,second] = await Promise.all([getMessageRequestId(attempt),getMessageRequestId({ ...attempt, text: ' Private message ' })]);
  expect(first).toBe(second);
  expect([...mockStorage.keys()].join('')).not.toContain('Private message');
  expect([...mockStorage.values()]).toEqual([first]);
  await confirmMessageRequest(attempt,first);
  expect(await getMessageRequestId(attempt)).not.toBe(first);
});
test('account, conversation, action and edited text have independent identities', async () => {
  const ids = await Promise.all([
    getMessageRequestId(attempt), getMessageRequestId({ ...attempt,userId:'other' }),
    getMessageRequestId({ ...attempt,targetId:'other-chat' }), getMessageRequestId({ ...attempt,kind:'reply' }),
    getMessageRequestId({ ...attempt,text:'Edited message' }),
  ]);
  expect(new Set(ids).size).toBe(5);
  await confirmMessageRequest(attempt,'different-request');
  expect(await getMessageRequestId(attempt)).toBe(ids[0]);
});
test('a lost HTTP response survives a module restart and reuses the server receipt', async () => {
  const receipts = new Map<string,object>();
  let loseResponse = true;
  mockInvoke.mockImplementation(async (_name: string, { body }: { body: { requestId: string; text: string } }) => {
    if (!receipts.has(body.requestId)) receipts.set(body.requestId,{ id:'saved-message',clientRequestId:body.requestId,text:body.text,createdAt:'2026-10-17T00:00:00Z',status:'sent' });
    if (loseResponse) { loseResponse=false; return { error:new Error('Lost response') }; }
    return { data: { message:receipts.get(body.requestId) },error:null };
  });
  await expect(sendMessage('chat','Hello')).rejects.toThrow('Could not connect');
  expect(mockStorage.size).toBe(1);
  const originalRequest = mockInvoke.mock.calls[0][1].body.requestId;
  jest.resetModules();
  const restored = require('./supabase-auth-service') as typeof import('./supabase-auth-service');
  expect(await restored.sendMessage('chat','Hello')).toMatchObject({ id:'saved-message',clientRequestId:originalRequest });
  expect(mockInvoke.mock.calls[1][1].body.requestId).toBe(originalRequest);
  expect(receipts.size).toBe(1);
  expect(mockStorage.size).toBe(0);
});
test('a message queued under another account is rejected before calling the server', async () => {
  await expect(sendMessage('chat','Hello',undefined,'previous-account')).rejects.toThrow('session changed');
  await expect(generateMatchScore('target','previous-account')).rejects.toThrow('session changed');
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(0);
});

test('a reply with an unknown outcome reuses its ID and then clears the attempt on acknowledgment', async () => {
  mockInvoke.mockResolvedValueOnce({ error:new Error('Lost reply response') });
  await expect(replyToLike('like','Hello back')).rejects.toThrow('Could not connect');
  const original = mockInvoke.mock.calls[0][1].body.requestId;
  mockInvoke.mockImplementationOnce(async (_name: string,{ body }: { body: { requestId: string } }) => ({ data:{ chatId:'saved-chat',requestId:body.requestId },error:null }));
  expect(await replyToLike('like','Hello back')).toBe('saved-chat');
  expect(mockInvoke.mock.calls[1][1].body.requestId).toBe(original);
  expect(mockStorage.size).toBe(0);
});
