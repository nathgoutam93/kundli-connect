import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { queryClient } from '@/lib/query-client';

/** Where a tapped push should open, from the `data` the Edge Functions attach. */
export function notificationTarget(data: Record<string, unknown> | undefined): Href | null {
  const chatId = typeof data?.chatId === 'string' ? data.chatId : null;
  switch (data?.type) {
    case 'like':
      return '/(tabs)/likes';
    case 'match':
    case 'message':
      return chatId ? { pathname: '/chat/[chatId]', params: { chatId } } : '/(tabs)/chats';
    case 'insight':
      return '/kundli';
    default:
      return null;
  }
}

const CONSUMED_NOTIFICATION_KEY = 'kundalikonnect-consumed-notification';
let handledId: string | null = null;

export async function consumeNotification(
  response: Notifications.NotificationResponse,
  userId: string,
  isCurrent: () => boolean = () => true
) {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const id = response.notification.request.identifier;
  if (handledId === id) return;
  handledId = id;
  const previous = await AsyncStorage.getItem(CONSUMED_NOTIFICATION_KEY);
  const data = response.notification.request.content.data;
  await AsyncStorage.setItem(CONSUMED_NOTIFICATION_KEY, id);
  try {
    if (previous === id || !isCurrent() || (data?.recipientUserId && data.recipientUserId !== userId)) return;
    if (data?.type === 'insight') {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes('insights') });
    }
    const target = notificationTarget(data);
    if (target) router.push(target);
  } finally {
    // Clearing updates useLastNotificationResponse; route before that effect is cleaned up.
    await Notifications.clearLastNotificationResponseAsync();
  }
}

/** Consumes native responses as well as remembering them across remounts and app restarts. */
export function useNotificationRouting(enabled: boolean, userId: string) {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!enabled || !response) return;
    let current = true;
    void consumeNotification(response, userId, () => current).catch((error) => {
      console.warn('Could not open notification.', error);
    });
    return () => { current = false; };
  }, [enabled, response, userId]);
}
