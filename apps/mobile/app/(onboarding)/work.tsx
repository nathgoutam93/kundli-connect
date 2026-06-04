import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAppState } from '@/store/use-app-state';

const PREFER_NOT_TO_SAY = 'Prefer not to say';

export default function WorkScreen() {
    const { profile, updateProfile } = useAppState();
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

    function handleContinue() {
        updateProfile({
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
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={27} color="#111111" />
            </Pressable>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.field}>
                    <Text style={styles.title}>Where do you work?</Text>
                    <TextInput
                        value={workplacePreferNotToSay ? PREFER_NOT_TO_SAY : workplace}
                        onChangeText={setWorkplace}
                        placeholder="in your words"
                        placeholderTextColor="#777777"
                        style={[styles.input, workplacePreferNotToSay && styles.inputDisabled]}
                        returnKeyType="next"
                        editable={!workplacePreferNotToSay}
                    />
                    <View style={styles.controlsRow}>
                        <PreferNotToSayButton
                            selected={workplacePreferNotToSay}
                            onPress={toggleWorkplacePreferNotToSay}
                        />
                        <VisibilityToggle
                            value={workplaceVisibleOnProfile}
                            onValueChange={setWorkplaceVisibleOnProfile}
                            disabled={workplacePreferNotToSay}
                        />
                    </View>
                </View>

                <View style={styles.field}>
                    <Text style={styles.title}>What is Your Role?</Text>
                    <TextInput
                        value={jobRolePreferNotToSay ? PREFER_NOT_TO_SAY : jobRole}
                        onChangeText={setJobRole}
                        placeholder="in your words"
                        placeholderTextColor="#777777"
                        style={[styles.input, jobRolePreferNotToSay && styles.inputDisabled]}
                        returnKeyType="done"
                        editable={!jobRolePreferNotToSay}
                    />
                    <View style={styles.controlsRow}>
                        <PreferNotToSayButton
                            selected={jobRolePreferNotToSay}
                            onPress={toggleJobRolePreferNotToSay}
                        />
                        <VisibilityToggle
                            value={jobRoleVisibleOnProfile}
                            onValueChange={setJobRoleVisibleOnProfile}
                            disabled={jobRolePreferNotToSay}
                        />
                    </View>
                </View>
            </ScrollView>

            <Pressable style={styles.nextButton} onPress={handleContinue}>
                <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
            </Pressable>
        </KeyboardAvoidingView>
    );
}

type VisibilityToggleProps = {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
};

function VisibilityToggle({ value, onValueChange, disabled = false }: VisibilityToggleProps) {
    return (
        <View style={[styles.visibilityRow, disabled && styles.disabledControl]}>
            <Text style={styles.visibilityLabel}>Visible on profile</Text>
            <Switch
                value={value}
                onValueChange={onValueChange}
                disabled={disabled}
                trackColor={{ false: '#E1D7C6', true: '#FBD06D' }}
                thumbColor={value ? '#FCAD00' : '#F8F1E4'}
                ios_backgroundColor="#E1D7C6"
            />
        </View>
    );
}

type PreferNotToSayButtonProps = {
    selected: boolean;
    onPress: () => void;
};

function PreferNotToSayButton({ selected, onPress }: PreferNotToSayButtonProps) {
    return (
        <Pressable
            style={[styles.option, selected && styles.optionSelected]}
            onPress={onPress}>
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {PREFER_NOT_TO_SAY}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFCF7',
    },
    backButton: {
        position: 'absolute',
        zIndex: 2,
        top: 75,
        left: 28,
        width: 47,
        height: 47,
        borderRadius: 24,
        backgroundColor: '#FFFCF7',
        borderWidth: 1,
        borderColor: '#FBD06D',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#FCAD00',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.2,
        shadowRadius: 9,
        elevation: 4,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 34,
        paddingTop: 170,
        paddingBottom: 128,
        gap: 34,
    },
    field: {
        gap: 12,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    title: {
        fontSize: 36,
        lineHeight: 42,
        fontWeight: '500',
        color: '#050505',
    },
    input: {
        borderBottomWidth: 1.2,
        borderBottomColor: '#55524E',
        paddingBottom: 8,
        fontSize: 25,
        lineHeight: 31,
        color: '#050505',
    },
    inputDisabled: {
        color: '#8C8478',
    },
    visibilityRow: {
        flexShrink: 1,
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
    },
    visibilityLabel: {
        fontSize: 12,
        lineHeight: 21,
        color: '#55524E',
    },
    disabledControl: {
        opacity: 0.48,
    },
    option: {
        flexShrink: 0,
        minHeight: 42,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FFC400',
        backgroundColor: '#FFF8E8',
        justifyContent: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    optionSelected: {
        borderColor: '#FCAD00',
        backgroundColor: '#FFD829',
    },
    optionText: {
        fontSize: 12,
        lineHeight: 21,
        fontWeight: '400',
        color: '#050505',
    },
    optionTextSelected: {
        fontWeight: '700',
    },
    nextButton: {
        position: 'absolute',
        right: 19,
        bottom: 40,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FCAD00',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
