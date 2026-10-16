import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { durations } from '@/lib/motion';

/**
 * Counts from 0 up to `target` with an ease-out curve, for score reveals. Jumps straight to the
 * value when the OS asks for reduced motion.
 */
export function useCountUp(target: number, { duration = durations.reveal, delay = 0 } = {}) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? target : 0);

  useEffect(() => {
    if (reduceMotion || target <= 0) {
      setValue(target);
      return;
    }

    let frame = 0;
    let start: number | null = null;
    const timeout = setTimeout(() => {
      const step = (now: number) => {
        start ??= now;
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(target * eased));
        if (t < 1) {
          frame = requestAnimationFrame(step);
        }
      };
      frame = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [delay, duration, reduceMotion, target]);

  return value;
}
