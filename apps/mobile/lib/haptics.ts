import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * One place for every haptic in the app, so the feel stays consistent and can be tuned or
 * switched off without touching screens. Calls are fire-and-forget and never throw.
 *
 * Rule of thumb: buttons, toggles and selections get haptics; cards and list rows that only
 * navigate do not.
 *
 * - `tap`: buttons and icon buttons (light).
 * - `select`: choosing an option, switching tabs/segments, toggles.
 * - `press`: weightier actions such as liking or sending (medium).
 * - `success` / `warning` / `error`: outcomes (sent, matched, failed).
 */
let enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export function setHapticsEnabled(value: boolean) {
  enabled = value && (Platform.OS === 'ios' || Platform.OS === 'android');
}

function run(effect: () => Promise<void>) {
  if (!enabled) {
    return;
  }
  effect().catch(() => undefined);
}

export const haptics = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => run(() => Haptics.selectionAsync()),
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
} as const;

export type HapticKind = keyof typeof haptics;
