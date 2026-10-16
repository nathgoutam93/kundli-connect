import { Pressable } from 'react-native';
import Animated, { Easing, type WithSpringConfig } from 'react-native-reanimated';

/**
 * Motion tokens. Every animation should use these so the app moves with one personality:
 * quick to respond, soft to settle. Reanimated's defaults already honour the OS
 * "reduce motion" setting for springs, timings and layout animations (they jump to the end);
 * looping effects check `useReducedMotion()` themselves.
 */
export const springs = {
  /** Finger down: fast and firm. */
  press: { damping: 20, stiffness: 520, mass: 0.6 },
  /** Finger up: a touch of overshoot so controls feel alive. */
  release: { damping: 11, stiffness: 320, mass: 0.6 },
  /** Elements arriving or moving into place. */
  settle: { damping: 18, stiffness: 180, mass: 1 },
  /** Playful pops (icons, badges, check marks). */
  pop: { damping: 8, stiffness: 260, mass: 0.7 },
  /** Bottom sheets and large surfaces. */
  sheet: { damping: 24, stiffness: 240, mass: 1 },
} satisfies Record<string, WithSpringConfig>;

export const durations = {
  fast: 140,
  base: 220,
  slow: 360,
  /** Number count-ups and progress fills. */
  reveal: 1100,
} as const;

export const easings = {
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  in: Easing.in(Easing.cubic),
} as const;

/** Pressable that accepts Reanimated animated styles. Pass style arrays, not style functions. */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
