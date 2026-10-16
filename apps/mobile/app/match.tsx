import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CelestialBackground } from '@/components/ui/celestial-background';
import { IconButton } from '@/components/ui/icon-button';
import { SparkleBurst } from '@/components/ui/sparkle-burst';
import { colors, fontFamily, gutter, palette, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { haptics } from '@/lib/haptics';

const ICEBREAKERS = ['Ask about their ideal Sunday', 'Compare moon signs', 'Plan a first coffee'];
const ORBIT_SIZE = 240;
/** When the two avatars meet in the middle and the sparkles fire. */
const MEET_DELAY = 380;

type MatchParams = { chatId?: string; name?: string; avatarUrl?: string; score?: string };

export default function MatchScreen() {
  const params = useLocalSearchParams<MatchParams>();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const viewer = useAppData((state) => state.profile);
  const chats = useAppData((state) => state.chats);
  const chat = params.chatId
    ? chats.find((item) => item.id === params.chatId)
    : (chats.find((item) => !item.hidden) ?? chats[0]);

  // Params come from the like that was just replied to, so the screen works before chats refetch.
  const chatId = params.chatId ?? chat?.id;
  const partnerName = params.name ?? chat?.name;
  const partnerAvatar = params.avatarUrl ?? chat?.avatarUrl;
  const score = params.score ? Number(params.score) : chat?.compatibilityScore;
  const hasPartner = Boolean(chatId && partnerName);

  const arrival = useSharedValue(0);
  const orbit = useSharedValue(0);
  const spin = useSharedValue(0);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    arrival.value = withSpring(1, { damping: 14, stiffness: 120, mass: 1 });
    orbit.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    if (!reduceMotion) {
      spin.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    }
    const timeout = setTimeout(() => {
      setBurst(1);
      haptics.success();
    }, MEET_DELAY);
    return () => {
      clearTimeout(timeout);
      cancelAnimation(spin);
    };
  }, [arrival, orbit, reduceMotion, spin]);

  const leftStyle = useAnimatedStyle(() => ({
    opacity: Math.min(arrival.value * 1.5, 1),
    transform: [
      { translateX: (1 - arrival.value) * -width * 0.6 },
      { rotate: `${-6 - (1 - arrival.value) * 24}deg` },
    ],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: Math.min(arrival.value * 1.5, 1),
    transform: [
      { translateX: (1 - arrival.value) * width * 0.6 },
      { rotate: `${6 + (1 - arrival.value) * 24}deg` },
    ],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    opacity: orbit.value,
    transform: [{ scale: 0.6 + 0.4 * orbit.value }, { rotate: `${spin.value}deg` }],
  }));

  return (
    <View style={styles.screen}>
      <CelestialBackground stars={60} seed={42} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <IconButton
          icon="close"
          accessibilityLabel="Close"
          variant="glass"
          size={40}
          onPress={() => router.back()}
          style={styles.close}
        />

        <View style={styles.center}>
          <View style={styles.copy}>
            {hasPartner && score ? (
              <Animated.View entering={FadeIn.delay(MEET_DELAY).duration(500)}>
                <AppText variant="overline" color={colors.accent} align="center">
                  ✦ {score}% Kundli match ✦
                </AppText>
              </Animated.View>
            ) : null}
            <Animated.View entering={FadeInDown.delay(MEET_DELAY + 80).duration(550)}>
              <AppText align="center" style={styles.title}>
                It’s{' '}
                <AppText color={colors.accent} style={styles.titleAccent}>
                  written
                </AppText>
              </AppText>
            </Animated.View>
            {hasPartner ? (
              <Animated.View entering={FadeInDown.delay(MEET_DELAY + 200).duration(550)}>
                <AppText variant="callout" color={colors.textMuted} align="center">
                  You and {partnerName} liked each other. The rest of the story is yours to write.
                </AppText>
              </Animated.View>
            ) : null}
          </View>

          {hasPartner ? (
            <View style={styles.orbs}>
              <Animated.View style={[styles.orbit, orbitStyle]}>
                <View style={styles.planet} />
              </Animated.View>
              <SparkleBurst trigger={burst} radius={150} count={14} duration={900} />
              <Animated.View style={[styles.orbLeft, leftStyle]}>
                <Avatar uri={viewer.photoUris[0]} name={viewer.name} size={112} ring={colors.accent} />
              </Animated.View>
              <Animated.View style={[styles.orbRight, rightStyle]}>
                <Avatar uri={partnerAvatar} name={partnerName} size={112} ring={colors.like} />
              </Animated.View>
            </View>
          ) : null}

          {hasPartner ? (
            <View style={styles.icebreakers}>
              {ICEBREAKERS.map((item, index) => (
                <Animated.View
                  key={item}
                  entering={FadeInUp.delay(MEET_DELAY + 320 + index * 90).duration(450)}
                  style={styles.chip}>
                  <AppText variant="subhead" color={colors.textMuted}>
                    {item}
                  </AppText>
                </Animated.View>
              ))}
            </View>
          ) : null}
        </View>

        <Animated.View entering={FadeInUp.delay(MEET_DELAY + 500).duration(450)}>
          {hasPartner ? (
            <Button label="Start chatting" icon="chatbubble-ellipses" onPress={() => router.replace(`/chat/${chatId}`)} />
          ) : (
            <Button label="Open chats" onPress={() => router.replace('/(tabs)/chats')} />
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
    paddingHorizontal: gutter,
    paddingBottom: space.md,
  },
  close: {
    alignSelf: 'flex-end',
    marginTop: space.xs,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: space.xxl,
  },
  copy: {
    gap: space.sm,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -1,
    color: colors.text,
  },
  titleAccent: {
    fontFamily: fontFamily.displayItalic,
    fontSize: 52,
    lineHeight: 58,
  },
  orbs: {
    height: 170,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbit: {
    position: 'absolute',
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    borderRadius: ORBIT_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planet: {
    position: 'absolute',
    top: -4,
    left: ORBIT_SIZE / 2 - 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.gold300,
    shadowColor: palette.gold500,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  orbLeft: {
    marginRight: -18,
  },
  orbRight: {
    marginLeft: -18,
  },
  icebreakers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.xs,
  },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
});
