import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ChatPreview } from '@/constants/mock-data';
import {
  appendMessage,
  applyMessageToPreviews,
  messageFromRow,
  replaceMessage,
  type MessagePages,
  type RealtimeMessageRow,
} from '@/lib/chat-cache';
import { queryKeys } from '@/lib/query-keys';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/**
 * Keeps chats, likes and matches live while the user is signed in. Realtime only delivers
 * rows the user's RLS policies allow, so subscribing to whole tables is safe.
 *
 * - New messages are written straight into the open thread and the chat list.
 * - Read receipts update message status in place.
 * - New likes and new matches refetch the affected lists.
 * - After a reconnect (e.g. returning from background) everything is refetched once, since
 *   events sent while disconnected are not replayed.
 */
export function useRealtimeSync() {
  const { user } = useAuth();
  const client = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      return;
    }

    const supabase = getSupabaseClient();
    const chatPreviewsKey = queryKeys.chatPreviews(userId);
    let hasSubscribedBefore = false;

    const channel = supabase
      .channel(`user-sync:${userId}`)
      .on<RealtimeMessageRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        ({ new: row }) => {
          const message = messageFromRow(row, userId);
          client.setQueryData<MessagePages>(queryKeys.chatMessages(userId, row.chat_id), (data) =>
            appendMessage(data, message)
          );

          const previews = applyMessageToPreviews(
            client.getQueryData<ChatPreview[]>(chatPreviewsKey),
            row.chat_id,
            message
          );
          if (previews) {
            client.setQueryData(chatPreviewsKey, previews);
          } else {
            void client.invalidateQueries({ queryKey: chatPreviewsKey });
          }
        }
      )
      .on<RealtimeMessageRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        ({ new: row }) => {
          client.setQueryData<MessagePages>(queryKeys.chatMessages(userId, row.chat_id), (data) =>
            replaceMessage(data, messageFromRow(row, userId))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'likes', filter: `to_user_id=eq.${userId}` },
        () => {
          void client.invalidateQueries({ queryKey: queryKeys.incomingLikes(userId) });
          void client.invalidateQueries({ queryKey: queryKeys.activity(userId) });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_participants', filter: `user_id=eq.${userId}` },
        () => {
          void client.invalidateQueries({ queryKey: chatPreviewsKey });
          void client.invalidateQueries({ queryKey: queryKeys.activity(userId) });
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          return;
        }

        if (hasSubscribedBefore) {
          void client.invalidateQueries({ queryKey: queryKeys.user(userId) });
        }
        hasSubscribedBefore = true;
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, userId]);
}
