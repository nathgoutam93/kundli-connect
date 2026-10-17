import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ViewToken } from 'react-native';
import type { LikeItem } from '@/constants/mock-data';
import { useLikeReadTracking } from './use-like-read-tracking';

const like = (id: string, readAt?: string) => ({ id, readAt } as LikeItem);
const visible = (item: LikeItem) => ({ item, isViewable: true, key: item.id, index: 0 } as ViewToken<LikeItem>);

test('marks visible cards only while focused; arrivals stay unread until viewed', async () => {
  const mark = jest.fn().mockResolvedValue(undefined);
  const a = like('a');
  const b = like('b');
  const hook = renderHook<ReturnType<typeof useLikeReadTracking>, { focused: boolean; likes: LikeItem[] }>(({ focused, likes }) => useLikeReadTracking(likes, focused, mark), { initialProps: { focused: false, likes: [a,b] } });
  act(() => hook.result.current.onViewableItemsChanged({ viewableItems: [visible(a)] }));
  expect(mark).not.toHaveBeenCalled();
  hook.rerender({ focused: true, likes: [a,b] });
  await waitFor(() => expect(mark).toHaveBeenCalledWith(['a']));
  hook.rerender({ focused: true, likes: [like('a','saved'),b,like('new')] });
  expect(mark).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.onViewableItemsChanged({ viewableItems: [visible(b)] }));
  await waitFor(() => expect(mark).toHaveBeenLastCalledWith(['b']));
});

test('read failures expose retry and do not start an automatic request loop', async () => {
  const mark = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
  const a = like('a');
  const hook = renderHook(() => useLikeReadTracking([a], true, mark));
  act(() => hook.result.current.onViewableItemsChanged({ viewableItems: [visible(a)] }));
  await waitFor(() => expect(hook.result.current.error).toBe(true));
  expect(mark).toHaveBeenCalledTimes(1);
  await act(async () => { await hook.result.current.retry(); });
  expect(mark).toHaveBeenCalledTimes(2);
  expect(hook.result.current.error).toBe(false);
});
