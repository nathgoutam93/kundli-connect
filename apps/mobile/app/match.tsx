import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppState } from '@/store/use-app-state';

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const chat = useAppState((state) => state.chats.find((item) => !item.hidden) ?? state.chats[0]);
  const viewer = useAppState((state) => state.profile);
  const viewerPhoto =
    viewer.photoUris[0] ??
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=85';

  if (!chat) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.title}>It is a match</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)/chats')}>
          <Text style={styles.primaryText}>Open chats</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top + 24, 48), paddingBottom: insets.bottom + 28 }]}>
      <Pressable style={styles.closeButton} onPress={() => router.back()}>
        <Ionicons name="close" size={23} color="#FFFFFF" />
      </Pressable>

      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{chat.compatibilityScore}% Kundli match</Text>
        <Text style={styles.title}>It is a Match</Text>
        <Text style={styles.subtitle}>You and {chat.name} can now continue the conversation in Chats.</Text>
      </View>

      <View style={styles.orbs}>
        <View style={[styles.orb, styles.orbMine]}>
          <Image source={{ uri: viewerPhoto }} style={styles.image} contentFit="cover" />
        </View>
        <View style={styles.spark}>
          <Ionicons name="sparkles" size={28} color="#2D241E" />
        </View>
        <View style={[styles.orb, styles.orbTheirs]}>
          <Image source={{ uri: chat.avatarUrl }} style={styles.image} contentFit="cover" />
        </View>
      </View>

      <View style={styles.icebreakers}>
        {['Ask about their ideal Sunday', 'Compare moon signs', 'Plan a first coffee'].map((item) => (
          <View key={item} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.primaryButton} onPress={() => router.replace(`/chat/${chat.id}`)}>
        <Text style={styles.primaryText}>Start chat</Text>
        <Ionicons name="chatbubble-ellipses" size={18} color="#2D241E" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#7D2B76',
    paddingHorizontal: 24,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  copy: {
    alignItems: 'center',
    marginTop: 28,
  },
  eyebrow: {
    color: '#F6D36B',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#F0E7F0',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: 12,
    textAlign: 'center',
  },
  orbs: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 42,
  },
  orb: {
    backgroundColor: '#FFFFFF',
    borderColor: '#F6D36B',
    borderRadius: 72,
    borderWidth: 4,
    height: 144,
    overflow: 'hidden',
    width: 144,
  },
  orbMine: {
    marginRight: -14,
  },
  orbTheirs: {
    marginLeft: -14,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  spark: {
    alignItems: 'center',
    backgroundColor: '#F6D36B',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    zIndex: 2,
    width: 56,
  },
  icebreakers: {
    gap: 10,
    marginTop: 40,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#F6D36B',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 'auto',
    minHeight: 54,
  },
  primaryText: {
    color: '#2D241E',
    fontSize: 16,
    fontWeight: '900',
  },
});
