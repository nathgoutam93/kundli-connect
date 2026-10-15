import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { SwitchRow } from '@/components/ui/app-switch';
import { AppText } from '@/components/ui/app-text';
import { ChoiceChip } from '@/components/ui/choice';
import { space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

const HABIT_OPTIONS = ['Never', 'Sometimes', 'Often', 'Prefer not to say'];

export default function DrinkSmokeScreen() {
  const { profile, updateProfile } = useAppData();
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
    <OnboardingStep
      step="drink-smoke"
      title="A few habits"
      subtitle="Honest answers make for better matches."
      onContinue={handleContinue}
      canContinue={isValid}>
      <HabitQuestion
        question="Do you drink?"
        value={drinking}
        onChange={setDrinking}
        visibleOnProfile={drinkingVisibleOnProfile}
        onVisibleOnProfileChange={setDrinkingVisibleOnProfile}
      />
      <HabitQuestion
        question="Do you smoke?"
        value={smoking}
        onChange={setSmoking}
        visibleOnProfile={smokingVisibleOnProfile}
        onVisibleOnProfileChange={setSmokingVisibleOnProfile}
      />
    </OnboardingStep>
  );
}

type HabitQuestionProps = {
  question: string;
  value: string;
  onChange: (value: string) => void;
  visibleOnProfile: boolean;
  onVisibleOnProfileChange: (value: boolean) => void;
};

function HabitQuestion({ question, value, onChange, visibleOnProfile, onVisibleOnProfileChange }: HabitQuestionProps) {
  return (
    <View style={styles.question}>
      <AppText variant="title3">{question}</AppText>
      <View style={styles.chips}>
        {HABIT_OPTIONS.map((option) => (
          <ChoiceChip key={option} label={option} selected={value === option} onPress={() => onChange(option)} />
        ))}
      </View>
      <SwitchRow label="Show on profile" value={visibleOnProfile} onValueChange={onVisibleOnProfileChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  question: {
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
});
