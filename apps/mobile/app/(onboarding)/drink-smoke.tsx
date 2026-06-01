import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ProgressiveBlur } from '@/components/progressive-blur';
import { useAppState } from '@/store/use-app-state';

const HABIT_OPTIONS = ['Never', 'Sometimes', 'Often', 'Prefer not to say'];

export default function DrinkSmokeScreen() {
  const { profile, updateProfile } = useAppState();
  const [drinking, setDrinking] = useState(profile.drinking || '');
  const [smoking, setSmoking] = useState(profile.smoking || '');
  const [drinkingVisibleOnProfile, setDrinkingVisibleOnProfile] = useState(
    profile.drinkingVisibleOnProfile ?? true
  );
  const [smokingVisibleOnProfile, setSmokingVisibleOnProfile] = useState(
    profile.smokingVisibleOnProfile ?? true
  );
  const isValid = Boolean(drinking) && Boolean(smoking);

  function handleContinue() {
    updateProfile({
      drinking,
      drinkingVisibleOnProfile,
      smoking,
      smokingVisibleOnProfile,
    });
    router.push('/(onboarding)/photos');
  }

  return (
    <View style={styles.container}>
      <View style={styles.fixedHeader} pointerEvents="none">
        <ProgressiveBlur />
      </View>

      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={27} color="#111111" />
      </Pressable>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Do you drink?</Text>
        <View style={styles.optionGroup}>
          {HABIT_OPTIONS.map((option) => {
            const isSelected = drinking === option;

            return (
              <Pressable
                key={`drink-${option}`}
                style={[styles.option, isSelected && styles.selectedOption]}
                onPress={() => setDrinking(option)}>
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
        <VisibilityToggle
          value={drinkingVisibleOnProfile}
          onValueChange={setDrinkingVisibleOnProfile}
        />

        <Text style={[styles.title, styles.secondTitle]}>Do you smoke?</Text>
        <View style={styles.optionGroup}>
          {HABIT_OPTIONS.map((option) => {
            const isSelected = smoking === option;

            return (
              <Pressable
                key={`smoke-${option}`}
                style={[styles.option, isSelected && styles.selectedOption]}
                onPress={() => setSmoking(option)}>
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
        <VisibilityToggle
          value={smokingVisibleOnProfile}
          onValueChange={setSmokingVisibleOnProfile}
        />
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

type VisibilityToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

function VisibilityToggle({ value, onValueChange }: VisibilityToggleProps) {
  return (
    <View style={styles.visibilityRow}>
      <Text style={styles.visibilityLabel}>Visible on profile</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E1D7C6', true: '#FBD06D' }}
        thumbColor={value ? '#FCAD00' : '#F8F1E4'}
        ios_backgroundColor="#E1D7C6"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFCF7',
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    zIndex: 1,
    overflow: 'hidden',
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
  secondTitle: {
    marginTop: 32,
  },
  optionGroup: {
    marginTop: 22,
    gap: 12,
  },
  option: {
    height: 50,
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
  visibilityRow: {
    minHeight: 38,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  visibilityLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    color: '#55524E',
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
