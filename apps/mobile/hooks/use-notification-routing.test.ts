import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { consumeNotification, notificationTarget } from '@/hooks/use-notification-routing';

// jest hoists these above the import.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
}));
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

function response(id: string, recipientUserId = 'me') {
  return {
    actionIdentifier: 'default',
    notification: { date: Date.now(), request: { identifier: id, trigger: null, content: {
      title: 'Message', subtitle: null, body: 'A message', sound: null, badge: 0, categoryIdentifier: null,
      data: { type: 'message', chatId: 'chat', recipientUserId },
    } } },
  } as Notifications.NotificationResponse;
}

test('consumes a notification once and clears the native response', async () => {
  jest.mocked(router.push).mockClear();
  await consumeNotification(response('once'), 'me');
  await consumeNotification(response('once'), 'me');
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
});

test('does not replay a persisted tap or open another account’s notification', async () => {
  jest.mocked(router.push).mockClear();
  await AsyncStorage.setItem('kundalikonnect-consumed-notification', 'persisted');
  await consumeNotification(response('persisted'), 'me');
  await consumeNotification(response('other-user', 'someone-else'), 'me');
  await consumeNotification(response('logged-out'), 'me', () => false);
  expect(router.push).not.toHaveBeenCalled();
});
