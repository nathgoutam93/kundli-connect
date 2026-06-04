import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '@/hooks/use-app-data';

const RELIGION_OPTIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Spiritual', 'Prefer not to say'];

export default function ReligionScreen() {
  const { profile, updateProfile } = useAppData();
  const [religiousBeliefs, setReligiousBeliefs] = useState(profile.religiousBeliefs || '');
  const isValid = Boolean(religiousBeliefs);

  function handleContinue() {
    updateProfile({ religiousBeliefs });
    router.push('/(onboarding)/drink-smoke');
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
        <Text style={styles.title}>What are your religious beliefs?</Text>

        <View style={styles.optionGroup}>
          {RELIGION_OPTIONS.map((option) => {
            const isSelected = religiousBeliefs === option;

            return (
              <Pressable
                key={option}
                style={[styles.option, isSelected && styles.selectedOption]}
                onPress={() => setReligiousBeliefs(option)}>
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Pressable
        style={[styles.nextButton, !isValid && styles.nextButtonDisabled]}
        onPress={handleContinue}
        disabled={!isValid}>
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
    top: 80,
    left: 28,
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
    paddingHorizontal: 28,
    paddingTop: 145,
    paddingBottom: 128,
  },
  title: {
    maxWidth: 380,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '500',
    color: '#050505',
  },
  optionGroup: {
    marginTop: 31,
    gap: 13,
  },
  option: {
    height: 55,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFC400',
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  selectedOption: {
    borderColor: '#FFD016',
    backgroundColor: '#FFD829',
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
  nextButtonDisabled: {
    opacity: 0.45,
  },
});
