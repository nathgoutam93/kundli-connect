import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { colors, gutter, space } from '@/constants/theme';

type ScreenHeaderProps = {
  title?: string;
  /** Large serif title shown below the bar, for top-level screens. */
  largeTitle?: string;
  subtitle?: string;
  onBack?: (() => void) | false;
  backIcon?: 'chevron-back' | 'close';
  right?: ReactNode;
};

export function ScreenHeader({
  title,
  largeTitle,
  subtitle,
  onBack,
  backIcon = 'chevron-back',
  right,
}: ScreenHeaderProps) {
  const showBack = onBack !== false;
  const hasBar = showBack || Boolean(title) || Boolean(right);

  return (
    <View style={styles.container}>
      {hasBar ? (
        <View style={styles.bar}>
          <View style={styles.side}>
            {showBack ? (
              <IconButton
                icon={backIcon}
                accessibilityLabel={backIcon === 'close' ? 'Close' : 'Go back'}
                onPress={onBack || (() => router.back())}
                size={40}
              />
            ) : null}
          </View>
          {title ? (
            <AppText variant="headline" align="center" numberOfLines={1} style={styles.title}>
              {title}
            </AppText>
          ) : (
            <View style={styles.title} />
          )}
          <View style={[styles.side, styles.sideRight]}>{right}</View>
        </View>
      ) : null}
      {largeTitle ? (
        <View style={styles.large}>
          <AppText variant="title1">{largeTitle}</AppText>
          {subtitle ? (
            <AppText variant="callout" color={colors.textMuted}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: gutter,
    paddingTop: space.xs,
    gap: space.md,
  },
  bar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideRight: {
    justifyContent: 'flex-end',
    gap: space.xs,
  },
  title: {
    flex: 1,
  },
  large: {
    gap: space.xxs,
    paddingBottom: space.xs,
  },
});
