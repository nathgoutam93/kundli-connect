import { notificationTarget } from '@/hooks/use-notification-routing';

// jest hoists these above the import.
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/query-client', () => ({ queryClient: { invalidateQueries: jest.fn() } }));


describe('notificationTarget', () => {
  it('opens the screen each push is about', () => {
    expect(notificationTarget({ type: 'like', likeId: 'l1' })).toBe('/(tabs)/likes');
    expect(notificationTarget({ type: 'match', chatId: 'c1' })).toEqual({ pathname: '/chat/[chatId]', params: { chatId: 'c1' } });
    expect(notificationTarget({ type: 'message', chatId: 'c2' })).toEqual({ pathname: '/chat/[chatId]', params: { chatId: 'c2' } });
    expect(notificationTarget({ type: 'insight', weekOf: '2026-10-19' })).toBe('/kundli');
  });

  it('falls back to the chat list without a chat id, and ignores unknown pushes', () => {
    expect(notificationTarget({ type: 'message' })).toBe('/(tabs)/chats');
    expect(notificationTarget({ type: 'something-else' })).toBeNull();
    expect(notificationTarget(undefined)).toBeNull();
  });
});
