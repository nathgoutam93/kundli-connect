import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { ChoiceRow } from '@/components/ui/choice';
import { space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

const GENDER_OPTIONS = ['Male', 'Female', 'Non - Binary'];

export default function GenderScreen() {
  const { profile, updateProfile } = useAppData();
  const [selectedGender, setSelectedGender] = useState(profile.gender || '');
  const isValid = Boolean(selectedGender);

  function handleContinue() {
    updateProfile({ gender: selectedGender });
    router.push('/(onboarding)/height');
  }

  return (
    <OnboardingStep
      step="gender"
      title="How do you identify?"
      subtitle="We use this with your preferences to find the right matches."
      onContinue={handleContinue}
      canContinue={isValid}>
      <View style={styles.optionGroup}>
        {GENDER_OPTIONS.map((option) => (
          <ChoiceRow
            key={option}
            label={option}
            selected={selectedGender === option}
            onPress={() => setSelectedGender(option)}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  optionGroup: {
    gap: space.sm,
  },
});
