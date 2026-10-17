import { router } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding-step';
import { PREFER_NOT_TO_SAY, ProfileTextField } from '@/components/profile-text-field';
import { useAppData } from '@/hooks/use-app-data';

export default function WorkScreen() {
    const { profile, updateProfile } = useAppData();
    const [workplace, setWorkplace] = useState(profile.workplace || '');
    const [jobRole, setJobRole] = useState(profile.jobRole || '');
    const [workplaceVisibleOnProfile, setWorkplaceVisibleOnProfile] = useState(
        profile.workplaceVisibleOnProfile ?? true
    );
    const [jobRoleVisibleOnProfile, setJobRoleVisibleOnProfile] = useState(
        profile.jobRoleVisibleOnProfile ?? true
    );
    const [workplacePreferNotToSay, setWorkplacePreferNotToSay] = useState(
        workplace === PREFER_NOT_TO_SAY
    );
    const [jobRolePreferNotToSay, setJobRolePreferNotToSay] = useState(
        jobRole === PREFER_NOT_TO_SAY
    );

    async function handleContinue() {
        await updateProfile({
            workplace: workplacePreferNotToSay ? PREFER_NOT_TO_SAY : workplace.trim(),
            workplaceVisibleOnProfile: workplacePreferNotToSay ? false : workplaceVisibleOnProfile,
            jobRole: jobRolePreferNotToSay ? PREFER_NOT_TO_SAY : jobRole.trim(),
            jobRoleVisibleOnProfile: jobRolePreferNotToSay ? false : jobRoleVisibleOnProfile,
        });
        router.push('/(onboarding)/education');
    }

    function toggleWorkplacePreferNotToSay() {
        setWorkplacePreferNotToSay((current) => {
            const next = !current;

            if (next) {
                setWorkplaceVisibleOnProfile(false);
            }

            return next;
        });
    }

    function toggleJobRolePreferNotToSay() {
        setJobRolePreferNotToSay((current) => {
            const next = !current;

            if (next) {
                setJobRoleVisibleOnProfile(false);
            }

            return next;
        });
    }

    return (
        <OnboardingStep
            step="work"
            title="Your work"
            subtitle="Share as much or as little as you like. You decide what shows on your profile."
            onContinue={handleContinue}>
            <ProfileTextField
                question="Where do you work?"
                value={workplace}
                onChangeText={setWorkplace}
                preferNotToSay={workplacePreferNotToSay}
                onTogglePreferNotToSay={toggleWorkplacePreferNotToSay}
                visibleOnProfile={workplaceVisibleOnProfile}
                onVisibleOnProfileChange={setWorkplaceVisibleOnProfile}
            />
            <ProfileTextField
                question="What do you do?"
                value={jobRole}
                onChangeText={setJobRole}
                preferNotToSay={jobRolePreferNotToSay}
                onTogglePreferNotToSay={toggleJobRolePreferNotToSay}
                visibleOnProfile={jobRoleVisibleOnProfile}
                onVisibleOnProfileChange={setJobRoleVisibleOnProfile}
                returnKeyType="done"
            />
        </OnboardingStep>
    );
}
