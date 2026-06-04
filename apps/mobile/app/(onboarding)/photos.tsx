import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/hooks/use-app-data';

const PHOTO_SLOTS = Array.from({ length: 6 }, (_, index) => index);
const MIN_PHOTOS = 4;
const MAX_PHOTOS = PHOTO_SLOTS.length;

export default function PhotosScreen() {
  const { addProfilePhotos, isServiceBusy, profile, removeProfilePhoto } = useAppData();
  const { width } = useWindowDimensions();
  const [selectedPhotoUris, setSelectedPhotoUris] = useState(() => (profile.photoUris ?? []).slice(0, MAX_PHOTOS));
  const [uploadingPhotoUris, setUploadingPhotoUris] = useState<Set<string>>(() => new Set());
  const isUploadingPhotos = uploadingPhotoUris.size > 0;
  const canContinue = selectedPhotoUris.length >= MIN_PHOTOS && !isUploadingPhotos;
  const slotSize = (width - 44 - 18) / 2;

  useEffect(() => {
    if (!isUploadingPhotos) {
      setSelectedPhotoUris((profile.photoUris ?? []).slice(0, MAX_PHOTOS));
    }
  }, [isUploadingPhotos, profile.photoUris]);

  async function handlePickPhotos() {
    const remainingSlots = MAX_PHOTOS - selectedPhotoUris.length;

    if (remainingSlots <= 0) {
      Alert.alert('Photo limit reached', `You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow gallery access to add photos to your profile.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.85,
      selectionLimit: remainingSlots,
    });

    if (result.canceled) {
      return;
    }

    const pickedUris = result.assets.map((asset) => asset.uri).filter(Boolean);
    const optimisticUris = pickedUris.slice(0, remainingSlots);
    if (optimisticUris.length === 0) {
      return;
    }

    setSelectedPhotoUris((current) => [...current, ...optimisticUris].slice(0, MAX_PHOTOS));
    setUploadingPhotoUris(new Set(optimisticUris));

    try {
      const uploadedUris = await addProfilePhotos(optimisticUris);
      if (uploadedUris.length !== optimisticUris.length) {
        throw new Error('Some selected photos did not finish uploading.');
      }

      const uploadedByLocalUri = new Map(optimisticUris.map((uri, index) => [uri, uploadedUris[index]]));
      setSelectedPhotoUris((current) =>
        current.map((uri) => uploadedByLocalUri.get(uri) ?? uri).slice(0, MAX_PHOTOS)
      );
    } catch (error) {
      setSelectedPhotoUris((current) => current.filter((uri) => !optimisticUris.includes(uri)));
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload the selected photos.');
    } finally {
      setUploadingPhotoUris(new Set());
    }
  }

  async function handleRemovePhoto(uriToRemove: string) {
    await removeProfilePhoto(uriToRemove);
    setSelectedPhotoUris((current) => current.filter((uri) => uri !== uriToRemove));
  }

  async function handleContinue() {
    if (!canContinue) {
      Alert.alert('Add more photos', `Please add at least ${MIN_PHOTOS} photos to continue.`);
      return;
    }

    router.push('/(onboarding)/bio');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#101010" />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Pick your profile{'\n'}photos</Text>
        </View>

        <View style={styles.grid}>
          {PHOTO_SLOTS.map((slot) => {
            const photoUri = selectedPhotoUris[slot];

            return (
              <Pressable
                key={slot}
                style={[styles.photoSlot, { width: slotSize, height: slotSize }]}
                onPress={isServiceBusy || isUploadingPhotos ? undefined : handlePickPhotos}>
                {photoUri ? (
                  <>
                    <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
                    <Pressable
                      accessibilityLabel="Remove photo"
                      hitSlop={10}
                      style={styles.removeBadge}
                      onPress={() => handleRemovePhoto(photoUri)}
                      disabled={isServiceBusy || uploadingPhotoUris.has(photoUri)}
                    >
                      <Ionicons name="close" size={12} color="#FFFFFF" />
                    </Pressable>
                    {uploadingPhotoUris.has(photoUri) ? (
                      <View style={styles.uploadOverlay}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.uploadText}>Uploading</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.addText}>+</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.photoCountWrap}>
          <Text style={[styles.photoCount, canContinue && styles.photoCountReady]}>
            {selectedPhotoUris.length}/{MAX_PHOTOS} selected
          </Text>
          <Text style={styles.requiredText}>
            {isUploadingPhotos
              ? 'Uploading photos...'
              : canContinue
                ? 'Ready to continue'
                : `${MIN_PHOTOS - selectedPhotoUris.length} more required to continue`}
          </Text>
        </View>
      </ScrollView>

      <Pressable
        style={[styles.nextButton, !canContinue && styles.nextButtonDisabled]}
        onPress={handleContinue}
        disabled={!canContinue || isServiceBusy || isUploadingPhotos}
      >
        <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 126,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F6B216',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 11,
    elevation: 5,
  },
  header: {
    marginTop: 24,
  },
  title: {
    fontSize: 32,
    lineHeight: 39,
    fontWeight: '600',
    color: '#090A0E',
    letterSpacing: 0,
  },
  grid: {
    marginTop: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
  },
  photoSlot: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FFD22C',
    borderRadius: 15,
    backgroundColor: '#FFFBEF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  addText: {
    fontSize: 40,
    lineHeight: 40,
    fontWeight: '300',
    color: '#B6B2AA',
    textAlign: 'center',
    transform: [{ translateY: -2 }],
  },
  removeBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(9, 10, 14, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 10, 14, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  uploadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  photoCountWrap: {
    marginTop: 17,
    gap: 4,
  },
  photoCount: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: '#D89400',
    letterSpacing: 0,
  },
  photoCountReady: {
    color: '#268B45',
  },
  requiredText: {
    fontSize: 14,
    lineHeight: 17,
    color: '#85858D',
    letterSpacing: 0,
  },
  nextButton: {
    position: 'absolute',
    right: 18,
    bottom: 39,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F7B000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: '#D8D2C8',
  },
});
