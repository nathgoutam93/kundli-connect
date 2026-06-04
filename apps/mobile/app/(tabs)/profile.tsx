import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
    Alert,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressiveBlur } from '@/components/progressive-blur';
import { type UserProfile } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';

const GENDER_OPTIONS = ['Male', 'Female', 'Non - Binary'];
const PREFERENCE_OPTIONS = ['Male', 'Female', 'Non - Binary People', 'Everyone'];
const FAMILY_PLAN_OPTIONS = ['Dont want Children', 'Want Children', 'Open to Children', 'Not Sure'];
const RELIGION_OPTIONS = [
    'Hindu',
    'Muslim',
    'Christian',
    'Sikh',
    'Buddhist',
    'Jain',
    'Spiritual',
    'Prefer not to say',
];
const HABIT_OPTIONS = ['Never', 'Sometimes', 'Often', 'Prefer not to say'];
const MAX_PHOTOS = 6;
const MIN_PHOTOS = 4;

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

export default function ProfileScreen() {
    const { addProfilePhotos, isServiceBusy, profile, removeProfilePhoto, updateProfile } = useAppData();
    const insets = useSafeAreaInsets();
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState<FormState>(() => ({
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
    }));

    const photoUris = (profile.photoUris ?? []).slice(0, MAX_PHOTOS);
    const heroPhoto = photoUris[0];
    const contentPhotos = photoUris.slice(1);
    const displayName = profile.name || 'New User';
    const profileDetails = buildProfileDetails(profile);
    const firstDetails = profileDetails.slice(0, 4);
    const secondDetails = profileDetails.slice(4, 8);
    const remainingDetails = profileDetails.slice(8);

    function updateForm<T extends keyof FormState>(key: T, value: FormState[T]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    async function pickPhotos() {
        const remainingSlots = MAX_PHOTOS - form.photoUris.length;

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
        const uploadedUris = await addProfilePhotos(pickedUris.slice(0, remainingSlots));
        updateForm('photoUris', Array.from(new Set([...form.photoUris, ...uploadedUris])).slice(0, MAX_PHOTOS));
    }

    async function removePhoto(uriToRemove: string) {
        await removeProfilePhoto(uriToRemove);
        updateForm(
            'photoUris',
            form.photoUris.filter((uri) => uri !== uriToRemove)
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

    function saveProfile() {
        if (form.photoUris.length < MIN_PHOTOS) {
            Alert.alert('Add more photos', `Please keep at least ${MIN_PHOTOS} profile photos.`);
            return;
        }

        updateProfile({
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
        setIsEditing(false);
    }

    if (isEditing) {
        return (
            <SafeAreaView style={styles.editContainer} edges={['top']}>
                <KeyboardAvoidingView
                    style={styles.editKeyboard}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={styles.editTopBar}>
                        <Pressable style={styles.circleButton} onPress={() => setIsEditing(false)}>
                            <Ionicons name="chevron-back" size={24} color="#101010" />
                        </Pressable>
                        <Text style={styles.editTitle}>Edit Profile</Text>
                        <Pressable style={styles.saveButton} onPress={saveProfile} disabled={isServiceBusy}>
                            <Text style={styles.saveText}>Save</Text>
                        </Pressable>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.editContent}
                    >
                        <EditSection title="Photos">
                            <View style={styles.editPhotoGrid}>
                                {Array.from({ length: MAX_PHOTOS }, (_, index) => {
                                    const photoUri = form.photoUris[index];

                                    return (
                                        <Pressable
                                            key={index}
                                            style={styles.editPhotoSlot}
                                            onPress={isServiceBusy ? undefined : pickPhotos}
                                        >
                                            {photoUri ? (
                                                <>
                                                    <Image source={{ uri: photoUri }} style={styles.editPhoto} contentFit="cover" />
                                                    <Pressable
                                                        accessibilityLabel="Remove photo"
                                                        hitSlop={10}
                                                        style={styles.removePhotoButton}
                                                        onPress={() => removePhoto(photoUri)}
                                                        disabled={isServiceBusy}
                                                    >
                                                        <Ionicons name="close" size={12} color="#FFFFFF" />
                                                    </Pressable>
                                                </>
                                            ) : (
                                                <Ionicons name="add" size={24} color="#F7B000" />
                                            )}
                                        </Pressable>
                                    );
                                })}
                            </View>
                            <Pressable style={styles.addPhotoButton} onPress={pickPhotos} disabled={isServiceBusy}>
                                <Ionicons name="images-outline" size={18} color="#101010" />
                                <Text style={styles.addPhotoText}>
                                    {isServiceBusy ? 'Uploading...' : 'Choose From Gallery'}
                                </Text>
                            </Pressable>
                            <Text style={styles.helperText}>Minimum 4 photos, maximum 6.</Text>
                        </EditSection>

                        <EditSection title="Basics">
                            <TextField label="Name" value={form.name} onChangeText={(value) => updateForm('name', value)} />
                            <TextField
                                label="Email"
                                value={form.email}
                                onChangeText={(value) => updateForm('email', value)}
                                keyboardType="email-address"
                            />
                            <TextField
                                label="Date of birth"
                                value={form.dateOfBirth}
                                onChangeText={(value) => updateForm('dateOfBirth', value)}
                                placeholder="DD/MM/YYYY"
                            />
                            <TextField
                                label="Time of birth"
                                value={form.timeOfBirth}
                                onChangeText={(value) => updateForm('timeOfBirth', value)}
                                placeholder="HH:MM:SS"
                            />
                            <TextField
                                label="Location"
                                value={form.location}
                                onChangeText={(value) => updateForm('location', value)}
                            />
                            <TextField
                                label="Bio"
                                value={form.bio}
                                onChangeText={(value) => updateForm('bio', value)}
                                multiline
                            />
                        </EditSection>

                        <EditSection title="Identity">
                            <OptionGroup
                                label="Gender"
                                options={GENDER_OPTIONS}
                                selectedValue={form.gender}
                                onSelect={(value) => updateForm('gender', value)}
                            />
                            <OptionGroup
                                label="Looking for"
                                options={PREFERENCE_OPTIONS}
                                selectedValues={form.genderPreferences}
                                onSelect={togglePreference}
                            />
                            <TextField
                                label="Height"
                                value={form.height}
                                onChangeText={(value) => updateForm('height', value)}
                                placeholder={'5\'7" or 170 cm'}
                            />
                        </EditSection>

                        <EditSection title="Life">
                            <OptionGroup
                                label="Family plans"
                                options={FAMILY_PLAN_OPTIONS}
                                selectedValue={form.familyPlans}
                                onSelect={(value) => updateForm('familyPlans', value)}
                            />
                            <VisibilitySwitch
                                label="Show family plans"
                                value={form.familyPlansVisibleOnProfile}
                                onValueChange={(value) => updateForm('familyPlansVisibleOnProfile', value)}
                            />
                            <TextField
                                label="Workplace"
                                value={form.workplace}
                                onChangeText={(value) => updateForm('workplace', value)}
                            />
                            <VisibilitySwitch
                                label="Show workplace"
                                value={form.workplaceVisibleOnProfile}
                                onValueChange={(value) => updateForm('workplaceVisibleOnProfile', value)}
                            />
                            <TextField
                                label="Role"
                                value={form.jobRole}
                                onChangeText={(value) => updateForm('jobRole', value)}
                            />
                            <VisibilitySwitch
                                label="Show role"
                                value={form.jobRoleVisibleOnProfile}
                                onValueChange={(value) => updateForm('jobRoleVisibleOnProfile', value)}
                            />
                            <TextField
                                label="School"
                                value={form.school}
                                onChangeText={(value) => updateForm('school', value)}
                            />
                            <VisibilitySwitch
                                label="Show school"
                                value={form.schoolVisibleOnProfile}
                                onValueChange={(value) => updateForm('schoolVisibleOnProfile', value)}
                            />
                            <TextField
                                label="Education level"
                                value={form.educationLevel}
                                onChangeText={(value) => updateForm('educationLevel', value)}
                            />
                            <VisibilitySwitch
                                label="Show education"
                                value={form.educationLevelVisibleOnProfile}
                                onValueChange={(value) => updateForm('educationLevelVisibleOnProfile', value)}
                            />
                        </EditSection>

                        <EditSection title="Beliefs and Habits">
                            <OptionGroup
                                label="Religion"
                                options={RELIGION_OPTIONS}
                                selectedValue={form.religiousBeliefs}
                                onSelect={(value) => updateForm('religiousBeliefs', value)}
                            />
                            <OptionGroup
                                label="Drinking"
                                options={HABIT_OPTIONS}
                                selectedValue={form.drinking}
                                onSelect={(value) => updateForm('drinking', value)}
                            />
                            <VisibilitySwitch
                                label="Show drinking"
                                value={form.drinkingVisibleOnProfile}
                                onValueChange={(value) => updateForm('drinkingVisibleOnProfile', value)}
                            />
                            <OptionGroup
                                label="Smoking"
                                options={HABIT_OPTIONS}
                                selectedValue={form.smoking}
                                onSelect={(value) => updateForm('smoking', value)}
                            />
                            <VisibilitySwitch
                                label="Show smoking"
                                value={form.smokingVisibleOnProfile}
                                onValueChange={(value) => updateForm('smokingVisibleOnProfile', value)}
                            />
                        </EditSection>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    {heroPhoto ? (
                        <Image source={{ uri: heroPhoto }} style={styles.heroImage} contentFit="cover" />
                    ) : (
                        <View style={styles.heroPlaceholder}>
                            <Ionicons name="person" size={82} color="#FFFFFF" />
                        </View>
                    )}
                    <View style={styles.heroShade} />
                    <View style={styles.heroIdentity}>
                        <Text style={styles.heroName}>
                            {displayName}
                            {profile.age ? `, ${profile.age}` : ''}
                        </Text>
                        <Text style={styles.heroLocation}>{profile.location || 'Location not added'}</Text>
                    </View>
                </View>

                <View style={styles.profileCard}>
                    {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
                    <DetailsBlock details={firstDetails} />
                    {contentPhotos[0] ? <InlineProfilePhoto uri={contentPhotos[0]} /> : null}
                    <DetailsBlock details={secondDetails} />
                    {contentPhotos[1] ? <InlineProfilePhoto uri={contentPhotos[1]} /> : null}
                    <DetailsBlock details={remainingDetails} />
                    {contentPhotos.slice(2).map((uri) => (
                        <InlineProfilePhoto key={uri} uri={uri} />
                    ))}
                </View>
            </ScrollView>

            <View style={styles.stickyHeader} pointerEvents="box-none">
                <ProgressiveBlur intensity={90} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top + 12 }]}>
                    <Pressable
                        accessibilityLabel="Edit profile"
                        style={styles.circleButtonDark}
                        onPress={() => router.push('/edit-profile')}>
                        <Ionicons name="pencil" size={20} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                        accessibilityLabel="View kundli"
                        style={styles.circleButtonDark}
                        onPress={() => router.push('/kundli')}>
                        <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                        accessibilityLabel="Open subscription"
                        style={styles.circleButtonDark}
                        onPress={() => router.push('/subscriptions')}>
                        <Ionicons name="diamond" size={20} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                        accessibilityLabel="Open settings"
                        style={styles.circleButtonDark}
                        onPress={() => router.push('/settings')}>
                        <Ionicons name="settings" size={20} color="#FFFFFF" />
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

function DetailsBlock({
    details,
}: {
    details: { label: string; icon: keyof typeof Ionicons.glyphMap; text: string }[];
}) {
    if (details.length === 0) {
        return null;
    }

    return (
        <View style={styles.detailsCard}>
            {details.map((item) => (
                <DetailRow key={item.label} icon={item.icon} text={item.text} />
            ))}
        </View>
    );
}

function InlineProfilePhoto({ uri }: { uri: string }) {
    return (
        <View style={styles.inlinePhotoWrap}>
            <Image source={{ uri }} style={styles.inlinePhoto} contentFit="cover" />
        </View>
    );
}

function buildProfileDetails(profile: UserProfile) {
    const genderPreference = profile.genderPreferences?.join(', ');
    const work = [profile.workplaceVisibleOnProfile ? profile.workplace : '', profile.jobRoleVisibleOnProfile ? profile.jobRole : '']
        .filter(Boolean)
        .join(', ');
    const education = [
        profile.schoolVisibleOnProfile ? profile.school : '',
        profile.educationLevelVisibleOnProfile ? profile.educationLevel : '',
    ]
        .filter(Boolean)
        .join(', ');

    return [
        { label: 'gender', icon: 'person-outline' as const, text: profile.gender },
        { label: 'preference', icon: 'magnet-outline' as const, text: genderPreference },
        { label: 'height', icon: 'resize-outline' as const, text: profile.height },
        { label: 'work', icon: 'briefcase-outline' as const, text: work },
        { label: 'education', icon: 'school-outline' as const, text: education },
        { label: 'religion', icon: 'sparkles-outline' as const, text: profile.religiousBeliefs },
        { label: 'location', icon: 'home-outline' as const, text: profile.location },
        { label: 'family', icon: 'people-outline' as const, text: profile.familyPlansVisibleOnProfile ? profile.familyPlans : '' },
        { label: 'drinking', icon: 'wine-outline' as const, text: profile.drinkingVisibleOnProfile ? `Drinking: ${profile.drinking}` : '' },
        { label: 'smoking', icon: 'ban-outline' as const, text: profile.smokingVisibleOnProfile ? `Smoking: ${profile.smoking}` : '' },
    ].filter((item) => item.text);
}

function DetailRow({
    icon,
    text,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
}) {
    return (
        <View style={styles.detailRow}>
            <Ionicons name={icon} size={24} color="#FCAD00" />
            <Text style={styles.detailText}>{text}</Text>
        </View>
    );
}

function EditSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <View style={styles.editSection}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {children}
        </View>
    );
}

function TextField({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    multiline,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'email-address';
    multiline?: boolean;
}) {
    return (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor="#A59A8F"
                keyboardType={keyboardType}
                multiline={multiline}
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
                    const isSelected = selectedValue === option || selectedValues?.includes(option);

                    return (
                        <Pressable
                            key={option}
                            style={[styles.optionChip, isSelected && styles.optionChipSelected]}
                            onPress={() => onSelect(option)}
                        >
                            <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
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
        backgroundColor: '#FFFFFF',
    },
    content: {
        paddingBottom: 34,
    },
    hero: {
        height: 520,
        backgroundColor: '#2D241E',
    },
    heroImage: {
        ...StyleSheet.absoluteFillObject,
    },
    heroPlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#C9A35D',
    },
    heroShade: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.22)',
    },
    stickyHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
    },
    stickyHeaderContent: {
        minHeight: 82,
        paddingHorizontal: 20,
        paddingBottom: 80,
        alignItems: 'center',
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'flex-end',
    },
    circleButtonDark: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.22)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroIdentity: {
        position: 'absolute',
        left: 26,
        right: 26,
        bottom: 76,
        alignItems: 'center',
    },
    heroName: {
        color: '#FFFFFF',
        fontSize: 34,
        lineHeight: 39,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: 0,
    },
    heroLocation: {
        marginTop: 5,
        color: '#E9E4DF',
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 3.1,
        textAlign: 'center',
    },
    profileCard: {
        marginTop: -40,
        minHeight: 360,
        borderTopLeftRadius: 34,
        borderTopRightRadius: 34,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 32,
        paddingTop: 42,
    },
    notch: {
        position: 'absolute',
        top: -1,
        left: '50%',
        width: 42,
        height: 42,
        marginLeft: -21,
        backgroundColor: '#FFD11B',
        transform: [{ rotate: '45deg' }],
        borderBottomRightRadius: 12,
    },
    bio: {
        color: '#4B4540',
        fontSize: 16,
        lineHeight: 23,
        textAlign: 'center',
        marginBottom: 18,
    },
    detailsCard: {
        marginBottom: 18,
        borderWidth: 1,
        borderColor: '#FFE08B',
        borderRadius: 18,
        paddingHorizontal: 20,
        backgroundColor: '#FFFFFF',
    },
    detailRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
        borderBottomWidth: 1,
        borderBottomColor: '#F5E2BA',
    },
    detailText: {
        flex: 1,
        color: '#272320',
        fontSize: 15,
        lineHeight: 20,
    },
    inlinePhotoWrap: {
        marginBottom: 18,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: '#EFE8E0',
    },
    inlinePhoto: {
        width: '100%',
        aspectRatio: 0.78,
    },
    editContainer: {
        flex: 1,
        backgroundColor: '#FFFCF7',
    },
    editKeyboard: {
        flex: 1,
    },
    editTopBar: {
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
        backgroundColor: '#FFFCF7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    editTitle: {
        color: '#090A0E',
        fontSize: 21,
        lineHeight: 25,
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
    editContent: {
        paddingHorizontal: 20,
        paddingBottom: 36,
        gap: 18,
    },
    editSection: {
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
        lineHeight: 22,
        fontWeight: '800',
    },
    editPhotoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    editPhotoSlot: {
        width: '30.7%',
        aspectRatio: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#FFD22C',
        backgroundColor: '#FFFBEF',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    editPhoto: {
        width: '100%',
        height: '100%',
    },
    removePhotoButton: {
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
    addPhotoButton: {
        minHeight: 46,
        borderRadius: 14,
        backgroundColor: '#FFF8DD',
        borderWidth: 1,
        borderColor: '#F7B000',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    addPhotoText: {
        color: '#101010',
        fontSize: 15,
        lineHeight: 18,
        fontWeight: '800',
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
        lineHeight: 17,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.7,
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
        lineHeight: 20,
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
        lineHeight: 18,
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
        gap: 16,
    },
    switchLabel: {
        flex: 1,
        color: '#4B4540',
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '700',
    },
});
