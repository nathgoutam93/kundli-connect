import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { SwitchRow } from '@/components/ui/app-switch';
import { ChoiceRow } from '@/components/ui/choice';
import { space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

const FAMILY_PLAN_OPTIONS = ['Dont want Children', 'Want Children', 'Open to Children', 'Not Sure'];

const FAMILY_PLAN_LABELS: Record<string, string> = {
  'Dont want Children': "Don't want children",
  'Want Children': 'Want children',
  'Open to Children': 'Open to children',
  'Not Sure': 'Not sure yet',
};

export default function FamilyPlanningScreen() {
  const { profile, updateProfile } = useAppData();
  const [familyPlans, setFamilyPlans] = useState(profile.familyPlans || 'Want Children');
  const [familyPlansVisibleOnProfile, setFamilyPlansVisibleOnProfile] = useState(
    profile.familyPlansVisibleOnProfile ?? true
  );

  async function handleContinue() {
    await updateProfile({ familyPlans, familyPlansVisibleOnProfile });
    router.push('/(onboarding)/notifications');
  }

  return (
    <OnboardingStep step="family-planning" title="What are your family plans?" onContinue={handleContinue}>
      <View style={styles.optionGroup}>
        {FAMILY_PLAN_OPTIONS.map((option) => (
          <ChoiceRow
            key={option}
            label={FAMILY_PLAN_LABELS[option] ?? option}
            selected={familyPlans === option}
            onPress={() => setFamilyPlans(option)}
          />
        ))}
      </View>
      <SwitchRow
        label="Show on profile"
        value={familyPlansVisibleOnProfile}
        onValueChange={setFamilyPlansVisibleOnProfile}
      />
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  optionGroup: {
    gap: space.sm,
  },
});
