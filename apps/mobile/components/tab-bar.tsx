import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { colors, fontFamily, palette, radius, space } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { springs } from '@/lib/motion';

const INDICATOR_WIDTH = 18;

/**
 * Bottom tab bar: a gold indicator glides to the active tab, the icon bounces when selected,
 * and badges pop in when their count goes up. Tabs hidden with `href: null` are skipped.
 */
export function CelestialTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter(
    (route) => (descriptors[route.key].options.tabBarItemStyle as ViewStyle | undefined)?.display !== 'none'
  );
  const focusedKey = state.routes[state.index]?.key;
  const activeIndex = routes.findIndex((route) => route.key === focusedKey);

  const tabWidth = useSharedValue(0);
  const indicatorIndex = useSharedValue(Math.max(activeIndex, 0));

  useEffect(() => {
    if (activeIndex >= 0) {
      indicatorIndex.value = withSpring(activeIndex, { damping: 18, stiffness: 220, mass: 0.8 });
    }
  }, [activeIndex, indicatorIndex]);

  function handleLayout(event: LayoutChangeEvent) {
    tabWidth.value = event.nativeEvent.layout.width / Math.max(routes.length, 1);
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: tabWidth.value > 0 && activeIndex >= 0 ? 1 : 0,
    transform: [{ translateX: indicatorIndex.value * tabWidth.value + tabWidth.value / 2 - INDICATOR_WIDTH / 2 }],
  }));

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.xs) }]}>
      <View style={styles.row} onLayout={handleLayout}>
        <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = route.key === focusedKey;
          const color = focused ? colors.accent : colors.textFaint;
          const label = typeof options.title === 'string' ? options.title : route.name;

          function onPress() {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              haptics.select();
              navigation.navigate(route.name, route.params);
            }
          }

          return (
            <TabItem
              key={route.key}
              label={label}
              focused={focused}
              color={color}
              badge={options.tabBarBadge}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              icon={options.tabBarIcon?.({ focused, color, size: 22 })}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  label,
  focused,
  color,
  badge,
  icon,
  accessibilityLabel,
  onPress,
  onLongPress,
}: {
  label: string;
  focused: boolean;
  color: string;
  badge?: string | number;
  icon: ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scale = useSharedValue(1);
  const lift = useSharedValue(focused ? -1 : 0);
  const wasFocused = useRef(focused);

  useEffect(() => {
    if (focused && !wasFocused.current) {
      scale.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, springs.pop));
    }
    lift.value = withSpring(focused ? -1 : 0, springs.settle);
    wasFocused.current = focused;
  }, [focused, lift, scale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        if (!focused) {
          scale.value = withSpring(0.9, springs.press);
        }
      }}
      onPressOut={() => {
        if (!focused) {
          scale.value = withSpring(1, springs.release);
        }
      }}
      style={styles.tab}>
      <Animated.View style={iconStyle}>
        {icon}
        {badge !== undefined ? <TabBadge value={badge} /> : null}
      </Animated.View>
      <AppText style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

function TabBadge({ value }: { value: string | number }) {
  const scale = useSharedValue(0);
  const previous = useRef<string | number | null>(null);

  useEffect(() => {
    const grew = previous.current === null || Number(value) > Number(previous.current) || Number.isNaN(Number(value));
    if (grew && value !== previous.current) {
      scale.value = withSequence(withTiming(previous.current === null ? 0 : 1.35, { duration: 0 }), withSpring(1, springs.pop));
    }
    previous.current = value;
  }, [scale, value]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.badge, style]}>
      <AppText style={styles.badgeText}>{value}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.backgroundDeep,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: INDICATOR_WIDTH,
    height: 3,
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    backgroundColor: colors.accent,
    shadowColor: palette.gold500,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: space.sm,
    paddingBottom: space.xxs,
  },
  label: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.like,
    borderWidth: 2,
    borderColor: colors.backgroundDeep,
  },
  badgeText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    lineHeight: 12,
    color: colors.onLike,
  },
});
