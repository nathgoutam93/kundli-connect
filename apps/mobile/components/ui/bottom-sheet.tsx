import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { colors, gutter, radius, space } from '@/constants/theme';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  /** Label for a compact action in the header, e.g. "Done". */
  doneLabel?: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

export function BottomSheet({ visible, onClose, title, eyebrow, doneLabel, children, contentStyle }: BottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.layer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }, contentStyle]}>
          <View style={styles.handle} />
          {title || doneLabel ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                {eyebrow ? (
                  <AppText variant="overline" color={colors.accent}>
                    {eyebrow}
                  </AppText>
                ) : null}
                {title ? <AppText variant="title3">{title}</AppText> : null}
              </View>
              {doneLabel ? (
                <Button label={doneLabel} variant="secondary" size="sm" fullWidth={false} onPress={onClose} />
              ) : null}
            </View>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    gap: space.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
});
