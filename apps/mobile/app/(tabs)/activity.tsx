import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activity = useAppData((state) => state.activity);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top + 26, 54), paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Local timeline</Text>
            <Text style={styles.title}>Activity</Text>
          </View>
          <Pressable style={styles.headerButton} onPress={() => router.push('/subscriptions')}>
            <Ionicons name="flash" size={18} color="#2D241E" />
          </Pressable>
        </View>

        {activity.length > 0 ? (
          <View style={styles.list}>
            {activity.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name={iconByType[item.type]} size={20} color="#FFFFFF" />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowDescription}>{item.description}</Text>
                </View>
                <Text style={styles.time}>{item.time}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={34} color="#8D7F74" />
            <Text style={styles.emptyTitle}>Nothing yet</Text>
            <Text style={styles.emptyText}>Likes, matches, chat replies, and credit updates will appear here.</Text>
          </View>
        )}
      </ScrollView>
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  eyebrow: {
    color: '#8A7B70',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#171412',
    fontSize: 30,
    fontWeight: '800',
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: '#F6D36B',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  list: {
    borderTopColor: '#EEEAE6',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#EEEAE6',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 14,
    minHeight: 88,
    paddingVertical: 14,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#7D2B76',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: '#24201D',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  rowDescription: {
    color: '#6F655D',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  time: {
    color: '#9A8F86',
    fontSize: 12,
    fontWeight: '800',
  },
  empty: {
    alignItems: 'center',
    borderColor: '#EEE5DA',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 42,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyTitle: {
    color: '#27221E',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 14,
  },
  emptyText: {
    color: '#6D6259',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
});
