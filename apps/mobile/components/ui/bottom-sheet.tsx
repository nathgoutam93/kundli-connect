import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { colors, gutter, radius, space } from '@/constants/theme';
import { durations, easings, springs } from '@/lib/motion';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  /** Label for a compact action in the header, e.g. "Done". */
  doneLabel?: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Distance or flick speed past which a downward drag closes the sheet. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

/**
 * Modal sheet: the backdrop fades in while the sheet springs up from the bottom, and the sheet
 * can be dragged down to dismiss. Stays mounted while its exit animation plays.
 */
export function BottomSheet({ visible, onClose, title, eyebrow, doneLabel, children, contentStyle }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const [isMounted, setIsMounted] = useState(visible);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const sheetHeight = useSharedValue(800);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      dragY.value = 0;
      progress.value = withSpring(1, springs.sheet);
    } else {
      progress.value = withTiming(0, { duration: durations.base, easing: easings.in }, (finished) => {
        if (finished) {
          runOnJS(setIsMounted)(false);
        }
      });
    }
  }, [dragY, progress, visible]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      dragY.value = Math.max(event.translationY, 0);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, springs.sheet);
      }
    });

  const scrimStyle = useAnimatedStyle(() => {
    const dragFade = interpolate(dragY.value, [0, sheetHeight.value], [1, 0.2], 'clamp');
    return { opacity: Math.min(progress.value, 1) * dragFade };
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max((1 - progress.value) * sheetHeight.value + dragY.value, 0) }],
  }));

  function handleLayout(event: LayoutChangeEvent) {
    sheetHeight.value = event.nativeEvent.layout.height;
  }

  return (
    <Modal transparent animationType="none" visible={isMounted} onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <KeyboardAvoidingView style={styles.layer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[styles.scrim, scrimStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View
              onLayout={handleLayout}
              style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }, contentStyle, sheetStyle]}>
              <View style={styles.handle} />
              {title || doneLabel ? (
                <View style={styles.header}>
                  <View style={styles.headerText}>
                    {eyebrow ? (
                      <AppText variant="overline" color={colors.accent}>
                        {eyebrow}
                      </AppText>
                    ) : null}
                    {title ? <AppText variant="title3">{title}</AppText> : null}
                  </View>
                  {doneLabel ? (
                    <Button label={doneLabel} variant="secondary" size="sm" fullWidth={false} onPress={onClose} />
                  ) : null}
                </View>
              ) : null}
              {children}
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    gap: space.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
});
