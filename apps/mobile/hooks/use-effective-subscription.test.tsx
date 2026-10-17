import { act, renderHook } from '@testing-library/react-native';
import { effectiveSubscription, useEffectiveSubscription } from './use-effective-subscription';

test('an active label without a valid future server deadline is expired', () => {
  expect(effectiveSubscription({ status: 'active' },100).status).toBe('expired');
  expect(effectiveSubscription({ status: 'active', expiresAt: 100 },100).status).toBe('expired');
  expect(effectiveSubscription({ status: 'active', expiresAt: 101 },100).status).toBe('active');
});

test('Premium expires while the app stays open without a network response', () => {
  jest.useFakeTimers();
  const expiresAt = Date.now()+1000;
  const hook = renderHook(() => useEffectiveSubscription({ status: 'active', expiresAt }));
  expect(hook.result.current.status).toBe('active');
  act(() => { jest.advanceTimersByTime(1001); });
  expect(hook.result.current.status).toBe('expired');
  hook.unmount();
  jest.useRealTimers();
});
