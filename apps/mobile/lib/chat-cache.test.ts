import type { ChatMessage, ChatPreview } from '@/constants/mock-data';

import {
  appendMessage,
  applyMessageToPreviews,
  createPendingMessage,
  messageFromRow,
  reconcileSentMessage,
  replaceMessage,
  type MessagePages,
} from './chat-cache';

function pages(...messages: ChatMessage[]): MessagePages {
  return { pages: [{ messages, hasMoreMessages: false }], pageParams: [undefined] };
}

function message(id: string, text: string, senderId = 'other', createdAt = '2026-10-01T10:00:00.000Z'): ChatMessage {
  return { id, text, senderId, createdAt, status: 'sent' };
}

function ids(data: MessagePages | undefined) {
  return data?.pages.flatMap((page) => page.messages.map((item) => item.id));
}

describe('chat cache', () => {
  it('appends incoming messages once', () => {
    const start = pages(message('1', 'hi'));
    const once = appendMessage(start, message('2', 'hello'));
    expect(ids(appendMessage(once, message('2', 'hello')))).toEqual(['1', '2']);
  });

  it('leaves an unloaded thread untouched', () => {
    expect(appendMessage(undefined, message('1', 'hi'))).toBeUndefined();
  });

  it('replaces the optimistic placeholder when the realtime copy of our message arrives first', () => {
    const pending = createPendingMessage('see you');
    const withPending = pages(message('1', 'hi'), pending);
    const delivered = appendMessage(withPending, message('srv-1', 'see you', 'me'));
    expect(ids(delivered)).toEqual(['1', 'srv-1']);

    // The mutation result then finds the saved id already present and just drops the placeholder.
    expect(ids(reconcileSentMessage(delivered, pending.id, message('srv-1', 'see you', 'me')))).toEqual(['1', 'srv-1']);
  });

  it('swaps the placeholder for the saved message when the mutation returns first', () => {
    const pending = createPendingMessage('see you');
    const reconciled = reconcileSentMessage(pages(pending), pending.id, message('srv-1', 'see you', 'me'));
    expect(ids(reconciled)).toEqual(['srv-1']);
    expect(ids(appendMessage(reconciled, message('srv-1', 'see you', 'me')))).toEqual(['srv-1']);
  });

  it('updates read receipts in place', () => {
    const updated = replaceMessage(pages(message('1', 'hi', 'me')), { ...message('1', 'hi', 'me'), status: 'read', seenAt: 'now' });
    expect(updated?.pages[0].messages[0]).toMatchObject({ status: 'read', seenAt: 'now' });
  });

  it('maps realtime rows relative to the current user', () => {
    const row = { id: 'm', chat_id: 'c', body: 'yo', status: 'read' as const, read_at: 't', created_at: 'c' };
    expect(messageFromRow({ ...row, sender_id: 'me-id' }, 'me-id')).toMatchObject({ senderId: 'me', seenAt: 't' });
    expect(messageFromRow({ ...row, sender_id: 'them' }, 'me-id')).toMatchObject({ senderId: 'them', readAt: 't' });
  });

  it('moves the chat to the top and counts incoming messages as unread', () => {
    const chat = (id: string, updatedAt: string) =>
      ({ id, updatedAt, unreadCount: 0, lastMessage: '', messages: [] }) as unknown as ChatPreview;
    const chats = [chat('a', '2026-10-02T00:00:00.000Z'), chat('b', '2026-10-01T00:00:00.000Z')];

    const incoming = applyMessageToPreviews(chats, 'b', message('m', 'new', 'them', '2026-10-03T00:00:00.000Z'));
    expect(incoming?.map((item) => item.id)).toEqual(['b', 'a']);
    expect(incoming?.[0]).toMatchObject({ lastMessage: 'new', unreadCount: 1 });

    const mine = applyMessageToPreviews(chats, 'b', message('m', 'mine', 'me', '2026-10-03T00:00:00.000Z'));
    expect(mine?.[0].unreadCount).toBe(0);

    expect(applyMessageToPreviews(chats, 'unknown', message('m', 'x'))).toBeUndefined();
  });
});
