import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppState } from '@/store/use-app-state';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BasicsScreen() {
    const { profile, updateProfile } = useAppState();
    const [name, setName] = useState(profile.name === 'New User' ? '' : profile.name);
    const [email, setEmail] = useState(profile.email);

    function handleContinue() {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();
        const isEmailValid = EMAIL_PATTERN.test(trimmedEmail);

        if (!trimmedName || !isEmailValid) {
            return;
        }

        updateProfile({
            name: trimmedName,
            email: trimmedEmail,
        });

        router.push('/(onboarding)/kundli-details');
    }

    const isFormValid = Boolean(name.trim()) && EMAIL_PATTERN.test(email.trim());

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}>
                    <View style={styles.section}>
                        <Text style={styles.heading}>What&apos;s your name?</Text>
                        <Text style={styles.helper}>It&apos;ll be displayed on your profile</Text>
                        <TextInput
                            value={name}
                            onChangeText={setName}
                            placeholder="Enter your name"
                            placeholderTextColor="#9C9CA4"
                            style={styles.lineInput}
                            returnKeyType="next"
                            autoCapitalize="words"
                        />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.heading}>What&apos;s Your Email?</Text>
                        <Text style={styles.helper}>Email helps us keep your account secure</Text>
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder="Enter your email"
                            placeholderTextColor="#9C9CA4"
                            style={styles.lineInput}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="done"
                        />
                    </View>
                </ScrollView>

                <Pressable
                    style={[styles.nextButton, !isFormValid && styles.nextButtonDisabled]}
                    onPress={handleContinue}
                    disabled={!isFormValid}>
                    <Ionicons name="chevron-forward" size={30} color="#FFFFFF" />
                </Pressable>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2',
    },
    keyboardContainer: {
        flex: 1,
        paddingHorizontal: 26,
        paddingTop: 16,
        paddingBottom: 34,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        marginTop: 80,
        paddingBottom: 32,
        gap: 36,
    },
    section: {
        gap: 6,
    },
    heading: {
        fontSize: 28,
        lineHeight: 32,
        fontWeight: '500',
        color: '#000000',
        letterSpacing: -0.2,
    },
    helper: {
        fontSize: 12,
        lineHeight: 14,
        color: '#8C8C93',
        paddingLeft: 4
    },
    lineInput: {
        fontSize: 24,
        lineHeight: 32,
        color: '#111111',
        borderBottomWidth: 0.5,
        borderBottomColor: '#373737',
        paddingBottom: 8,
    },
    nextButton: {
        alignSelf: 'flex-end',
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: '#F4B400',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextButtonDisabled: {
        opacity: 0.45,
    },
});
