import { View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { colors, space } from '@/constants/theme';

export function LoadErrorNotice({ subject, onRetry }: { subject: string; onRetry: () => Promise<unknown> }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ padding: space.md, gap: space.xs }}>
      <AppText color={colors.danger}>Could not refresh {subject}. Please try again.</AppText>
      <Button label="Try again" variant="secondary" fullWidth={false} onPress={() => { void onRetry(); }} />
    </View>
  );
}
