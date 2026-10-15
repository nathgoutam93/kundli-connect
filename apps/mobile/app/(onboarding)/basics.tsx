import { router } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding-step';
import { TextField } from '@/components/ui/text-field';
import { useAppData } from '@/hooks/use-app-data';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BasicsScreen() {
    const { isServiceBusy, profile, serviceError, updateProfile } = useAppData();
    const [name, setName] = useState(profile.name === 'New User' ? '' : profile.name);
    const [email, setEmail] = useState(profile.email);

    async function handleContinue() {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();
        const isEmailValid = EMAIL_PATTERN.test(trimmedEmail);

        if (!trimmedName || !isEmailValid || isServiceBusy) {
            return;
        }

        await updateProfile({
            name: trimmedName,
            email: trimmedEmail,
        });

        router.push('/(onboarding)/kundli-details');
    }

    const isFormValid = Boolean(name.trim()) && EMAIL_PATTERN.test(email.trim());

    return (
        <OnboardingStep
            step="basics"
            title="Let’s start with you"
            subtitle="Your name appears on your profile. Your email stays private."
            onContinue={handleContinue}
            canContinue={isFormValid}
            isBusy={isServiceBusy}
            error={serviceError}
            showBack={false}>
            <TextField
                label="First name"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                returnKeyType="next"
                autoCapitalize="words"
                autoComplete="given-name"
            />
            <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="done"
                hint="Used to keep your account secure."
            />
        </OnboardingStep>
    );
}
