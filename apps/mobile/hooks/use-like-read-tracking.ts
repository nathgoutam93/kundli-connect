import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewToken } from 'react-native';
import type { LikeItem } from '@/constants/mock-data';

/** FlatList viewability, rather than mounting a card, determines whether it was seen. */
export function useLikeReadTracking(likes: LikeItem[], focused: boolean, markRead: (ids: string[]) => Promise<void>) {
  const current = useRef({ likes, focused, markRead });
  current.current = { likes, focused, markRead };
  const visible = useRef<string[]>([]);
  const pending = useRef(new Set<string>());
  const [error, setError] = useState(false);
  const flush = useCallback(async () => {
    const state = current.current;
    if (!state.focused) return;
    const ids = state.likes.filter((like) => visible.current.includes(like.id) && !like.readAt && !pending.current.has(like.id)).map((like) => like.id).slice(0, 100);
    if (!ids.length) return;
    ids.forEach((id) => pending.current.add(id));
    setError(false);
    try { await state.markRead(ids); }
    catch { setError(true); }
    finally { ids.forEach((id) => pending.current.delete(id)); }
  }, []);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<LikeItem>[] }) => {
    visible.current = viewableItems.filter((item) => item.isViewable).map((item) => item.item.id);
    void flush();
  }, [flush]);
  const readState = likes.map((like) => `${like.id}:${like.readAt ?? ''}`).join(',');
  useEffect(() => { void flush(); }, [readState, focused, flush]);
  return { onViewableItemsChanged, error, retry: flush };
}
