import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

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

/** Opens the right screen when the user taps a notification (including the one that launched the app). */
export function useNotificationRouting(enabled: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      return;
    }
    const id = response.notification.request.identifier;
    if (handledId.current === id) {
      return;
    }
    handledId.current = id;

    const data = response.notification.request.content.data;
    if (data?.type === 'insight') {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes('insights') });
    }
    const target = notificationTarget(data);
    if (target) {
      router.push(target);
    }
  }, [enabled, response]);
}
