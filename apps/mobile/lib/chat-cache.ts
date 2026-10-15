import type { InfiniteData } from '@tanstack/react-query';

import type { ChatMessage, ChatPreview } from '@/constants/mock-data';

/** One page of the chat-messages infinite query; messages are oldest → newest. */
export type MessagePage = {
  messages: ChatMessage[];
  hasMoreMessages: boolean;
};

export type MessagePages = InfiniteData<MessagePage, string | undefined>;

/** A message row as delivered by Supabase Realtime. */
export type RealtimeMessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  status: 'sent' | 'read';
  read_at: string | null;
  created_at: string;
};

export const PENDING_MESSAGE_PREFIX = 'pending-';

export function isPendingMessage(message: ChatMessage) {
  return message.id.startsWith(PENDING_MESSAGE_PREFIX);
}

export function createPendingMessage(text: string, now = new Date()): ChatMessage {
  return {
    id: `${PENDING_MESSAGE_PREFIX}${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now.toISOString(),
    senderId: 'me',
    text,
    status: 'sent',
  };
}

export function messageFromRow(row: RealtimeMessageRow, currentUserId: string): ChatMessage {
  const isMine = row.sender_id === currentUserId;

  return {
    id: row.id,
    createdAt: row.created_at,
    senderId: isMine ? 'me' : row.sender_id,
    text: row.body,
    status: row.status,
    ...(isMine && row.status === 'read' && row.read_at ? { seenAt: row.read_at } : {}),
    ...(!isMine && row.read_at ? { readAt: row.read_at } : {}),
  };
}

function hasMessage(data: MessagePages, id: string) {
  return data.pages.some((page) => page.messages.some((message) => message.id === id));
}

function mapNewestPage(data: MessagePages, update: (messages: ChatMessage[]) => ChatMessage[]): MessagePages {
  if (data.pages.length === 0) {
    return { ...data, pages: [{ messages: update([]), hasMoreMessages: false }], pageParams: [undefined] };
  }

  const [newest, ...older] = data.pages;
  return { ...data, pages: [{ ...newest, messages: update(newest.messages) }, ...older] };
}

/**
 * Adds a message to the newest page. Duplicate ids are ignored, and when the server copy of
 * one of our own messages arrives it replaces the matching optimistic placeholder.
 */
export function appendMessage(data: MessagePages | undefined, message: ChatMessage): MessagePages | undefined {
  if (!data || hasMessage(data, message.id)) {
    return data;
  }

  return mapNewestPage(data, (messages) => {
    if (message.senderId === 'me' && !isPendingMessage(message)) {
      const pendingIndex = messages.findIndex((item) => isPendingMessage(item) && item.text === message.text);
      if (pendingIndex !== -1) {
        const next = [...messages];
        next[pendingIndex] = message;
        return next;
      }
    }

    return [...messages, message];
  });
}

/** Swaps an optimistic placeholder for the saved message (or drops it if Realtime got there first). */
export function reconcileSentMessage(
  data: MessagePages | undefined,
  pendingId: string,
  saved: ChatMessage
): MessagePages | undefined {
  if (!data) {
    return data;
  }

  const alreadyDelivered = hasMessage(data, saved.id);
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      messages: alreadyDelivered
        ? page.messages.filter((message) => message.id !== pendingId)
        : page.messages.map((message) => (message.id === pendingId ? saved : message)),
    })),
  };
}

export function removeMessage(data: MessagePages | undefined, id: string): MessagePages | undefined {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, messages: page.messages.filter((message) => message.id !== id) })),
  };
}

export function replaceMessage(data: MessagePages | undefined, message: ChatMessage): MessagePages | undefined {
  if (!data || !hasMessage(data, message.id)) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((item) => (item.id === message.id ? message : item)),
    })),
  };
}

/**
 * Applies a new message to the chat list: updates the preview text and timestamp, bumps the
 * unread count for incoming messages and moves the chat to the top. Returns `undefined` when
 * the chat is not in the list, so callers can refetch instead.
 */
export function applyMessageToPreviews(
  chats: ChatPreview[] | undefined,
  chatId: string,
  message: ChatMessage
): ChatPreview[] | undefined {
  if (!chats?.some((chat) => chat.id === chatId)) {
    return undefined;
  }

  const isIncoming = message.senderId !== 'me';
  const updated = chats.map((chat) =>
    chat.id === chatId
      ? {
          ...chat,
          lastMessage: message.text,
          updatedAt: message.createdAt,
          unreadCount: isIncoming ? chat.unreadCount + 1 : chat.unreadCount,
          messages: [message],
        }
      : chat
  );

  return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
