import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { CelestialBackground } from '@/components/ui/celestial-background';
import { OrbitLoader } from '@/components/ui/orbit-loader';
import { colors, space } from '@/constants/theme';

/** Full-screen loading state shown while auth or profile data hydrates. */
export function FullScreenLoader({ label }: { label?: string }) {
  return (
    <View style={styles.container}>
      <CelestialBackground />
      <OrbitLoader size={56} />
      {label ? (
        <Animated.View entering={FadeIn.delay(300)}>
          <AppText variant="subhead" color={colors.textMuted}>
            {label}
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    backgroundColor: colors.background,
  },
});
