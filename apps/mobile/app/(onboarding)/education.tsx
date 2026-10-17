import { router } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding-step';
import { PREFER_NOT_TO_SAY, ProfileTextField } from '@/components/profile-text-field';
import { useAppData } from '@/hooks/use-app-data';

export default function EducationScreen() {
    const { profile, updateProfile } = useAppData();
    const [school, setSchool] = useState(profile.school || '');
    const [educationLevel, setEducationLevel] = useState(profile.educationLevel || '');
    const [schoolVisibleOnProfile, setSchoolVisibleOnProfile] = useState(
        profile.schoolVisibleOnProfile ?? true
    );
    const [educationLevelVisibleOnProfile, setEducationLevelVisibleOnProfile] = useState(
        profile.educationLevelVisibleOnProfile ?? true
    );
    const [schoolPreferNotToSay, setSchoolPreferNotToSay] = useState(school === PREFER_NOT_TO_SAY);
    const [educationLevelPreferNotToSay, setEducationLevelPreferNotToSay] = useState(
        educationLevel === PREFER_NOT_TO_SAY
    );

    async function handleContinue() {
        await updateProfile({
            school: schoolPreferNotToSay ? PREFER_NOT_TO_SAY : school.trim(),
            schoolVisibleOnProfile: schoolPreferNotToSay ? false : schoolVisibleOnProfile,
            educationLevel: educationLevelPreferNotToSay ? PREFER_NOT_TO_SAY : educationLevel.trim(),
            educationLevelVisibleOnProfile: educationLevelPreferNotToSay
                ? false
                : educationLevelVisibleOnProfile,
        });
        router.push('/(onboarding)/religion');
    }

    function toggleSchoolPreferNotToSay() {
        setSchoolPreferNotToSay((current) => {
            const next = !current;

            if (next) {
                setSchoolVisibleOnProfile(false);
            }

            return next;
        });
    }

    function toggleEducationLevelPreferNotToSay() {
        setEducationLevelPreferNotToSay((current) => {
            const next = !current;

            if (next) {
                setEducationLevelVisibleOnProfile(false);
            }

            return next;
        });
    }

    return (
        <OnboardingStep
            step="education"
            title="Your education"
            subtitle="Share as much or as little as you like. You decide what shows on your profile."
            onContinue={handleContinue}>
            <ProfileTextField
                question="Where did you study?"
                value={school}
                onChangeText={setSchool}
                preferNotToSay={schoolPreferNotToSay}
                onTogglePreferNotToSay={toggleSchoolPreferNotToSay}
                visibleOnProfile={schoolVisibleOnProfile}
                onVisibleOnProfileChange={setSchoolVisibleOnProfile}
            />
            <ProfileTextField
                question="Highest level of education"
                value={educationLevel}
                onChangeText={setEducationLevel}
                preferNotToSay={educationLevelPreferNotToSay}
                onTogglePreferNotToSay={toggleEducationLevelPreferNotToSay}
                visibleOnProfile={educationLevelVisibleOnProfile}
                onVisibleOnProfileChange={setEducationLevelVisibleOnProfile}
                returnKeyType="done"
            />
        </OnboardingStep>
    );
}
