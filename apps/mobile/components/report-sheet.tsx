import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { SwitchRow } from '@/components/ui/app-switch';
import { AppText } from '@/components/ui/app-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { ChoiceChip } from '@/components/ui/choice';
import { TextField } from '@/components/ui/text-field';
import { toast } from '@/components/ui/toast';
import { colors, space } from '@/constants/theme';
import { useSafetyActions } from '@/hooks/use-safety-actions';
import { haptics } from '@/lib/haptics';
import { REPORT_REASONS, type ReportReason } from '@/services/safety-service';

type ReportSheetProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  name: string;
  /** Called after a report is filed; `blocked` says whether they were blocked too. */
  onReported?: (blocked: boolean) => void;
};

/** Report a person: a reason, optional details, and (on by default) block them too. */
export function ReportSheet({ visible, onClose, userId, name, onReported }: ReportSheetProps) {
  const { report } = useSafetyActions();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Start fresh each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setAlsoBlock(true);
    }
  }, [visible]);

  async function submit() {
    if (!reason || isSending) {
      return;
    }
    setIsSending(true);
    try {
      await report({ userId, reason, details, block: alsoBlock });
      toast.show({
        title: 'Report sent',
        message: alsoBlock ? `Thanks for telling us. You won’t see ${name} again.` : 'Thanks for telling us. We review every report.',
        tone: 'success',
        icon: 'shield-checkmark',
      });
      onClose();
      onReported?.(alsoBlock);
    } catch (error) {
      haptics.error();
      Alert.alert('Report not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} eyebrow="Safety" title={`Report ${name}`} scrollable>
      <View style={styles.section}>
        <AppText variant="subhead" color={colors.textMuted}>
          What’s wrong?
        </AppText>
        <View style={styles.reasons}>
          {REPORT_REASONS.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              icon={option.icon as ComponentProps<typeof Ionicons>['name']}
              selected={reason === option.value}
              onPress={() => setReason(option.value)}
            />
          ))}
        </View>
      </View>

      <TextField
        multiline
        maxLength={1000}
        value={details}
        onChangeText={setDetails}
        placeholder="Anything that helps us review it (optional)"
        style={styles.details}
      />

      <SwitchRow
        label={`Also block ${name}`}
        description="You won’t see each other again, and any chat between you ends."
        value={alsoBlock}
        onValueChange={setAlsoBlock}
      />

      <Button
        label="Send report"
        icon="flag"
        variant="danger"
        loading={isSending}
        disabled={!reason}
        onPress={submit}
      />
      <AppText variant="footnote" color={colors.textFaint} align="center">
        {name} won’t be told who reported them.
      </AppText>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.xs,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  details: {
    minHeight: 72,
  },
});
