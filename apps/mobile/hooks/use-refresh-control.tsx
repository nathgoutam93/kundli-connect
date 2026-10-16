import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

import { colors } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

/** Gold-tinted pull-to-refresh for a ScrollView: `<ScrollView refreshControl={useRefreshControl(refetch)} />`. */
export function useRefreshControl(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    haptics.tap();
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.surfaceRaised}
    />
  );
}
