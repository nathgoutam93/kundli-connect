import { useEffect, useRef, useState } from 'react';

/** A routed icebreaker is an editable seed; changing routes never carries another chat's text. */
export function useChatDraft(chatId: string | undefined, seed: string | undefined, onConsumed: () => void) {
  const [state, setState] = useState({ chatId, text: '' });
  const stateRef = useRef(state);
  const consumed = useRef<string | undefined>(undefined);
  const consumeRef = useRef(onConsumed);
  consumeRef.current = onConsumed;
  const [errorChat, setErrorChat] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!seed) { consumed.current = undefined; return; }
    const key = `${chatId}:${seed}`;
    if (consumed.current === key) return;
    consumed.current = key;
    const previous = stateRef.current;
    const existing = previous.chatId === chatId ? previous.text : '';
    const combined = existing.trim() ? `${existing.trimEnd()}\n${seed.trim()}` : seed.trim();
    const tooLong = Array.from(combined).length > 2000;
    const next = { chatId, text: tooLong ? existing : combined };
    stateRef.current = next;
    setState(next);
    setErrorChat(tooLong ? chatId : undefined);
    consumeRef.current();
  }, [chatId, seed]);

  const draft = state.chatId === chatId ? state.text : '';
  function setDraft(value: string | ((current: string) => string)) {
    const current = stateRef.current.chatId === chatId ? stateRef.current.text : '';
    const next = { chatId, text: typeof value === 'function' ? value(current) : value };
    stateRef.current = next;
    setState(next);
    setErrorChat(undefined);
  }
  return { draft, setDraft, seedError: Boolean(chatId && errorChat === chatId) };
}
