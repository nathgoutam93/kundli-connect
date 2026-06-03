import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    KeyboardAvoidingView,
    PanResponder,
    type PanResponderGestureState,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    type StyleProp,
    Switch,
    Text,
    TextInput,
    type ViewStyle,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppState } from '@/store/use-app-state';

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 4;
const PHOTO_GRID_COLUMNS = 3;
const PHOTO_GRID_GAP = 10;
const GENDER_OPTIONS = ['Male', 'Female', 'Non - Binary'];
const PREFERENCE_OPTIONS = ['Male', 'Female', 'Non - Binary People', 'Everyone'];
const FAMILY_PLAN_OPTIONS = ['Dont want Children', 'Want Children', 'Open to Children', 'Not Sure'];
const RELIGION_OPTIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Spiritual', 'Prefer not to say'];
const HABIT_OPTIONS = ['Never', 'Sometimes', 'Often', 'Prefer not to say'];

type FormState = {
    name: string;
    email: string;
    dateOfBirth: string;
    timeOfBirth: string;
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

function profileToForm(profile: ReturnType<typeof useAppState.getState>['profile']): FormState {
    return {
        name: profile.name === 'New User' ? '' : profile.name,
        email: profile.email,
        dateOfBirth: profile.dateOfBirth,
        timeOfBirth: profile.timeOfBirth,
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
        refreshProfile,
        removeProfilePhoto,
        updateProfile,
    } = useAppState();
    const [form, setForm] = useState<FormState>(() => profileToForm(profile));
    const [photoGridWidth, setPhotoGridWidth] = useState(0);
    const [draggingPhotoUri, setDraggingPhotoUri] = useState<string | null>(null);
    const [photoDropTargetIndex, setPhotoDropTargetIndex] = useState<number | null>(null);
    const [isPhotoDragging, setIsPhotoDragging] = useState(false);
    const photoUrisRef = useRef(form.photoUris);
    const draggingPhotoUriRef = useRef<string | null>(null);
    const dragStartIndexRef = useRef<number | null>(null);
    const photoDropTargetIndexRef = useRef<number | null>(null);

    useEffect(() => {
        refreshProfile()
            .then(() => setForm(profileToForm(useAppState.getState().profile)))
            .catch(() => undefined);
    }, [refreshProfile]);

    useEffect(() => {
        photoUrisRef.current = form.photoUris;
    }, [form.photoUris]);

    function updateForm<T extends keyof FormState>(key: T, value: FormState[T]) {
        setForm((current) => ({ ...current, [key]: value }));
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
            Alert.alert('Photo limit reached', `You can add up to ${MAX_PHOTOS} photos.`);
            return;
        }

        const pickedUri = await pickPhoto();
        if (!pickedUri) {
            return;
        }

        const uploadedUris = await addProfilePhotos([pickedUri]);
        updateForm('photoUris', [...form.photoUris, ...uploadedUris].slice(0, MAX_PHOTOS));
    }

    async function replacePhoto(index: number) {
        const oldUri = form.photoUris[index];
        const pickedUri = await pickPhoto();
        if (!pickedUri) {
            return;
        }

        const uploadedUris = await addProfilePhotos([pickedUri]);
        const nextUri = uploadedUris[0];
        if (!nextUri) {
            return;
        }

        if (oldUri) {
            await removeProfilePhoto(oldUri);
        }

        setForm((current) => {
            const nextUris = [...current.photoUris];
            nextUris[index] = nextUri;
            return { ...current, photoUris: nextUris };
        });
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
        const photoUris = photoUrisRef.current;
        const startColumn = startIndex % PHOTO_GRID_COLUMNS;
        const startRow = Math.floor(startIndex / PHOTO_GRID_COLUMNS);
        const columnOffset = Math.round(gesture.dx / stepSize);
        const rowOffset = Math.round(gesture.dy / stepSize);
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
        if (form.photoUris.length < MIN_PHOTOS) {
            Alert.alert('Add more photos', `Please keep at least ${MIN_PHOTOS} profile photos.`);
            return;
        }

        await updateProfile({
            name: form.name.trim() || profile.name,
            email: form.email.trim(),
            dateOfBirth: form.dateOfBirth.trim(),
            timeOfBirth: form.timeOfBirth.trim(),
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
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.topBar}>
                    <Pressable style={styles.circleButton} onPress={() => router.back()} disabled={isServiceBusy}>
                        <Ionicons name="chevron-back" size={24} color="#101010" />
                    </Pressable>
                    <Text style={styles.title}>Edit Profile</Text>
                    <Pressable style={styles.saveButton} onPress={saveProfile} disabled={isServiceBusy}>
                        <Text style={styles.saveText}>{isServiceBusy ? 'Saving' : 'Save'}</Text>
                    </Pressable>
                </View>

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
                        <Text style={styles.helperText}>
                            Tap to replace, or drag a photo to reorder it. Replaced photos are deleted from Storage.
                        </Text>
                    </Section>

                    <Section title="Basics">
                        <TextField label="Name" value={form.name} onChangeText={(value) => updateForm('name', value)} />
                        <TextField label="Email" value={form.email} onChangeText={(value) => updateForm('email', value)} keyboardType="email-address" />
                        <TextField label="Date of birth" value={form.dateOfBirth} onChangeText={(value) => updateForm('dateOfBirth', value)} />
                        <TextField label="Time of birth" value={form.timeOfBirth} onChangeText={(value) => updateForm('timeOfBirth', value)} />
                        <TextField label="Location" value={form.location} onChangeText={(value) => updateForm('location', value)} />
                        <TextField label="Bio" value={form.bio} onChangeText={(value) => updateForm('bio', value)} multiline />
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
        </SafeAreaView>
    );
}

function PhotoSlot({
    index,
    isBusy,
    isDropTarget,
    isDragging,
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
    const didDragRef = useRef(false);
    const dragOffset = useRef(new Animated.ValueXY()).current;
    const touchStartedOnRemoveRef = useRef(false);
    const finishDrag = useCallback(() => {
        onEndDrag();
        dragOffset.setValue({ x: 0, y: 0 });
        setTimeout(() => {
            didDragRef.current = false;
        }, 150);
    }, [dragOffset, onEndDrag]);
    const isRemoveTouch = useCallback(
        (locationX: number, locationY: number) => Boolean(slotSize && locationX >= slotSize - 44 && locationY <= 44),
        [slotSize]
    );

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: (event) => {
                    if (!photoUri || isBusy) {
                        return false;
                    }

                    touchStartedOnRemoveRef.current = isRemoveTouch(event.nativeEvent.locationX, event.nativeEvent.locationY);
                    return !touchStartedOnRemoveRef.current;
                },
                onMoveShouldSetPanResponder: (_, gesture) =>
                    Boolean(photoUri) && !isBusy && !touchStartedOnRemoveRef.current && Math.hypot(gesture.dx, gesture.dy) > 3,
                onPanResponderGrant: () => {
                    didDragRef.current = false;
                    dragOffset.setValue({ x: 0, y: 0 });
                    onBeginDrag(index);
                },
                onPanResponderMove: (_, gesture) => {
                    didDragRef.current = Math.hypot(gesture.dx, gesture.dy) > 3;
                    dragOffset.setValue({ x: gesture.dx, y: gesture.dy });
                    onMoveDrag(gesture);
                },
                onPanResponderRelease: () => {
                    if (!didDragRef.current) {
                        dragOffset.setValue({ x: 0, y: 0 });
                        onEndDrag();
                        onReplace(index);
                        return;
                    }

                    finishDrag();
                },
                onPanResponderTerminate: finishDrag,
            }),
        [dragOffset, finishDrag, index, isBusy, isRemoveTouch, onBeginDrag, onEndDrag, onMoveDrag, onReplace, photoUri]
    );

    if (!photoUri) {
        return (
            <Pressable
                style={[styles.photoSlot, slotSize ? { width: slotSize, height: slotSize } : null, slotStyle]}
                onPress={onAdd}
                disabled={isBusy}>
                <Ionicons name="add" size={24} color="#F7B000" />
            </Pressable>
        );
    }

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={[
                styles.photoSlot,
                slotSize ? { width: slotSize, height: slotSize } : null,
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
            <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
            <Pressable
                accessibilityLabel="Remove photo"
                hitSlop={10}
                style={styles.removeButton}
                onPress={() => onRemove(photoUri)}
                disabled={isBusy}>
                <Ionicons name="close" size={12} color="#FFFFFF" />
            </Pressable>
        </Animated.View>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
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
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
                multiline={multiline}
                placeholderTextColor="#A59A8F"
                style={[styles.input, multiline && styles.multilineInput]}
            />
        </View>
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
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.optionWrap}>
                {options.map((option) => {
                    const selected = selectedValue === option || selectedValues?.includes(option);

                    return (
                        <Pressable key={option} style={[styles.optionChip, selected && styles.optionChipSelected]} onPress={() => onSelect(option)}>
                            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
                        </Pressable>
                    );
                })}
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
    return (
        <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{label}</Text>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: '#E1D7C6', true: '#FBD06D' }}
                thumbColor={value ? '#FCAD00' : '#F8F1E4'}
                ios_backgroundColor="#E1D7C6"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFCF7',
    },
    keyboard: {
        flex: 1,
    },
    topBar: {
        minHeight: 64,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    circleButton: {
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 1,
        borderColor: '#FBD06D',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: '#090A0E',
        fontSize: 21,
        fontWeight: '800',
    },
    saveButton: {
        minWidth: 66,
        minHeight: 42,
        borderRadius: 21,
        backgroundColor: '#FFD11B',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
    },
    saveText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 36,
        gap: 18,
    },
    section: {
        gap: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#FFE3A1',
        backgroundColor: '#FFFFFF',
        padding: 16,
    },
    sectionTitle: {
        color: '#090A0E',
        fontSize: 18,
        fontWeight: '800',
    },
    photoGrid: {
        minHeight: 1,
    },
    photoGridRow: {
        flexDirection: 'row',
    },
    photoGridRowSpaced: {
        marginBottom: PHOTO_GRID_GAP,
    },
    photoSlot: {
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#FFD22C',
        backgroundColor: '#FFFBEF',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    photoSlotSpaced: {
        marginRight: PHOTO_GRID_GAP,
    },
    photoSlotDragging: {
        borderStyle: 'solid',
        borderColor: '#FCAD00',
        opacity: 0.72,
        zIndex: 2,
        elevation: 2,
    },
    photoSlotDropTarget: {
        borderStyle: 'solid',
        borderColor: '#FCAD00',
        backgroundColor: '#FFF4C7',
    },
    photo: {
        width: '100%',
        height: '100%',
    },
    removeButton: {
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
    dragHandle: {
        position: 'absolute',
        right: 7,
        bottom: 7,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(9, 10, 14, 0.56)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    helperText: {
        color: '#85858D',
        fontSize: 13,
        lineHeight: 17,
    },
    field: {
        gap: 8,
    },
    fieldLabel: {
        color: '#6D6258',
        fontSize: 13,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    input: {
        minHeight: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E8D8B8',
        backgroundColor: '#FFFCF7',
        paddingHorizontal: 13,
        paddingVertical: 11,
        color: '#090A0E',
        fontSize: 15,
    },
    multilineInput: {
        minHeight: 92,
        textAlignVertical: 'top',
    },
    optionWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 9,
    },
    optionChip: {
        minHeight: 38,
        borderRadius: 19,
        borderWidth: 1,
        borderColor: '#E8D8B8',
        backgroundColor: '#FFFCF7',
        paddingHorizontal: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionChipSelected: {
        backgroundColor: '#FFD11B',
        borderColor: '#FFD11B',
    },
    optionText: {
        color: '#554B43',
        fontSize: 14,
        fontWeight: '700',
    },
    optionTextSelected: {
        color: '#FFFFFF',
    },
    switchRow: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    switchLabel: {
        flex: 1,
        color: '#554B43',
        fontSize: 15,
        fontWeight: '700',
    },
});
