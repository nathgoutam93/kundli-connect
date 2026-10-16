import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    ActivityIndicator,
    KeyboardAvoidingView,
    PanResponder,
    type PanResponderGestureState,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    type StyleProp,
    type ViewStyle,
    View,
} from 'react-native';

import { SwitchRow } from '@/components/ui/app-switch';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ChoiceChip } from '@/components/ui/choice';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { TextField as UiTextField } from '@/components/ui/text-field';
import { toast } from '@/components/ui/toast';
import { colors, gutter, radius, space } from '@/constants/theme';
import { type UserProfile } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 4;
const PHOTO_GRID_COLUMNS = 3;
const PHOTO_GRID_GAP = space.xs;
/** Portrait tiles, the same shape as onboarding and the profile photos people see. */
const PHOTO_ASPECT = 1.3;
const GENDER_OPTIONS = ['Male', 'Female', 'Non - Binary'];
const PREFERENCE_OPTIONS = ['Male', 'Female', 'Non - Binary People', 'Everyone'];
const FAMILY_PLAN_OPTIONS = ['Dont want Children', 'Want Children', 'Open to Children', 'Not Sure'];
const RELIGION_OPTIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Spiritual', 'Prefer not to say'];
const HABIT_OPTIONS = ['Never', 'Sometimes', 'Often', 'Prefer not to say'];

type FormState = {
    name: string;
    email: string;
    gender: string;
    genderPreferences: string[];
    height: string;
    familyPlans: string;
    familyPlansVisibleOnProfile: boolean;
    workplace: string;
    workplaceVisibleOnProfile: boolean;
    jobRole: string;
    jobRoleVisibleOnProfile: boolean;
    school: string;
    schoolVisibleOnProfile: boolean;
    educationLevel: string;
    educationLevelVisibleOnProfile: boolean;
    religiousBeliefs: string;
    drinking: string;
    drinkingVisibleOnProfile: boolean;
    smoking: string;
    smokingVisibleOnProfile: boolean;
    location: string;
    bio: string;
    photoUris: string[];
};

function profileToForm(profile: UserProfile): FormState {
    return {
        name: profile.name === 'New User' ? '' : profile.name,
        email: profile.email,
        gender: profile.gender,
        genderPreferences: profile.genderPreferences ?? [],
        height: profile.height,
        familyPlans: profile.familyPlans,
        familyPlansVisibleOnProfile: profile.familyPlansVisibleOnProfile ?? true,
        workplace: profile.workplace,
        workplaceVisibleOnProfile: profile.workplaceVisibleOnProfile ?? true,
        jobRole: profile.jobRole,
        jobRoleVisibleOnProfile: profile.jobRoleVisibleOnProfile ?? true,
        school: profile.school,
        schoolVisibleOnProfile: profile.schoolVisibleOnProfile ?? true,
        educationLevel: profile.educationLevel,
        educationLevelVisibleOnProfile: profile.educationLevelVisibleOnProfile ?? true,
        religiousBeliefs: profile.religiousBeliefs,
        drinking: profile.drinking,
        drinkingVisibleOnProfile: profile.drinkingVisibleOnProfile ?? true,
        smoking: profile.smoking,
        smokingVisibleOnProfile: profile.smokingVisibleOnProfile ?? true,
        location: profile.location,
        bio: profile.bio,
        photoUris: (profile.photoUris ?? []).slice(0, MAX_PHOTOS),
    };
}

export default function EditProfileScreen() {
    const {
        addProfilePhotos,
        isServiceBusy,
        profile,
        removeProfilePhoto,
        updateProfile,
    } = useAppData();
    const [form, setForm] = useState<FormState>(() => profileToForm(profile));
    const [savedForm] = useState<FormState>(() => profileToForm(profile));
    const [isLoadingProfile] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [photoGridWidth, setPhotoGridWidth] = useState(0);
    const [draggingPhotoUri, setDraggingPhotoUri] = useState<string | null>(null);
    const [photoDropTargetIndex, setPhotoDropTargetIndex] = useState<number | null>(null);
    const [isPhotoDragging, setIsPhotoDragging] = useState(false);
    const [uploadingPhotoUris, setUploadingPhotoUris] = useState<Set<string>>(() => new Set());
    const photoUrisRef = useRef(form.photoUris);
    const draggingPhotoUriRef = useRef<string | null>(null);
    const dragStartIndexRef = useRef<number | null>(null);
    const photoDropTargetIndexRef = useRef<number | null>(null);
    const hasUnsavedChanges = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);

    useEffect(() => {
        photoUrisRef.current = form.photoUris;
    }, [form.photoUris]);

    function updateForm<T extends keyof FormState>(key: T, value: FormState[T]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function setPhotoUploading(uri: string, isUploading: boolean) {
        setUploadingPhotoUris((current) => {
            const next = new Set(current);
            if (isUploading) {
                next.add(uri);
            } else {
                next.delete(uri);
            }
            return next;
        });
    }

    function replacePhotoUri(currentUri: string, nextUri?: string) {
        setForm((current) => ({
            ...current,
            photoUris: current.photoUris.flatMap((uri) => {
                if (uri !== currentUri) {
                    return [uri];
                }
                return nextUri ? [nextUri] : [];
            }),
        }));
    }

    async function requestPhotoPermission() {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission needed', 'Allow gallery access to add photos to your profile.');
            return false;
        }

        return true;
    }

    async function pickPhoto() {
        const hasPermission = await requestPhotoPermission();
        if (!hasPermission) {
            return undefined;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            allowsMultipleSelection: false,
            mediaTypes: ['images'],
            quality: 0.85,
        });

        if (result.canceled) {
            return undefined;
        }

        return result.assets[0]?.uri;
    }

    async function addPhoto() {
        if (form.photoUris.length >= MAX_PHOTOS) {
            toast.warning(`You can add up to ${MAX_PHOTOS} photos.`, 'Photo limit reached');
            return;
        }

        const pickedUri = await pickPhoto();
        if (!pickedUri) {
            return;
        }

        setForm((current) => ({ ...current, photoUris: [...current.photoUris, pickedUri].slice(0, MAX_PHOTOS) }));
        setPhotoUploading(pickedUri, true);

        try {
            const uploadedUris = await addProfilePhotos([pickedUri]);
            const uploadedUri = uploadedUris[0];
            if (!uploadedUri) {
                throw new Error('Photo upload did not return an image URL.');
            }
            replacePhotoUri(pickedUri, uploadedUri);
        } catch (error) {
            replacePhotoUri(pickedUri);
            Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload the selected photo.');
        } finally {
            setPhotoUploading(pickedUri, false);
        }
    }

    async function replacePhoto(index: number) {
        const oldUri = form.photoUris[index];
        const pickedUri = await pickPhoto();
        if (!pickedUri) {
            return;
        }

        setForm((current) => {
            const nextUris = [...current.photoUris];
            nextUris[index] = pickedUri;
            return { ...current, photoUris: nextUris };
        });
        setPhotoUploading(pickedUri, true);

        try {
            const uploadedUris = await addProfilePhotos([pickedUri]);
            const uploadedUri = uploadedUris[0];
            if (!uploadedUri) {
                throw new Error('Photo upload did not return an image URL.');
            }

            replacePhotoUri(pickedUri, uploadedUri);
            setPhotoUploading(pickedUri, false);

            if (oldUri) {
                try {
                    await removeProfilePhoto(oldUri);
                } catch (error) {
                    Alert.alert('Photo cleanup failed', error instanceof Error ? error.message : 'The previous photo could not be removed.');
                }
            }
        } catch (error) {
            replacePhotoUri(pickedUri, oldUri);
            Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload the selected photo.');
        } finally {
            setPhotoUploading(pickedUri, false);
        }
    }

    function movePhoto(photoUri: string, toIndex: number) {
        setForm((current) => {
            const fromIndex = current.photoUris.indexOf(photoUri);
            if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.photoUris.length || toIndex >= current.photoUris.length) {
                return current;
            }

            if (fromIndex === toIndex) {
                return current;
            }

            const nextUris = [...current.photoUris];
            const [movedUri] = nextUris.splice(fromIndex, 1);
            nextUris.splice(toIndex, 0, movedUri);
            return { ...current, photoUris: nextUris };
        });
    }

    function beginPhotoDrag(index: number) {
        const photoUri = form.photoUris[index];
        if (!photoUri || isServiceBusy) {
            return;
        }

        dragStartIndexRef.current = index;
        photoDropTargetIndexRef.current = index;
        draggingPhotoUriRef.current = photoUri;
        setDraggingPhotoUri(photoUri);
        setPhotoDropTargetIndex(index);
        setIsPhotoDragging(true);
    }

    function updatePhotoDrag(gesture: PanResponderGestureState) {
        const startIndex = dragStartIndexRef.current;
        const photoUri = draggingPhotoUriRef.current;
        if (startIndex === null || !photoUri || photoGridWidth <= 0) {
            return;
        }

        const slotSize = (photoGridWidth - PHOTO_GRID_GAP * (PHOTO_GRID_COLUMNS - 1)) / PHOTO_GRID_COLUMNS;
        const stepSize = slotSize + PHOTO_GRID_GAP;
        const rowStepSize = slotSize * PHOTO_ASPECT + PHOTO_GRID_GAP;
        const photoUris = photoUrisRef.current;
        const startColumn = startIndex % PHOTO_GRID_COLUMNS;
        const startRow = Math.floor(startIndex / PHOTO_GRID_COLUMNS);
        const columnOffset = Math.round(gesture.dx / stepSize);
        const rowOffset = Math.round(gesture.dy / rowStepSize);
        const nextColumn = Math.min(Math.max(startColumn + columnOffset, 0), PHOTO_GRID_COLUMNS - 1);
        const nextRow = Math.min(Math.max(startRow + rowOffset, 0), Math.ceil(photoUris.length / PHOTO_GRID_COLUMNS) - 1);
        const targetIndex = Math.min(nextRow * PHOTO_GRID_COLUMNS + nextColumn, photoUris.length - 1);

        if (photoDropTargetIndexRef.current !== targetIndex) {
            photoDropTargetIndexRef.current = targetIndex;
            setPhotoDropTargetIndex(targetIndex);
        }
    }

    function endPhotoDrag() {
        const photoUri = draggingPhotoUriRef.current;
        const targetIndex = photoDropTargetIndexRef.current;
        if (photoUri && targetIndex !== null) {
            movePhoto(photoUri, targetIndex);
        }

        draggingPhotoUriRef.current = null;
        dragStartIndexRef.current = null;
        photoDropTargetIndexRef.current = null;
        setDraggingPhotoUri(null);
        setPhotoDropTargetIndex(null);
        setIsPhotoDragging(false);
    }

    async function removePhoto(uri: string) {
        await removeProfilePhoto(uri);
        updateForm(
            'photoUris',
            form.photoUris.filter((photoUri) => photoUri !== uri)
        );
    }

    function togglePreference(option: string) {
        if (option === 'Everyone') {
            updateForm('genderPreferences', ['Everyone']);
            return;
        }

        const nextPreferences = form.genderPreferences.includes(option)
            ? form.genderPreferences.filter((preference) => preference !== option)
            : [...form.genderPreferences.filter((preference) => preference !== 'Everyone'), option];

        updateForm('genderPreferences', nextPreferences);
    }

    async function saveProfile() {
        if (!hasUnsavedChanges || isLoadingProfile || isSavingProfile || isServiceBusy) {
            return;
        }

        if (form.photoUris.length < MIN_PHOTOS) {
            toast.warning(`Please keep at least ${MIN_PHOTOS} profile photos.`, 'Add more photos');
            return;
        }

        setIsSavingProfile(true);
        try {
            await updateProfile({
                name: form.name.trim() || profile.name,
                email: form.email.trim(),
                gender: form.gender,
                genderPreferences: form.genderPreferences,
                height: form.height.trim(),
                familyPlans: form.familyPlans,
                familyPlansVisibleOnProfile: form.familyPlansVisibleOnProfile,
                workplace: form.workplace.trim(),
                workplaceVisibleOnProfile: form.workplaceVisibleOnProfile,
                jobRole: form.jobRole.trim(),
                jobRoleVisibleOnProfile: form.jobRoleVisibleOnProfile,
                school: form.school.trim(),
                schoolVisibleOnProfile: form.schoolVisibleOnProfile,
                educationLevel: form.educationLevel.trim(),
                educationLevelVisibleOnProfile: form.educationLevelVisibleOnProfile,
                religiousBeliefs: form.religiousBeliefs,
                drinking: form.drinking,
                drinkingVisibleOnProfile: form.drinkingVisibleOnProfile,
                smoking: form.smoking,
                smokingVisibleOnProfile: form.smokingVisibleOnProfile,
                location: form.location.trim(),
                bio: form.bio.trim(),
                photoUris: form.photoUris,
            });

            router.back();
        } finally {
            setIsSavingProfile(false);
        }
    }

    return (
        <Screen>
            <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScreenHeader
                    title="Edit profile"
                    onBack={isServiceBusy ? () => undefined : undefined}
                    right={
                        isLoadingProfile ? (
                            <ActivityIndicator accessibilityLabel="Loading profile" size="small" color={colors.accent} />
                        ) : hasUnsavedChanges || isSavingProfile ? (
                            <Button
                                label="Save"
                                size="sm"
                                fullWidth={false}
                                loading={isSavingProfile}
                                disabled={isServiceBusy}
                                onPress={saveProfile}
                            />
                        ) : null
                    }
                />
                <ScrollView
                    scrollEnabled={!isPhotoDragging}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.content}>
                    <Section title="Photos">
                        <View
                            style={styles.photoGrid}
                            onLayout={(event) => setPhotoGridWidth(event.nativeEvent.layout.width)}>
                            {photoGridWidth > 0 &&
                                Array.from({ length: Math.ceil(MAX_PHOTOS / PHOTO_GRID_COLUMNS) }, (_, rowIndex) => (
                                    <View key={`photo-row-${rowIndex}`} style={[styles.photoGridRow, rowIndex === 0 && styles.photoGridRowSpaced]}>
                                        {Array.from({ length: PHOTO_GRID_COLUMNS }, (_, columnIndex) => {
                                            const index = rowIndex * PHOTO_GRID_COLUMNS + columnIndex;
                                            const photoUri = form.photoUris[index];
                                            const photoSlotSize = (photoGridWidth - PHOTO_GRID_GAP * (PHOTO_GRID_COLUMNS - 1)) / PHOTO_GRID_COLUMNS;

                                            return (
                                                <PhotoSlot
                                                    key={photoUri ?? `empty-photo-${index}`}
                                                    index={index}
                                                    isBusy={isServiceBusy}
                                                    isDropTarget={photoDropTargetIndex === index}
                                                    isDragging={Boolean(photoUri && draggingPhotoUri === photoUri)}
                                                    isUploading={Boolean(photoUri && uploadingPhotoUris.has(photoUri))}
                                                    photoUri={photoUri}
                                                    slotSize={photoSlotSize}
                                                    slotStyle={columnIndex < PHOTO_GRID_COLUMNS - 1 ? styles.photoSlotSpaced : undefined}
                                                    onAdd={addPhoto}
                                                    onBeginDrag={beginPhotoDrag}
                                                    onEndDrag={endPhotoDrag}
                                                    onMoveDrag={updatePhotoDrag}
                                                    onRemove={removePhoto}
                                                    onReplace={replacePhoto}
                                                />
                                            );
                                        })}
                                    </View>
                                ))}
                        </View>
                        <AppText variant="footnote" color={colors.textFaint}>
                            Tap a photo to replace it, or drag its handle to reorder. Your first photo is your main one.
                        </AppText>
                    </Section>

                    <Section title="Basics">
                        <TextField label="Name" value={form.name} onChangeText={(value) => updateForm('name', value)} />
                        <TextField label="Email" value={form.email} onChangeText={(value) => updateForm('email', value)} keyboardType="email-address" />
                        <TextField label="Location" value={form.location} onChangeText={(value) => updateForm('location', value)} />
                        <TextField label="Bio" value={form.bio} onChangeText={(value) => updateForm('bio', value)} multiline />
                    </Section>

                    <Section title="Birth details">
                        <LockedBirthDetails profile={profile} />
                    </Section>

                    <Section title="Identity">
                        <OptionGroup label="Gender" options={GENDER_OPTIONS} selectedValue={form.gender} onSelect={(value) => updateForm('gender', value)} />
                        <OptionGroup label="Looking for" options={PREFERENCE_OPTIONS} selectedValues={form.genderPreferences} onSelect={togglePreference} />
                        <TextField label="Height" value={form.height} onChangeText={(value) => updateForm('height', value)} />
                    </Section>

                    <Section title="Life">
                        <OptionGroup label="Family plans" options={FAMILY_PLAN_OPTIONS} selectedValue={form.familyPlans} onSelect={(value) => updateForm('familyPlans', value)} />
                        <VisibilitySwitch label="Show family plans" value={form.familyPlansVisibleOnProfile} onValueChange={(value) => updateForm('familyPlansVisibleOnProfile', value)} />
                        <TextField label="Workplace" value={form.workplace} onChangeText={(value) => updateForm('workplace', value)} />
                        <VisibilitySwitch label="Show workplace" value={form.workplaceVisibleOnProfile} onValueChange={(value) => updateForm('workplaceVisibleOnProfile', value)} />
                        <TextField label="Role" value={form.jobRole} onChangeText={(value) => updateForm('jobRole', value)} />
                        <VisibilitySwitch label="Show role" value={form.jobRoleVisibleOnProfile} onValueChange={(value) => updateForm('jobRoleVisibleOnProfile', value)} />
                        <TextField label="School" value={form.school} onChangeText={(value) => updateForm('school', value)} />
                        <VisibilitySwitch label="Show school" value={form.schoolVisibleOnProfile} onValueChange={(value) => updateForm('schoolVisibleOnProfile', value)} />
                        <TextField label="Education level" value={form.educationLevel} onChangeText={(value) => updateForm('educationLevel', value)} />
                        <VisibilitySwitch label="Show education" value={form.educationLevelVisibleOnProfile} onValueChange={(value) => updateForm('educationLevelVisibleOnProfile', value)} />
                    </Section>

                    <Section title="Beliefs and Habits">
                        <OptionGroup label="Religion" options={RELIGION_OPTIONS} selectedValue={form.religiousBeliefs} onSelect={(value) => updateForm('religiousBeliefs', value)} />
                        <OptionGroup label="Drinking" options={HABIT_OPTIONS} selectedValue={form.drinking} onSelect={(value) => updateForm('drinking', value)} />
                        <VisibilitySwitch label="Show drinking" value={form.drinkingVisibleOnProfile} onValueChange={(value) => updateForm('drinkingVisibleOnProfile', value)} />
                        <OptionGroup label="Smoking" options={HABIT_OPTIONS} selectedValue={form.smoking} onSelect={(value) => updateForm('smoking', value)} />
                        <VisibilitySwitch label="Show smoking" value={form.smokingVisibleOnProfile} onValueChange={(value) => updateForm('smokingVisibleOnProfile', value)} />
                    </Section>
                </ScrollView>
            </KeyboardAvoidingView>
        </Screen>
    );
}

function PhotoSlot({
    index,
    isBusy,
    isDropTarget,
    isDragging,
    isUploading,
    photoUri,
    slotSize,
    slotStyle,
    onAdd,
    onBeginDrag,
    onEndDrag,
    onMoveDrag,
    onRemove,
    onReplace,
}: {
    index: number;
    isBusy: boolean;
    isDropTarget: boolean;
    isDragging: boolean;
    isUploading: boolean;
    photoUri?: string;
    slotSize?: number;
    slotStyle?: StyleProp<ViewStyle>;
    onAdd: () => void;
    onBeginDrag: (index: number) => void;
    onEndDrag: () => void;
    onMoveDrag: (gesture: PanResponderGestureState) => void;
    onRemove: (uri: string) => void;
    onReplace: (index: number) => void;
}) {
    const dragOffset = useRef(new Animated.ValueXY()).current;
    const dragHandlersRef = useRef({ onBeginDrag, onEndDrag, onMoveDrag });
    dragHandlersRef.current = { onBeginDrag, onEndDrag, onMoveDrag };

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => Boolean(photoUri) && !isBusy,
                onMoveShouldSetPanResponder: () => Boolean(photoUri) && !isBusy,
                onPanResponderGrant: () => {
                    dragOffset.setValue({ x: 0, y: 0 });
                    dragHandlersRef.current.onBeginDrag(index);
                },
                onPanResponderMove: (_, gesture) => {
                    dragOffset.setValue({ x: gesture.dx, y: gesture.dy });
                    dragHandlersRef.current.onMoveDrag(gesture);
                },
                onPanResponderRelease: () => {
                    dragHandlersRef.current.onEndDrag();
                    dragOffset.setValue({ x: 0, y: 0 });
                },
                onPanResponderTerminate: () => {
                    dragHandlersRef.current.onEndDrag();
                    dragOffset.setValue({ x: 0, y: 0 });
                },
                onPanResponderTerminationRequest: () => false,
            }),
        [dragOffset, index, isBusy, photoUri]
    );

    if (!photoUri) {
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add photo"
                style={[styles.photoSlot, styles.photoSlotEmpty, slotSize ? { width: slotSize, height: slotSize * PHOTO_ASPECT } : null, slotStyle]}
                onPress={onAdd}
                disabled={isBusy}>
                <View style={styles.addIcon}>
                    <Ionicons name="add" size={20} color={colors.accent} />
                </View>
            </Pressable>
        );
    }

    return (
        <Animated.View
            style={[
                styles.photoSlot,
                slotSize ? { width: slotSize, height: slotSize * PHOTO_ASPECT } : null,
                slotStyle,
                isDropTarget && !isDragging && styles.photoSlotDropTarget,
                isDragging && styles.photoSlotDragging,
                {
                    transform: [
                        { translateX: dragOffset.x },
                        { translateY: dragOffset.y },
                        { scale: isDragging ? 0.96 : 1 },
                    ],
                },
            ]}>
            <Pressable
                accessibilityLabel={`Replace photo ${index + 1}`}
                disabled={isBusy || isDragging || isUploading}
                onPress={() => onReplace(index)}
                style={styles.photoPressable}>
                <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" transition={200} />
            </Pressable>
            {index === 0 ? (
                <View style={styles.mainBadge} pointerEvents="none">
                    <AppText variant="caption" color={colors.onAccent}>
                        Main
                    </AppText>
                </View>
            ) : null}
            <Pressable
                accessibilityLabel="Remove photo"
                hitSlop={10}
                style={styles.removeButton}
                onPress={() => onRemove(photoUri)}
                disabled={isBusy || isUploading}>
                <Ionicons name="close" size={14} color={colors.text} />
            </Pressable>
            {isUploading ? (
                <View style={styles.uploadOverlay}>
                    <ActivityIndicator size="small" color={colors.accent} />
                </View>
            ) : (
                <View
                    {...panResponder.panHandlers}
                    accessibilityLabel={`Reorder photo ${index + 1}`}
                    accessibilityRole="button"
                    style={styles.dragHandle}>
                    <Ionicons name="reorder-three" size={16} color={colors.text} />
                </View>
            )}
        </Animated.View>
    );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14-03-1998" → "14 Mar 1998"; anything unexpected is shown as stored. */
function formatBirthDate(value: string) {
    const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return match ? `${Number(match[1])} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[3]}` : value;
}

/** Birth details are fixed after onboarding (the Kundli and every match score depend on them). */
function LockedBirthDetails({ profile }: { profile: UserProfile }) {
    const rows = [
        { icon: 'calendar-outline' as const, label: 'Date', value: formatBirthDate(profile.dateOfBirth) },
        { icon: 'time-outline' as const, label: 'Time', value: profile.timeOfBirth.slice(0, 5) },
        { icon: 'location-outline' as const, label: 'Place', value: profile.birthPlace },
    ].filter((row) => row.value);

    return (
        <View style={styles.lockedCard} accessible accessibilityLabel={`Birth details, locked. ${rows.map((row) => `${row.label} ${row.value}`).join(', ')}`}>
            {rows.map((row) => (
                <View key={row.label} style={styles.lockedRow}>
                    <Ionicons name={row.icon} size={18} color={colors.accent} />
                    <AppText variant="subhead" color={colors.textMuted} style={styles.lockedLabel}>
                        {row.label}
                    </AppText>
                    <AppText variant="bodyStrong" style={styles.lockedValue} numberOfLines={2}>
                        {row.value}
                    </AppText>
                </View>
            ))}
            <View style={styles.lockedNote}>
                <Ionicons name="lock-closed" size={14} color={colors.textFaint} />
                <AppText variant="footnote" color={colors.textFaint} style={styles.lockedNoteText}>
                    Your Kundli and match scores are built from these, so they can’t be changed. Contact support if
                    something is wrong.
                </AppText>
            </View>
        </View>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <AppText variant="title3">{title}</AppText>
            {children}
        </View>
    );
}

function TextField({
    label,
    value,
    onChangeText,
    keyboardType,
    multiline,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    keyboardType?: 'default' | 'email-address';
    multiline?: boolean;
}) {
    return (
        <UiTextField
            label={label}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            multiline={multiline}
            autoCapitalize={keyboardType === 'email-address' ? 'none' : undefined}
        />
    );
}

function OptionGroup({
    label,
    options,
    selectedValue,
    selectedValues,
    onSelect,
}: {
    label: string;
    options: string[];
    selectedValue?: string;
    selectedValues?: string[];
    onSelect: (value: string) => void;
}) {
    return (
        <View style={styles.field}>
            <AppText variant="overline" color={colors.textMuted}>
                {label}
            </AppText>
            <View style={styles.optionWrap}>
                {options.map((option) => (
                    <ChoiceChip
                        key={option}
                        label={option}
                        selected={selectedValue === option || Boolean(selectedValues?.includes(option))}
                        onPress={() => onSelect(option)}
                    />
                ))}
            </View>
        </View>
    );
}

function VisibilitySwitch({
    label,
    value,
    onValueChange,
}: {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
}) {
    return <SwitchRow label={label} value={value} onValueChange={onValueChange} />;
}

const styles = StyleSheet.create({
    keyboard: {
        flex: 1,
    },
    content: {
        paddingHorizontal: gutter,
        paddingTop: space.md,
        paddingBottom: space.huge,
        gap: space.xxl,
    },
    section: {
        gap: space.md,
    },
    field: {
        gap: space.xs,
    },
    optionWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.xs,
    },
    photoGrid: {
        width: '100%',
    },
    photoGridRow: {
        flexDirection: 'row',
    },
    photoGridRowSpaced: {
        marginBottom: PHOTO_GRID_GAP,
    },
    photoSlot: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.transparent,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    photoSlotEmpty: {
        borderStyle: 'dashed',
        borderColor: colors.borderStrong,
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
    photoSlotSpaced: {
        marginRight: PHOTO_GRID_GAP,
    },
    photoSlotDragging: {
        borderColor: colors.accent,
        opacity: 0.85,
        zIndex: 100,
        elevation: 12,
    },
    photoSlotDropTarget: {
        borderColor: colors.accent,
        backgroundColor: colors.surfaceRaised,
    },
    photo: {
        width: '100%',
        height: '100%',
    },
    photoPressable: {
        width: '100%',
        height: '100%',
    },
    removeButton: {
        position: 'absolute',
        top: 6,
        right: 6,
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
    dragHandle: {
        position: 'absolute',
        right: 6,
        bottom: 6,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    lockedCard: {
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSunken,
    },
    lockedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    lockedLabel: {
        width: 48,
    },
    lockedValue: {
        flex: 1,
    },
    lockedNote: {
        flexDirection: 'row',
        gap: space.xs,
        paddingTop: space.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    lockedNoteText: {
        flex: 1,
    },
});
