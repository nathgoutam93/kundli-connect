import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { CelestialBackground } from '@/components/ui/celestial-background';
import { colors, space } from '@/constants/theme';

/** Full-screen loading state shown while auth or profile data hydrates. */
export function FullScreenLoader({ label }: { label?: string }) {
  return (
    <View style={styles.container}>
      <CelestialBackground />
      <ActivityIndicator size="large" color={colors.accent} />
      {label ? (
        <AppText variant="subhead" color={colors.textMuted}>
          {label}
        </AppText>
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
