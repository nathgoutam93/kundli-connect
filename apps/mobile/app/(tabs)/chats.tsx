import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type ChatPreview } from '@/constants/mock-data';
import { useAppState } from '@/store/use-app-state';

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const { chats } = useAppState();
  const visibleChats = chats.filter((chat) => !chat.hidden);
  const hiddenMatches = chats.filter((chat) => chat.hidden);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top + 28, 58), paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Matches</Text>

        <MatchSection title="Your turn" count={visibleChats.length} matches={visibleChats} />
        <MatchSection title="Hidden" count={hiddenMatches.length} matches={hiddenMatches} />
      </ScrollView>
    </View>
  );
}

function MatchSection({
  title,
  count,
  matches,
}: {
  title: string;
  count: number;
  matches: ChatPreview[];
}) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => setIsExpanded((current) => !current)}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.rowPressed]}>
        <Text style={styles.sectionTitle}>
          {title} ({count})
        </Text>
        <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={20} color="#191614" />
      </Pressable>

      {isExpanded ? (
        <View style={styles.list}>
          {matches.map((match) => (
            <Pressable
              key={match.id}
              onPress={() => router.push(`/chat/${match.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <Image source={{ uri: match.avatarUrl }} style={styles.avatar} />
              <View style={styles.rowText}>
                <Text style={styles.name}>{match.name}</Text>
                <Text numberOfLines={1} style={styles.message}>
                  {match.lastMessage}
                </Text>
              </View>
              {match.unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{match.unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    color: '#171412',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 28,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 34,
  },
  sectionTitle: {
    color: '#201C19',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  list: {
    borderTopColor: '#EEEAE6',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#EEEAE6',
    borderBottomWidth: StyleSheet.hairlineWidth,
    display: 'flex',
    flexDirection: 'row',
    minHeight: 94,
    paddingVertical: 14,
    width: '100%',
  },
  rowPressed: {
    opacity: 0.65,
  },
  avatar: {
    backgroundColor: '#EFEAE5',
    borderRadius: 31,
    height: 62,
    marginRight: 16,
    width: 62,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: '#2B2622',
    flexShrink: 1,
    fontSize: 19,
    fontWeight: '500',
    letterSpacing: 0,
    marginBottom: 7,
  },
  message: {
    color: '#1E1A17',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 19,
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: '#7D2B76',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    marginLeft: 10,
    minWidth: 24,
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});
