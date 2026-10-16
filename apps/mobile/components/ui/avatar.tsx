import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, fontFamily } from '@/constants/theme';

type AvatarProps = {
  uri?: string | null;
  name?: string;
  size?: number;
  /** Ring color; pass `null` for no ring. */
  ring?: string | null;
  style?: StyleProp<ViewStyle>;
};

function initials(name?: string) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '✦';
}

export function Avatar({ uri, name, size = 48, ring = null, style }: AvatarProps) {
  const ringWidth = ring ? Math.max(2, Math.round(size / 28)) : 0;

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: ring ?? colors.transparent,
          padding: ring ? ringWidth : 0,
        },
        style,
      ]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { borderRadius: size / 2 }]} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.fallback, { borderRadius: size / 2 }]}>
          <AppText
            color={colors.accent}
            style={{ fontFamily: fontFamily.display, fontSize: size * 0.38, lineHeight: size * 0.46 }}>
            {initials(name)}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  image: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
});
