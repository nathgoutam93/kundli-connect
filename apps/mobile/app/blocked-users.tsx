import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { ListMoreButton } from '@/components/list-more-button';
import { LoadErrorNotice } from '@/components/load-error-notice';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { toast } from '@/components/ui/toast';
import { colors, gutter, radius, space } from '@/constants/theme';
import { useBlockedUsersQuery, useSafetyActions } from '@/hooks/use-safety-actions';
import { listItemEntering, listItemExiting, listItemLayout } from '@/lib/list-motion';

/** People the user has blocked, with a way to unblock them. */
export default function BlockedUsersScreen() {
  const { data: blocked = [], isPending, error,refetch,hasNextPage,isFetchingNextPage,fetchNextPage } = useBlockedUsersQuery();
  const { unblock } = useSafetyActions();
  const [busyId, setBusyId] = useState<string | null>(null);

  function confirmUnblock(userId: string, name: string) {
    Alert.alert(`Unblock ${name}?`, 'You may see each other in Discover again. Your old chat won’t come back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          setBusyId(userId);
          try {
            await unblock(userId);
            toast.info(`${name} is unblocked.`);
          } catch (unblockError) {
            Alert.alert('Could not unblock', unblockError instanceof Error ? unblockError.message : 'Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  return (
    <Screen starSeed={27}>
      <ScreenHeader title="Blocked people" />
      {error ? <LoadErrorNotice subject="blocked people" onRetry={refetch} /> : null}
      {blocked.length > 0 ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <AppText variant="footnote" color={colors.textMuted}>
            Blocked people can’t see your profile or contact you, and you won’t see them.
          </AppText>
          <View style={styles.list}>
            {blocked.map((person, index) => (
              <Animated.View
                key={person.userId}
                entering={listItemEntering(index)}
                exiting={listItemExiting}
                layout={listItemLayout}
                style={[styles.row, index > 0 && styles.divider]}>
                <Avatar uri={person.photoUrl} name={person.name} size={44} />
                <View style={styles.rowText}>
                  <AppText variant="headline" numberOfLines={1}>
                    {person.name}
                  </AppText>
                  <AppText variant="footnote" color={colors.textMuted}>
                    Blocked {new Date(person.blockedAt).toLocaleDateString()}
                  </AppText>
                </View>
                <Button
                  label="Unblock"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  loading={busyId === person.userId}
                  disabled={busyId !== null && busyId !== person.userId}
                  onPress={() => confirmUnblock(person.userId, person.name)}
                />
              </Animated.View>
            ))}
          </View>
          <ListMoreButton hasMore={hasNextPage} loading={isFetchingNextPage} onLoad={fetchNextPage} />
        </ScrollView>
      ) : (
        <EmptyState
          loading={isPending}
          icon={error ? 'cloud-offline-outline' : 'shield-checkmark-outline'}
          title={isPending ? 'Loading' : error ? 'Could not load' : 'No one blocked'}
          message={
            error
              ? error.message
              : 'If someone makes you uncomfortable, you can block or report them from their profile or your chat.'
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  list: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
