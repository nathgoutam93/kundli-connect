import { router } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding-step';
import { TextField } from '@/components/ui/text-field';
import { useAppData } from '@/hooks/use-app-data';
import { NAME_MAX_LENGTH, CONTACT_EMAIL_MAX_LENGTH } from '@/lib/profile-validation';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BasicsScreen() {
    const { isServiceBusy, profile, serviceError, updateProfile } = useAppData();
    const [name, setName] = useState(profile.name === 'New User' ? '' : profile.name);
    const [email, setEmail] = useState(profile.email);
    const [city, setCity] = useState(profile.location);

    async function handleContinue() {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();
        const isEmailValid = EMAIL_PATTERN.test(trimmedEmail);

        if (!trimmedName || !isEmailValid || !city.trim() || city.trim().toLowerCase() === 'india' || isServiceBusy) {
            return;
        }

        await updateProfile({
            name: trimmedName,
            email: trimmedEmail,
            location: city.trim(),
        });

        router.push('/(onboarding)/kundli-details');
    }

    const isFormValid = Boolean(name.trim()) && EMAIL_PATTERN.test(email.trim()) && Boolean(city.trim()) && city.trim().toLowerCase() !== 'india';

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
                maxLength={NAME_MAX_LENGTH}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                returnKeyType="next"
                autoCapitalize="words"
                autoComplete="given-name"
            />
            <TextField
                label="Contact email"
                maxLength={CONTACT_EMAIL_MAX_LENGTH}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="done"
                hint="Used for receipts. It won’t change how you sign in."
            />
            <TextField
                label="Current city"
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Mumbai, Maharashtra"
                maxLength={120}
                autoCapitalize="words"
                hint="Where you live now. This appears on your profile."
            />
        </OnboardingStep>
    );
}
