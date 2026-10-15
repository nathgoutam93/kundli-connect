import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CelestialBackground } from '@/components/ui/celestial-background';
import { IconButton } from '@/components/ui/icon-button';
import { colors, fontFamily, gutter, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

const ICEBREAKERS = ['Ask about their ideal Sunday', 'Compare moon signs', 'Plan a first coffee'];

export default function MatchScreen() {
  const chat = useAppData((state) => state.chats.find((item) => !item.hidden) ?? state.chats[0]);
  const viewer = useAppData((state) => state.profile);

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
            {chat ? (
              <AppText variant="overline" color={colors.accent} align="center">
                ✦ {chat.compatibilityScore}% Kundli match ✦
              </AppText>
            ) : null}
            <AppText align="center" style={styles.title}>
              It’s{' '}
              <AppText color={colors.accent} style={styles.titleAccent}>
                written
              </AppText>
            </AppText>
            {chat ? (
              <AppText variant="callout" color={colors.textMuted} align="center">
                You and {chat.name} liked each other. The rest of the story is yours to write.
              </AppText>
            ) : null}
          </View>

          {chat ? (
            <View style={styles.orbs}>
              <View style={styles.orbit} />
              <Avatar uri={viewer.photoUris[0]} name={viewer.name} size={112} ring={colors.accent} style={styles.orbLeft} />
              <Avatar uri={chat.avatarUrl} name={chat.name} size={112} ring={colors.like} style={styles.orbRight} />
            </View>
          ) : null}

          {chat ? (
            <View style={styles.icebreakers}>
              {ICEBREAKERS.map((item) => (
                <View key={item} style={styles.chip}>
                  <AppText variant="subhead" color={colors.textMuted}>
                    {item}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {chat ? (
          <Button label="Start chatting" icon="chatbubble-ellipses" onPress={() => router.replace(`/chat/${chat.id}`)} />
        ) : (
          <Button label="Open chats" onPress={() => router.replace('/(tabs)/chats')} />
        )}
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
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orbLeft: {
    marginRight: -18,
    transform: [{ rotate: '-6deg' }],
  },
  orbRight: {
    marginLeft: -18,
    transform: [{ rotate: '6deg' }],
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
