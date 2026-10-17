import { act, renderHook } from '@testing-library/react-native';
import { useChatDraft } from './use-chat-draft';

test('an icebreaker seeds an editable draft once and consumes the route without sending', () => {
  const consume = jest.fn();
  const hook = renderHook(({ chat, seed }: { chat: string; seed: string | undefined }) => useChatDraft(chat, seed, consume), { initialProps: { chat: 'a', seed: 'Coffee?' as string | undefined } });
  expect(hook.result.current.draft).toBe('Coffee?');
  expect(consume).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.setDraft('Tea instead?'));
  hook.rerender({ chat: 'a', seed: 'Coffee?' });
  expect(hook.result.current.draft).toBe('Tea instead?');
  expect(consume).toHaveBeenCalledTimes(1);
  hook.rerender({ chat: 'a', seed: undefined });
  hook.rerender({ chat: 'a', seed: 'Sunday plans?' });
  expect(hook.result.current.draft).toBe('Tea instead?\nSunday plans?');
  hook.rerender({ chat: 'b', seed: undefined });
  expect(hook.result.current.draft).toBe('');
  hook.rerender({ chat: 'b', seed: 'Hello!' });
  expect(hook.result.current.draft).toBe('Hello!');
});

test('an oversized combined draft preserves typed text and reports why the seed was skipped', () => {
  const consume = jest.fn();
  const hook = renderHook(({ seed }: { seed: string | undefined }) => useChatDraft('a', seed, consume), { initialProps: { seed: undefined as string | undefined } });
  act(() => hook.result.current.setDraft('a'.repeat(1999)));
  hook.rerender({ seed: 'Coffee?' });
  expect(hook.result.current.draft).toHaveLength(1999);
  expect(hook.result.current.seedError).toBe(true);
  expect(consume).toHaveBeenCalledTimes(1);
  hook.rerender({ seed: undefined });
  expect(hook.result.current.seedError).toBe(true);
  act(() => hook.result.current.setDraft('Shorter'));
  expect(hook.result.current.seedError).toBe(false);
});
