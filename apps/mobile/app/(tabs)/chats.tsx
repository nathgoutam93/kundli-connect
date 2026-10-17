import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { LoadErrorNotice } from '@/components/load-error-notice';
import { ListMoreButton } from '@/components/list-more-button';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ChatsSkeleton } from '@/components/ui/skeleton';
import { colors, gutter, radius, space } from '@/constants/theme';
import { type ChatPreview } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { useRefreshControl } from '@/hooks/use-refresh-control';
import { haptics } from '@/lib/haptics';
import { listItemEntering, listItemExiting, listItemLayout } from '@/lib/list-motion';
import { AnimatedPressable, springs } from '@/lib/motion';

export default function ChatsScreen() {
  const { chats, chatsError, isLoadingChats, refreshChats,hasMoreChats,isLoadingMoreChats,loadMoreChats } = useAppData();
  const refreshControl = useRefreshControl(refreshChats);
  const visibleChats = chats.filter((chat) => !chat.hidden);
  const hiddenMatches = chats.filter((chat) => chat.hidden);

  return (
    <Screen starSeed={9}>
      <ScreenHeader onBack={false} largeTitle="Matches" />
      {chatsError ? <LoadErrorNotice subject="matches" onRetry={refreshChats} /> : null}
      {chats.length === 0 && isLoadingChats ? (
        <ChatsSkeleton />
      ) : chats.length > 0 ? (
        <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
          <MatchSection title="Conversations" matches={visibleChats} />
          {hiddenMatches.length > 0 ? (
            <MatchSection title="Hidden" matches={hiddenMatches} initiallyExpanded={false} />
          ) : null}
          <ListMoreButton hasMore={hasMoreChats} loading={isLoadingMoreChats} onLoad={loadMoreChats} />
        </ScrollView>
      ) : chatsError ? null : (
        <ScrollView contentContainerStyle={styles.emptyContent} refreshControl={refreshControl}>
          <EmptyState
            icon="chatbubbles-outline"
            title="No matches yet"
            message="When you and someone else connect, your conversation will start here."
          />
        </ScrollView>
      )}
    </Screen>
  );
}

function MatchSection({
  title,
  matches,
  initiallyExpanded = true,
}: {
  title: string;
  matches: ChatPreview[];
  initiallyExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const chevron = useSharedValue(initiallyExpanded ? 1 : 0);

  useEffect(() => {
    chevron.value = withSpring(isExpanded ? 1 : 0, springs.settle);
  }, [chevron, isExpanded]);

  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevron.value * 90}deg` }] }));

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => {
          haptics.select();
          setIsExpanded((current) => !current);
        }}
        style={styles.sectionHeader}>
        <AppText variant="overline" color={colors.textMuted}>
          {title} · {matches.length}
        </AppText>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      {isExpanded ? (
        <Animated.View entering={FadeIn.duration(180)} layout={listItemLayout} style={styles.list}>
          {matches.map((match, index) => (
            <Animated.View
              key={match.id}
              entering={listItemEntering(index)}
              exiting={listItemExiting}
              layout={listItemLayout}>
              <ChatRow match={match} showDivider={index > 0} />
            </Animated.View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

function ChatRow({ match, showDivider }: { match: ChatPreview; showDivider: boolean }) {
  const router = useRouter();
  const hasUnread = match.unreadCount > 0;
  const { animatedStyle, pressHandlers } = usePressAnimation({
    pressedScale: 0.985,
    backgroundColor: 'rgba(33, 33, 33, 0)',
    pressedBackgroundColor: colors.surfaceRaised,
    haptic: false,
    onPress: () => router.push(`/chat/${match.id}`),
  });

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${match.name}${hasUnread ? `, ${match.unreadCount} unread` : ''}`}
      style={[styles.row, showDivider && styles.rowDivider, animatedStyle]}
      {...pressHandlers}>
      <Avatar uri={match.avatarUrl} name={match.name} size={56} ring={hasUnread ? colors.accent : null} />
      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          <AppText variant="headline" numberOfLines={1} style={styles.name}>
            {match.name}
          </AppText>
          {match.compatibilityScore !== null ? (
            <View style={styles.scoreTag}>
              <Ionicons name="sparkles" size={10} color={colors.accent} />
              <AppText variant="caption" color={colors.accent}>
                {match.compatibilityScore}%
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="callout" numberOfLines={1} color={hasUnread ? colors.text : colors.textMuted}>
          {match.lastMessage || 'Say hello 👋'}
        </AppText>
      </View>
      {hasUnread ? <UnreadBadge count={match.unreadCount} /> : null}
    </AnimatedPressable>
  );
}

/** Unread count that pops whenever a new message raises it. */
function UnreadBadge({ count }: { count: number }) {
  const scale = useSharedValue(1);
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current) {
      scale.value = withSequence(withTiming(1.4, { duration: 110 }), withSpring(1, springs.pop));
    }
    previous.current = count;
  }, [count, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.unreadBadge, style]}>
      <AppText variant="caption" color={colors.onAccent}>
        {count}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  emptyContent: {
    flexGrow: 1,
  },
  content: {
    paddingHorizontal: gutter,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  section: {
    gap: space.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingVertical: space.xs,
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
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  name: {
    flexShrink: 1,
  },
  scoreTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
