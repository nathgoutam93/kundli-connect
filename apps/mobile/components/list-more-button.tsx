import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { space } from '@/constants/theme';

export function ListMoreButton({ hasMore, loading, onLoad }: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => Promise<unknown>;
}) {
  if (!hasMore) return null;
  return (
    <View style={{ padding: space.md }}>
      <Button label="Load more" variant="secondary" loading={loading} disabled={loading} onPress={() => { void onLoad(); }} />
    </View>
  );
}
