import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors, gutter, radius, space } from '@/constants/theme';
import { type ChatPreview } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';

export default function ChatsScreen() {
  const { chats } = useAppData();
  const visibleChats = chats.filter((chat) => !chat.hidden);
  const hiddenMatches = chats.filter((chat) => chat.hidden);

  return (
    <Screen starSeed={9}>
      <ScreenHeader onBack={false} largeTitle="Matches" />
      {chats.length > 0 ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <MatchSection title="Conversations" matches={visibleChats} />
          {hiddenMatches.length > 0 ? (
            <MatchSection title="Hidden" matches={hiddenMatches} initiallyExpanded={false} />
          ) : null}
        </ScrollView>
      ) : (
        <EmptyState
          icon="chatbubbles-outline"
          title="No matches yet"
          message="When you and someone else connect, your conversation will start here."
        />
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
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => setIsExpanded((current) => !current)}
        style={styles.sectionHeader}>
        <AppText variant="overline" color={colors.textMuted}>
          {title} · {matches.length}
        </AppText>
        <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
      </Pressable>

      {isExpanded ? (
        <View style={styles.list}>
          {matches.map((match, index) => {
            const hasUnread = match.unreadCount > 0;

            return (
              <Pressable
                key={match.id}
                accessibilityRole="button"
                accessibilityLabel={`Chat with ${match.name}${hasUnread ? `, ${match.unreadCount} unread` : ''}`}
                onPress={() => router.push(`/chat/${match.id}`)}
                style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.rowPressed]}>
                <Avatar uri={match.avatarUrl} name={match.name} size={56} ring={hasUnread ? colors.accent : null} />
                <View style={styles.rowText}>
                  <View style={styles.rowTitle}>
                    <AppText variant="headline" numberOfLines={1} style={styles.name}>
                      {match.name}
                    </AppText>
                    {match.compatibilityScore ? (
                      <View style={styles.scoreTag}>
                        <Ionicons name="sparkles" size={10} color={colors.accent} />
                        <AppText variant="caption" color={colors.accent}>
                          {match.compatibilityScore}%
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText
                    variant="callout"
                    numberOfLines={1}
                    color={hasUnread ? colors.text : colors.textMuted}>
                    {match.lastMessage || 'Say hello 👋'}
                  </AppText>
                </View>
                {hasUnread ? (
                  <View style={styles.unreadBadge}>
                    <AppText variant="caption" color={colors.onAccent}>
                      {match.unreadCount}
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  rowPressed: {
    backgroundColor: colors.surfaceRaised,
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
