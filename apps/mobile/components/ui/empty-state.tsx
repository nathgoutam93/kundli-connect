import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, space } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  message?: string;
  loading?: boolean;
  action?: ReactNode;
};

export function EmptyState({ icon = 'sparkles-outline', title, message, loading, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.halo}>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Ionicons name={icon} size={28} color={colors.accent} />
        )}
      </View>
      <AppText variant="title3" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="callout" color={colors.textMuted} align="center" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    gap: space.xs,
  },
  halo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
    marginBottom: space.sm,
  },
  message: {
    maxWidth: 300,
  },
  action: {
    marginTop: space.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
});
