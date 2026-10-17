import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { ChoiceRow } from '@/components/ui/choice';
import { space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { isIncludedByEveryone, PREFERENCE_OPTIONS, togglePreference } from '@/lib/gender-preferences';

function getDefaultPreferences(gender: string) {
  if (gender === 'Male') {
    return ['Female'];
  }

  if (gender === 'Female') {
    return ['Male'];
  }

  return [];
}

export default function GenderPreferencesScreen() {
  const { profile, updateProfile } = useAppData();
  const savedPreferences = profile.genderPreferences ?? [];
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(
    savedPreferences.length > 0 ? savedPreferences : getDefaultPreferences(profile.gender)
  );


  async function handleContinue() {
    await updateProfile({ genderPreferences: selectedPreferences });
    router.push('/(onboarding)/family-planning');
  }

  return (
    <OnboardingStep
      step="gender-preferences"
      title="Who would you like to meet?"
      subtitle="Choose all that apply. You can change this later."
      onContinue={handleContinue}
      canContinue={selectedPreferences.length > 0}>
      <View style={styles.optionGroup}>
        {PREFERENCE_OPTIONS.map((option) => (
          <ChoiceRow
            key={option}
            label={option}
            indicator="check"
            selected={selectedPreferences.includes(option)}
            included={isIncludedByEveryone(selectedPreferences, option)}
            onPress={() => setSelectedPreferences((current) => togglePreference(current, option))}
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
