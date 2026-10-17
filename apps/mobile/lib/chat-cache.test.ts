import type { ChatMessage, ChatPreview } from '@/constants/mock-data';

import {
  appendMessage,
  applyMessageToPreviews,
  createPendingMessage,
  messageFromRow,
  markPreviewRead,
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
  it('does not turn an unloaded chat list into a fresh empty list when marking read', () => {
    expect(markPreviewRead(undefined, 'a')).toBeUndefined();
    const chats = [{ id: 'a', unreadCount: 2 }, { id: 'b', unreadCount: 3 }] as ChatPreview[];
    expect(markPreviewRead(chats, 'a')?.map((chat) => chat.unreadCount)).toEqual([0, 3]);
    expect(chats[0].unreadCount).toBe(2);
  });
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
test('identical text from another request cannot replace the wrong pending message', () => {
  const first = createPendingMessage('Hello',new Date('2026-10-17T00:00:00Z'),'request-one');
  const second = createPendingMessage('Hello',new Date('2026-10-17T00:00:01Z'),'request-two');
  const initial = { pages:[{ messages:[first,second],hasMoreMessages:false }],pageParams:[undefined] };
  const saved = { ...second,id:'server-message' };
  expect(appendMessage(initial,saved)?.pages[0].messages).toEqual([first,saved]);
});

test('paginated realtime updates preserve cursors, move the updated thread, and ignore a replay', () => {
  const { applyMessageToPreviewPages, markPreviewPagesRead } = require('./chat-cache') as typeof import('./chat-cache');
  const cursor = { at: '2026-10-01T00:00:00Z', id: 'a' };
  const chat = (id: string) => ({ id, updatedAt: cursor.at, unreadCount: 0, messages: [] }) as unknown as ChatPreview;
  const data = { pages: [{ items: [chat('a')], nextCursor: cursor }, { items: [chat('b')] }], pageParams: [undefined, cursor] };
  const incoming = message('new', 'hi', 'other', '2026-10-02T00:00:00Z');
  const updated = applyMessageToPreviewPages(data, 'b', incoming)!;
  expect(updated.pages.map((page) => page.items[0].id)).toEqual(['b', 'a']);
  expect(updated.pages[0].nextCursor).toBe(cursor);
  expect(updated.pageParams).toBe(data.pageParams);
  expect(applyMessageToPreviewPages(updated, 'b', incoming)?.pages[0].items[0].unreadCount).toBe(1);
  expect(markPreviewPagesRead(updated, 'b')?.pages[0].items[0].unreadCount).toBe(0);
  expect(applyMessageToPreviewPages(data, 'outside', incoming)).toBeUndefined();
  expect(markPreviewPagesRead(undefined, 'b')).toBeUndefined();
});
