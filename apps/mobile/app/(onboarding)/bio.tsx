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

import { useAppState } from '@/store/use-app-state';

const BIO_MAX_LENGTH = 180;

export default function BioScreen() {
  const { profile, updateProfile } = useAppState();
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
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={27} color="#111111" />
        </Pressable>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>What describes you best?</Text>

          <View style={styles.inputWrap}>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Write a short bio"
              placeholderTextColor="#9C9CA4"
              style={styles.bioInput}
              multiline
              maxLength={BIO_MAX_LENGTH}
              textAlignVertical="top"
              returnKeyType="done"
            />
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.helperText}>Required</Text>
            <Text style={[styles.counterText, bio.length === BIO_MAX_LENGTH && styles.counterFull]}>
              {bio.length}/{BIO_MAX_LENGTH}
            </Text>
          </View>
        </ScrollView>

        <Pressable
          style={[styles.nextButton, !canContinue && styles.nextButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}>
          <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFCF7',
  },
  keyboardContainer: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    zIndex: 2,
    top: 80,
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
    paddingHorizontal: 28,
    paddingTop: 145,
    paddingBottom: 128,
  },
  title: {
    maxWidth: 380,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '500',
    color: '#050505',
  },
  inputWrap: {
    marginTop: 31,
    minHeight: 176,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFC400',
    backgroundColor: '#FFF8E8',
    paddingHorizontal: 17,
    paddingVertical: 15,
  },
  bioInput: {
    minHeight: 140,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '400',
    color: '#050505',
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  helperText: {
    fontSize: 15,
    lineHeight: 19,
    color: '#8C8C93',
  },
  counterText: {
    fontSize: 15,
    lineHeight: 19,
    color: '#8C8C93',
  },
  counterFull: {
    color: '#D89400',
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
  nextButtonDisabled: {
    opacity: 0.45,
  },
});
