import { Ionicons } from '@expo/vector-icons';
import { ProfileImage } from '@/components/profile-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { toast } from '@/components/ui/toast';
import { colors, gutter, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

const PHOTO_SLOTS = Array.from({ length: 6 }, (_, index) => index);
const MIN_PHOTOS = 4;
const MAX_PHOTOS = PHOTO_SLOTS.length;
const GRID_GAP = space.xs;

export default function PhotosScreen() {
  const { addProfilePhotos, isServiceBusy, profile, removeProfilePhoto } = useAppData();
  const { width } = useWindowDimensions();
  const [selectedPhotoUris, setSelectedPhotoUris] = useState(() => (profile.photoUris ?? []).slice(0, MAX_PHOTOS));
  const [uploadingPhotoUris, setUploadingPhotoUris] = useState<Set<string>>(() => new Set());
  const [failedUris, setFailedUris] = useState<string[]>([]);
  const isUploadingPhotos = uploadingPhotoUris.size > 0;
  const canContinue = selectedPhotoUris.length >= MIN_PHOTOS && !isUploadingPhotos;
  const slotWidth = (width - gutter * 2 - GRID_GAP * 2) / 3;

  useEffect(() => {
    if (!isUploadingPhotos) {
      setSelectedPhotoUris((profile.photoUris ?? []).slice(0, MAX_PHOTOS));
    }
  }, [isUploadingPhotos, profile.photoUris]);

  async function handlePickPhotos() {
    const remainingSlots = MAX_PHOTOS - selectedPhotoUris.length;

    if (remainingSlots <= 0) {
      toast.warning(`You can add up to ${MAX_PHOTOS} photos.`, 'Photo limit reached');
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

    await uploadSelection(optimisticUris);
  }

  async function uploadSelection(uris: string[]) {
    setSelectedPhotoUris((current) => [...new Set([...current, ...uris])].slice(0, MAX_PHOTOS));
    setUploadingPhotoUris(new Set(uris));
    try {
      const results = await addProfilePhotos(uris);
      const saved = new Map(results.filter((item) => item.photoUri).map((item) => [item.localUri, item.photoUri!]));
      const failed = results.filter((item) => !item.photoUri);
      setSelectedPhotoUris((current) => [...new Set(current.flatMap((uri) =>
        saved.has(uri) ? [saved.get(uri)!] : uris.includes(uri) ? [] : [uri]
      ))].slice(0, MAX_PHOTOS));
      setFailedUris(failed.map((item) => item.localUri));
      if (failed.length) Alert.alert('Some photos need retrying', `${saved.size} saved. ${failed.length} failed. ${failed[0].error ?? 'Please try again.'}`);
    } catch (error) {
      setFailedUris(uris);
      setSelectedPhotoUris((current) => current.filter((uri) => !uris.includes(uri)));
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload photos.');
    } finally {
      setUploadingPhotoUris(new Set());
    }
  }

  async function handleRemovePhoto(uriToRemove: string) {
    try {
      await removeProfilePhoto(uriToRemove);
      setSelectedPhotoUris((current) => current.filter((uri) => uri !== uriToRemove));
    } catch (error) {
      Alert.alert('Could not remove photo', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function handleContinue() {
    if (!canContinue) {
      toast.warning(`Please add at least ${MIN_PHOTOS} photos to continue.`, 'Add more photos');
      return;
    }

    router.push('/(onboarding)/bio');
  }

  const remaining = MIN_PHOTOS - selectedPhotoUris.length;

  return (
    <OnboardingStep
      step="photos"
      title="Show your best self"
      subtitle={`Add at least ${MIN_PHOTOS} photos. Your first photo is the one people see first.`}
      onContinue={handleContinue}
      canContinue={canContinue && !isServiceBusy}>
      {failedUris.length ? <Button label={`Retry ${failedUris.length} failed photos`} disabled={isUploadingPhotos}
        onPress={() => { void uploadSelection(failedUris); }} /> : null}
      <View style={styles.grid}>
        {PHOTO_SLOTS.map((slot) => {
          const photoUri = selectedPhotoUris[slot];
          const isUploading = photoUri ? uploadingPhotoUris.has(photoUri) : false;

          return (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityLabel={photoUri ? `Photo ${slot + 1}` : 'Add photo'}
              style={[
                styles.photoSlot,
                { width: slotWidth, height: slotWidth * 1.3 },
                !photoUri && styles.photoSlotEmpty,
              ]}
              onPress={isServiceBusy || isUploadingPhotos ? undefined : handlePickPhotos}>
              {photoUri ? (
                <>
                  <ProfileImage uri={photoUri} style={styles.photoPreview} contentFit="cover" transition={200} />
                  {slot === 0 ? (
                    <View style={styles.mainBadge}>
                      <AppText variant="caption" color={colors.onAccent}>
                        Main
                      </AppText>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityLabel="Remove photo"
                    hitSlop={10}
                    style={styles.removeBadge}
                    onPress={() => handleRemovePhoto(photoUri)}
                    disabled={isServiceBusy || isUploading}>
                    <Ionicons name="close" size={14} color={colors.text} />
                  </Pressable>
                  {isUploading ? (
                    <View style={styles.uploadOverlay}>
                      <ActivityIndicator size="small" color={colors.accent} />
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.addIcon}>
                  <Ionicons name="add" size={20} color={colors.accent} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <AppText variant="subhead" color={canContinue ? colors.success : colors.textMuted} align="center">
        {isUploadingPhotos
          ? 'Uploading photos…'
          : canContinue
            ? `${selectedPhotoUris.length} of ${MAX_PHOTOS} added — looking good`
            : `${remaining} more ${remaining === 1 ? 'photo' : 'photos'} to go`}
      </AppText>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  photoSlot: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSlotEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  photoPreview: {
    ...StyleSheet.absoluteFillObject,
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  mainBadge: {
    position: 'absolute',
    left: space.xs,
    bottom: space.xs,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  removeBadge: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
});
