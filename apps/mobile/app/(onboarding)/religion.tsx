import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { ChoiceRow } from '@/components/ui/choice';
import { space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

const RELIGION_OPTIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Spiritual', 'Prefer not to say'];

export default function ReligionScreen() {
  const { profile, updateProfile } = useAppData();
  const [religiousBeliefs, setReligiousBeliefs] = useState(profile.religiousBeliefs || '');
  const isValid = Boolean(religiousBeliefs);

  async function handleContinue() {
    await updateProfile({ religiousBeliefs });
    router.push('/(onboarding)/drink-smoke');
  }

  return (
    <OnboardingStep
      step="religion"
      title="What are your religious beliefs?"
      onContinue={handleContinue}
      canContinue={isValid}>
      <View style={styles.optionGroup}>
        {RELIGION_OPTIONS.map((option) => (
          <ChoiceRow
            key={option}
            label={option}
            selected={religiousBeliefs === option}
            onPress={() => setReligiousBeliefs(option)}
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
