import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { CelestialBackground } from '@/components/ui/celestial-background';
import { colors } from '@/constants/theme';

type ScreenProps = {
  children: ReactNode;
  edges?: Edge[];
  /** Show the starfield. Turn off for photo-led or very dense screens. */
  stars?: boolean;
  starSeed?: number;
  style?: StyleProp<ViewStyle>;
};

/** Root container for every screen: themed canvas plus safe-area handling. */
export function Screen({ children, edges = ['top'], stars = true, starSeed, style }: ScreenProps) {
  return (
    <View style={styles.root}>
      {stars ? <CelestialBackground seed={starSeed} /> : null}
      <SafeAreaView edges={edges} style={[styles.safe, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
});
