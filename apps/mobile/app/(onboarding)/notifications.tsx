import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppState } from '@/store/use-app-state';

export default function NotificationsScreen() {
  const { completeOnboarding } = useAppState();

  async function handleContinue() {
    await completeOnboarding();
    router.replace('/(tabs)');
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={27} color="#111111" />
      </Pressable>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your destiny might message anytime, Dont Miss It!</Text>

        <View style={styles.optionGroup}>
          <Pressable style={styles.primaryOption} onPress={handleContinue}>
            <Text style={styles.optionText}>Turn On Notifications</Text>
          </Pressable>

          <Pressable style={styles.secondaryOption} onPress={handleContinue}>
            <Text style={styles.optionText}>Miss Out Notifications</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Pressable style={styles.nextButton} onPress={handleContinue}>
        <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFCF7',
  },
  backButton: {
    position: 'absolute',
    zIndex: 2,
    top: 93,
    left: 27,
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: '#FFFCF7',
    borderWidth: 1,
    borderColor: '#FBD06D',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FCAD00',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 27,
    paddingTop: 150,
    paddingBottom: 128,
  },
  title: {
    maxWidth: 360,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '500',
    color: '#050505',
  },
  optionGroup: {
    marginTop: 36,
    gap: 12,
  },
  primaryOption: {
    height: 55,
    borderRadius: 16,
    backgroundColor: '#FFD016',
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  secondaryOption: {
    height: 55,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFC400',
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  optionText: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '400',
    color: '#050505',
  },
  nextButton: {
    position: 'absolute',
    right: 19,
    bottom: 40,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FCAD00',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
