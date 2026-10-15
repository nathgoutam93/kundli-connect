import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors, gutter, radius, space } from '@/constants/theme';
import { type ActivityItem } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';

const iconByType: Record<ActivityItem['type'], keyof typeof Ionicons.glyphMap> = {
  match: 'sparkles',
  like: 'heart',
  message: 'chatbubble-ellipses',
  profile: 'person',
  credit: 'flash',
  subscription: 'diamond',
};

const toneByType: Record<ActivityItem['type'], string> = {
  match: colors.accent,
  like: colors.like,
  message: colors.text,
  profile: colors.textMuted,
  credit: colors.accent,
  subscription: colors.accent,
};

export default function ActivityScreen() {
  const router = useRouter();
  const activity = useAppData((state) => state.activity);

  return (
    <Screen>
      <ScreenHeader
        onBack={false}
        largeTitle="Activity"
        right={
          <IconButton
            icon="flash"
            accessibilityLabel="Open plans and credits"
            size={40}
            iconColor={colors.accent}
            onPress={() => router.push('/subscriptions')}
          />
        }
      />

      {activity.length > 0 ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {activity.map((item, index) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.iconWrap, { borderColor: toneByType[item.type] }]}>
                  <Ionicons name={iconByType[item.type]} size={16} color={toneByType[item.type]} />
                </View>
                {index < activity.length - 1 ? <View style={styles.railLine} /> : null}
              </View>
              <View style={styles.rowText}>
                <View style={styles.rowTitle}>
                  <AppText variant="headline" style={styles.flex}>
                    {item.title}
                  </AppText>
                  <AppText variant="caption" color={colors.textFaint}>
                    {item.time}
                  </AppText>
                </View>
                <AppText variant="callout" color={colors.textMuted}>
                  {item.description}
                </AppText>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <EmptyState
          icon="notifications-outline"
          title="Nothing yet"
          message="Likes, matches, replies and credit updates will show up here."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: gutter,
    paddingBottom: space.xxl,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  rail: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  railLine: {
    flex: 1,
    width: 1,
    marginVertical: space.xxs,
    backgroundColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
    paddingTop: space.xs,
    paddingBottom: space.lg,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
