import { router } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding-step';
import { TextField } from '@/components/ui/text-field';
import { useAppData } from '@/hooks/use-app-data';

const BIO_MAX_LENGTH = 180;

export default function BioScreen() {
  const { profile, updateProfile } = useAppData();
  const [bio, setBio] = useState(profile.bio ?? '');
  const trimmedBio = bio.trim();
  const canContinue = Boolean(trimmedBio);

  function handleContinue() {
    if (!canContinue) {
      return;
    }

    updateProfile({ bio: trimmedBio });
    router.push('/(onboarding)/gender-preferences');
  }

  return (
    <OnboardingStep
      step="bio"
      title="Describe yourself"
      subtitle="A line or two about what makes you, you. This is the first thing matches read."
      onContinue={handleContinue}
      canContinue={canContinue}>
      <TextField
        value={bio}
        onChangeText={setBio}
        placeholder="Chai over coffee, mountains over beaches…"
        multiline
        maxLength={BIO_MAX_LENGTH}
        returnKeyType="done"
        hint={`${bio.length}/${BIO_MAX_LENGTH}`}
      />
    </OnboardingStep>
  );
}
