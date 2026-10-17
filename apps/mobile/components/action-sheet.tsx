import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { colors, radius, space } from '@/constants/theme';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { AnimatedPressable, durations } from '@/lib/motion';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type SheetAction = {
  label: string;
  icon: IconName;
  tone?: 'default' | 'danger';
  onPress: () => void;
};

type ActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
};

/**
 * A list of actions in a bottom sheet, plus Cancel. The sheet closes before the action runs, so
 * a confirmation alert or another sheet it opens isn't stacked on top of a closing one.
 */
export function ActionSheet({ visible, onClose, title, actions }: ActionSheetProps) {
  function run(action: SheetAction) {
    onClose();
    setTimeout(action.onPress, durations.base + 80);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.list}>
        {actions.map((action, index) => (
          <ActionRow key={action.label} action={action} showDivider={index > 0} onPress={() => run(action)} />
        ))}
      </View>
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}

function ActionRow({ action, showDivider, onPress }: { action: SheetAction; showDivider: boolean; onPress: () => void }) {
  const color = action.tone === 'danger' ? colors.danger : colors.text;
  const { animatedStyle, pressHandlers } = usePressAnimation({
    pressedScale: 0.98,
    backgroundColor: 'rgba(33, 33, 33, 0)',
    pressedBackgroundColor: colors.surfaceRaised,
    onPress,
  });

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={[styles.row, showDivider && styles.divider, animatedStyle]}
      {...pressHandlers}>
      <Ionicons name={action.icon} size={20} color={action.tone === 'danger' ? colors.danger : colors.accent} />
      <AppText variant="bodyStrong" color={color} style={styles.label}>
        {action.label}
      </AppText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  label: {
    flex: 1,
  },
});
