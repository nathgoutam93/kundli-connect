import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressiveBlur } from '@/components/progressive-blur';
import { type CompatibilityResult, type DiscoverProfile } from '@/constants/mock-data';
import { useAppState } from '@/store/use-app-state';

export default function DiscoverScreen() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevisitingSkipped, setIsRevisitingSkipped] = useState(false);
    const {
        chats,
        discoverProfiles,
        consumeCredit,
        creditsBalance,
        generateCompatibility,
        likedProfileIds,
        passProfile,
        profile: viewer,
        refreshDiscoverProfiles,
        sendLike,
        isServiceBusy,
        serviceError,
        skippedProfileIds,
        subscription,
    } = useAppState();

    useEffect(() => {
        void refreshDiscoverProfiles().catch((error) => {
            console.warn('Failed to refresh discover profiles.', error);
        });
    }, [refreshDiscoverProfiles]);

    useEffect(() => {
        setCurrentIndex(0);
    }, [discoverProfiles.length]);
    const matchedProfileIds = chats.map((chat) => chat.participantId);
    const recommendedProfiles = discoverProfiles.filter((item) => !matchedProfileIds.includes(item.id));
    const freshProfiles = recommendedProfiles.filter(
        (item) => !skippedProfileIds.includes(item.id) && !likedProfileIds.includes(item.id)
    );
    const skippedProfiles = recommendedProfiles.filter(
        (item) => skippedProfileIds.includes(item.id) && !likedProfileIds.includes(item.id)
    );
    const shouldRevisitSkipped = freshProfiles.length === 0 && isRevisitingSkipped;
    const availableProfiles = freshProfiles.length > 0 ? freshProfiles : shouldRevisitSkipped ? skippedProfiles : [];
    const profile = availableProfiles[currentIndex % Math.max(availableProfiles.length, 1)];

    function showNextProfile() {
        setCurrentIndex((index) => index + 1);
    }

    async function handlePass(profileId: string) {
        await passProfile(profileId);
        if (isRevisitingSkipped) {
            showNextProfile();
        }
    }

    async function handleLike(profileId: string, message: string) {
        try {
            const sent = await sendLike(profileId, message);
            if (!sent) {
                Alert.alert('Credits needed', 'Add credits or upgrade to keep liking profiles.');
            }
        } catch (error) {
            const alertMessage = error instanceof Error ? error.message : 'Could not send like.';
            Alert.alert('Like unavailable', alertMessage);
        }
    }

    async function handleViewScore(profileId: string, profileName: string) {
        const consumed = await consumeCredit(`Generated score for ${profileName}`);
        if (!consumed) {
            Alert.alert('Credits needed', 'Add credits or upgrade to generate match scores.');
            return undefined;
        }

        try {
            return await generateCompatibility(profileId);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not generate match score.';
            Alert.alert('Match score unavailable', message);
            return undefined;
        }
    }

    if (!profile) {
        const canRevisitSkipped = freshProfiles.length === 0 && skippedProfiles.length > 0 && !isRevisitingSkipped;

        return (
            <View style={styles.emptyDiscover}>
                <Ionicons name={isServiceBusy ? 'hourglass-outline' : 'sparkles-outline'} size={34} color="#8D7F74" />
                <Text style={styles.emptyDiscoverTitle}>
                    {isServiceBusy
                        ? 'Finding profiles'
                        : serviceError
                            ? 'Could not load profiles'
                            : canRevisitSkipped
                                ? 'No new profiles'
                                : 'No more profiles today'}
                </Text>
                <Text style={styles.emptyDiscoverText}>
                    {isServiceBusy
                        ? 'Recommendations from Supabase will appear here shortly.'
                        : serviceError
                            ? serviceError
                            : canRevisitSkipped
                                ? 'You can revisit profiles you skipped earlier.'
                                : 'New recommendations will appear here after more profiles are added.'}
                </Text>
                {canRevisitSkipped ? (
                    <Pressable
                        style={styles.revisitButton}
                        onPress={() => {
                            setCurrentIndex(0);
                            setIsRevisitingSkipped(true);
                        }}>
                        <Text style={styles.revisitButtonText}>Review skipped profiles</Text>
                    </Pressable>
                ) : null}
            </View>
        );
    }

    return (
        <RecommendationCard
            key={`${profile.id}-${currentIndex}`}
            profile={profile}
            viewerName={viewer.name}
            viewerPhotoUri={viewer.photoUris[0]}
            creditsBalance={creditsBalance}
            isPremium={subscription.status === 'active'}
            isRevisitingSkipped={isRevisitingSkipped}
            onPass={() => handlePass(profile.id)}
            onLike={(message) => handleLike(profile.id, message)}
            onViewScore={() => handleViewScore(profile.id, profile.name)}
        />
    );
}

function RecommendationCard({
    profile,
    viewerName,
    viewerPhotoUri,
    creditsBalance,
    isPremium,
    isRevisitingSkipped,
    onPass,
    onLike,
    onViewScore,
}: {
    profile: DiscoverProfile;
    viewerName: string;
    viewerPhotoUri?: string;
    creditsBalance: number;
    isPremium: boolean;
    isRevisitingSkipped: boolean;
    onPass: () => void;
    onLike: (message: string) => void;
    onViewScore: () => Promise<CompatibilityResult | undefined>;
}) {
    const insets = useSafeAreaInsets();
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [openingMessage, setOpeningMessage] = useState('');
    const [isScoreOpen, setIsScoreOpen] = useState(false);
    const [isScoreLoading, setIsScoreLoading] = useState(false);
    const [compatibility, setCompatibility] = useState(profile.compatibility);
    const [heroPhoto, ...contentPhotos] = profile.photos;
    const firstDetails = profile.details.slice(0, 4);
    const secondDetails = profile.details.slice(4);
    const canSendLike = openingMessage.trim().length > 0;

    async function requestLike() {
        if (isScoreLoading) {
            return;
        }

        setIsScoreLoading(true);
        const generatedCompatibility = await onViewScore();
        setIsScoreLoading(false);

        if (generatedCompatibility) {
            setCompatibility(generatedCompatibility);
            setIsScoreOpen(true);
        }
    }

    function initiateChatAfterScore() {
        setIsScoreOpen(false);
        setIsMessageOpen(true);
    }

    function sendLike() {
        const trimmedMessage = openingMessage.trim();

        if (!trimmedMessage) {
            return;
        }

        setOpeningMessage('');
        setIsMessageOpen(false);
        onLike(trimmedMessage);
    }

    function skipAfterScore() {
        setIsScoreOpen(false);
        onPass();
    }

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 128 }]}
                showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Image source={{ uri: heroPhoto }} style={styles.heroImage} contentFit="cover" />
                    <View style={styles.heroShade} />
                    <View style={styles.heroIdentity}>
                        <Text style={styles.heroName}>
                            {profile.name}, {profile.age}
                        </Text>
                        <Text style={styles.heroLocation}>{profile.location}</Text>
                    </View>
                </View>

                <View style={styles.profileCard}>
                    <Text style={styles.bio}>{profile.bio}</Text>
                    <DetailsBlock details={firstDetails} />
                    {contentPhotos[0] ? <InlineProfilePhoto uri={contentPhotos[0]} /> : null}
                    <DetailsBlock details={secondDetails} />
                    {contentPhotos[1] ? <InlineProfilePhoto uri={contentPhotos[1]} /> : null}
                </View>
            </ScrollView>

            <View style={styles.stickyHeader} pointerEvents="box-none">
                <ProgressiveBlur intensity={100} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top + 12 }]}>
                    {isRevisitingSkipped ? (
                        <View style={styles.revisitPill}>
                            <Text style={styles.revisitText}>Revisiting skipped</Text>
                        </View>
                    ) : (
                        <View />
                    )}
                    <Pressable
                        accessibilityLabel="Open subscription"
                        onPress={() => router.push('/subscriptions')}
                        style={({ pressed }) => [styles.creditPill, pressed && styles.pressed]}>
                        <Ionicons name="flash" size={15} color="#2D241E" />
                        <Text style={styles.creditText}>{isPremium ? '∞' : creditsBalance}</Text>
                    </Pressable>
                </View>
            </View>

            <View style={[styles.actionsDock, { bottom: Math.max(insets.bottom + 12, 24) }]}>
                <Pressable
                    accessibilityLabel={`Pass on ${profile.name}`}
                    onPress={onPass}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                    <Ionicons name="close" size={31} color="#5B174F" />
                </Pressable>
                <Pressable
                    accessibilityLabel={`Like ${profile.name}`}
                    onPress={requestLike}
                    disabled={isScoreLoading}
                    style={({ pressed }) => [
                        styles.actionButton,
                        styles.likeButton,
                        isScoreLoading && styles.actionButtonDisabled,
                        pressed && styles.actionButtonPressed,
                    ]}>
                    <Ionicons name={isScoreLoading ? 'hourglass-outline' : 'heart'} size={30} color="#FFFFFF" />
                </Pressable>
            </View>

            <Modal
                transparent
                animationType="slide"
                visible={isMessageOpen}
                onRequestClose={() => setIsMessageOpen(false)}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalLayer}>
                    <Pressable style={styles.modalScrim} onPress={() => setIsMessageOpen(false)} />
                    <View style={[styles.messageSheet, { paddingBottom: Math.max(insets.bottom + 18, 30) }]}>
                        <View style={styles.sheetHandle} />
                        <View style={styles.sheetHeader}>
                            <View>
                                <Text style={styles.sheetEyebrow}>Opening message</Text>
                                <Text style={styles.sheetTitle}>Send a like to {profile.name}</Text>
                            </View>
                            <Pressable
                                accessibilityLabel="Close opening message"
                                hitSlop={10}
                                onPress={() => setIsMessageOpen(false)}>
                                <Ionicons name="close" size={24} color="#312A24" />
                            </Pressable>
                        </View>
                        <TextInput
                            autoFocus
                            maxLength={120}
                            onChangeText={setOpeningMessage}
                            placeholder="Your profile has such calm Sunday energy."
                            placeholderTextColor="#9A8E83"
                            returnKeyType="send"
                            style={styles.openingInput}
                            value={openingMessage}
                            onSubmitEditing={sendLike}
                        />
                        <View style={styles.sheetFooter}>
                            <Text style={styles.characterCount}>{openingMessage.length}/120</Text>
                            <Pressable
                                accessibilityLabel={`Send like to ${profile.name}`}
                                disabled={!canSendLike}
                                onPress={sendLike}
                                style={({ pressed }) => [
                                    styles.sendLikeButton,
                                    !canSendLike && styles.sendLikeButtonDisabled,
                                    pressed && canSendLike && styles.actionButtonPressed,
                                ]}>
                                <Text style={styles.sendLikeText}>Send like</Text>
                                <Ionicons name="heart" size={17} color="#FFFFFF" />
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal
                animationType="fade"
                visible={isScoreOpen}
                onRequestClose={skipAfterScore}>
                <KundaliMatchScore
                    compatibility={compatibility}
                    likedPhotoUri={heroPhoto}
                    likedName={profile.name}
                    onInitiate={initiateChatAfterScore}
                    onSkip={skipAfterScore}
                    viewerName={viewerName}
                    viewerPhotoUri={viewerPhotoUri}
                />
            </Modal>
        </View>
    );
}

function KundaliMatchScore({
    compatibility,
    viewerName,
    viewerPhotoUri,
    likedName,
    likedPhotoUri,
    onInitiate,
    onSkip,
}: {
    compatibility: CompatibilityResult;
    viewerName: string;
    viewerPhotoUri?: string;
    likedName: string;
    likedPhotoUri: string;
    onInitiate: () => void;
    onSkip: () => void;
}) {
    const insets = useSafeAreaInsets();
    const safeViewerName = viewerName === 'New User' ? 'You' : viewerName;
    const fallbackViewerPhoto =
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=85';
    const scores = compatibility.breakdown;

    return (
        <View style={[styles.scoreScreen, { paddingTop: Math.max(insets.top + 18, 40) }]}>
            <ScrollView
                style={styles.scoreScroll}
                contentContainerStyle={styles.scoreContent}
                showsVerticalScrollIndicator={false}>
                <View style={styles.scoreHeader}>
                    <ProfileOrb uri={viewerPhotoUri ?? fallbackViewerPhoto} color="#FCB200" />
                    <Ionicons name="close" size={34} color="#F2A600" />
                    <ProfileOrb uri={likedPhotoUri} color="#FF3F45" />
                </View>

                <View style={styles.matchBadge}>
                    <Text style={styles.matchPercent}>{compatibility.overallScore}%</Text>
                    <Text style={styles.matchLabel}>Astro Match</Text>
                </View>

                <View style={styles.analysisCard}>
                    <View style={styles.analysisHeader}>
                        <View style={styles.sparkleBadge}>
                            <Ionicons name="sparkles" size={23} color="#FFFFFF" />
                        </View>
                        <View style={styles.analysisCopy}>
                            <Text style={styles.analysisTitle}>Kundli Match Analysis ✦</Text>
                            <Text style={styles.analysisText}>
                                {safeViewerName} and {likedName}
                                {`'s match analysis: ${compatibility.summary} `}
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.groupTitle}>Yogas</Text>
                    <View style={styles.chipRow}>
                        {compatibility.yogas.map((yoga) => (
                            <AstroChip key={yoga} icon="flower-outline" label={yoga} color="#F4AA00" />
                        ))}
                    </View>

                    <Text style={[styles.groupTitle, styles.doshaTitle]}>Doshas</Text>
                    <View style={styles.chipRow}>
                        {compatibility.doshas.map((dosha) => (
                            <AstroChip key={dosha} icon="moon-outline" label={dosha} color="#FF4D58" />
                        ))}
                    </View>

                    <View style={styles.divider} />
                    <Text style={styles.scoreTitle}>Kundli Match Score ✦</Text>
                    {scores.map((score) => (
                        <View key={score.label} style={styles.scoreRow}>
                            <View style={styles.scoreRowHeader}>
                                <Text style={styles.scoreLabel}>{score.label}</Text>
                                <Text style={styles.scoreValue}>{score.value}%</Text>
                            </View>
                            <View style={styles.scoreTrack}>
                                <View style={[styles.scoreFill, { width: `${score.value}%` }]} />
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>

            <View style={[styles.sentLikeCard, { marginBottom: Math.max(insets.bottom + 18, 28) }]}>
                <Pressable
                    accessibilityLabel={`Skip ${likedName}`}
                    onPress={onSkip}
                    style={({ pressed }) => [styles.skipScoreButton, pressed && styles.actionButtonPressed]}>
                    <Ionicons name="close" size={22} color="#5B174F" />
                </Pressable>
                <Text style={styles.sentLikeText} numberOfLines={2}>
                    Initiate only if the match feels right.
                </Text>
                <Pressable
                    accessibilityLabel={`Initiate chat with ${likedName}`}
                    onPress={onInitiate}
                    style={({ pressed }) => [styles.initiateButton, pressed && styles.actionButtonPressed]}>
                    <Text style={styles.initiateButtonText}>Initiate</Text>
                    <Ionicons name="chatbubble-ellipses" size={18} color="#FFFFFF" />
                </Pressable>
            </View>
        </View>
    );
}

function ProfileOrb({ uri, color }: { uri: string; color: string }) {
    return (
        <View style={[styles.profileOrb, { borderColor: color }]}>
            <Image source={{ uri }} style={styles.profileOrbImage} contentFit="cover" />
        </View>
    );
}

function AstroChip({
    icon,
    label,
    color,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    color: string;
}) {
    return (
        <View style={[styles.astroChip, { borderColor: color }]}>
            <Ionicons name={icon} size={20} color={color} />
            <Text style={[styles.astroChipText, { color }]}>{label}</Text>
        </View>
    );
}

function DetailsBlock({
    details,
}: {
    details: DiscoverProfile['details'];
}) {
    if (details.length === 0) {
        return null;
    }

    return (
        <View style={styles.detailsCard}>
            {details.map((item) => (
                <View key={item.label} style={styles.detailRow}>
                    <Ionicons name={item.icon} size={24} color="#FCAD00" />
                    <Text style={styles.detailText}>{item.text}</Text>
                </View>
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

const styles = StyleSheet.create({
    emptyDiscover: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 30,
    },
    emptyDiscoverTitle: {
        color: '#2D241E',
        fontSize: 22,
        fontWeight: '800',
        marginTop: 14,
        textAlign: 'center',
    },
    emptyDiscoverText: {
        color: '#6D6259',
        fontSize: 15,
        lineHeight: 22,
        marginTop: 8,
        textAlign: 'center',
    },
    revisitButton: {
        alignItems: 'center',
        backgroundColor: '#2D241E',
        borderRadius: 8,
        justifyContent: 'center',
        marginTop: 22,
        minHeight: 48,
        paddingHorizontal: 18,
    },
    revisitButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '900',
    },
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
        // backgroundColor: '#000'
    },
    stickyHeaderContent: {
        minHeight: 82,
        paddingHorizontal: 20,
        paddingBottom: 80,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    creditPill: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.72)',
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 5,
        minHeight: 36,
        minWidth: 58,
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    creditText: {
        color: '#2D241E',
        fontSize: 15,
        fontWeight: '900',
    },
    pressed: {
        opacity: 0.72,
    },
    revisitPill: {
        alignItems: 'center',
        backgroundColor: 'rgba(45, 36, 30, 0.76)',
        borderColor: 'rgba(255, 255, 255, 0.28)',
        borderRadius: 16,
        borderWidth: 1,
        minHeight: 32,
        justifyContent: 'center',
        paddingHorizontal: 11,
    },
    revisitText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
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
        paddingBottom: 18,
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
    actionsDock: {
        position: 'absolute',
        alignSelf: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 22,
        borderRadius: 44,
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        padding: 10,
        shadowColor: '#2D241E',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.18,
        shadowRadius: 22,
        elevation: 8,
    },
    actionButton: {
        width: 68,
        height: 68,
        borderRadius: 34,
        borderWidth: 1,
        borderColor: '#F1E7DC',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    likeButton: {
        borderColor: '#FF413C',
        backgroundColor: '#FF413C',
    },
    actionButtonPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.96 }],
    },
    actionButtonDisabled: {
        opacity: 0.68,
    },
    modalLayer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(28, 22, 18, 0.36)',
    },
    messageSheet: {
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 22,
        paddingTop: 12,
    },
    sheetHandle: {
        alignSelf: 'center',
        width: 42,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#E1D8CF',
        marginBottom: 20,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 18,
    },
    sheetEyebrow: {
        color: '#F1A400',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 5,
    },
    sheetTitle: {
        color: '#191512',
        fontSize: 24,
        lineHeight: 29,
        fontWeight: '800',
        letterSpacing: 0,
    },
    openingInput: {
        minHeight: 54,
        borderWidth: 1,
        borderColor: '#F2DCA4',
        borderRadius: 8,
        paddingHorizontal: 16,
        color: '#26211E',
        fontSize: 16,
        lineHeight: 21,
        backgroundColor: '#FFFDF8',
    },
    sheetFooter: {
        marginTop: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
    },
    characterCount: {
        color: '#8E8176',
        fontSize: 13,
        fontWeight: '700',
    },
    sendLikeButton: {
        minHeight: 48,
        borderRadius: 24,
        paddingHorizontal: 18,
        backgroundColor: '#FF413C',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    sendLikeButtonDisabled: {
        backgroundColor: '#D8D0C9',
    },
    sendLikeText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    scoreScreen: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 24,
    },
    scoreScroll: {
        flex: 1,
    },
    scoreContent: {
        paddingBottom: 22,
    },
    scoreHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 34,
        marginBottom: 28,
    },
    profileOrb: {
        width: 82,
        height: 82,
        borderRadius: 41,
        borderWidth: 3,
        padding: 4,
        backgroundColor: '#FFFFFF',
    },
    profileOrbImage: {
        flex: 1,
        borderRadius: 35,
    },
    matchBadge: {
        alignSelf: 'center',
        minWidth: 210,
        borderWidth: 5,
        borderLeftColor: '#F4B000',
        borderTopColor: '#F4B000',
        borderRightColor: '#FF4245',
        borderBottomColor: '#FF4245',
        borderRadius: 42,
        paddingVertical: 20,
        paddingHorizontal: 36,
        alignItems: 'center',
        marginBottom: 28,
    },
    matchPercent: {
        color: '#F4AA00',
        fontSize: 48,
        lineHeight: 54,
        fontWeight: '900',
        letterSpacing: 0,
    },
    matchLabel: {
        color: '#2D2926',
        fontSize: 18,
        lineHeight: 23,
        fontWeight: '800',
    },
    analysisCard: {
        borderWidth: 1,
        borderColor: '#F3D99A',
        borderRadius: 22,
        padding: 22,
        backgroundColor: '#FFFFFF',
    },
    analysisHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        marginBottom: 24,
    },
    sparkleBadge: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8BE1C',
    },
    analysisCopy: {
        flex: 1,
        minWidth: 0,
    },
    analysisTitle: {
        color: '#27211E',
        fontSize: 18,
        lineHeight: 23,
        fontWeight: '900',
        marginBottom: 5,
    },
    analysisText: {
        color: '#302B27',
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '500',
    },
    moreText: {
        color: '#F0A000',
    },
    groupTitle: {
        color: '#F0A000',
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
        marginBottom: 12,
    },
    doshaTitle: {
        color: '#FF4D58',
        marginTop: 18,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    astroChip: {
        minHeight: 44,
        borderWidth: 1,
        borderRadius: 22,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    astroChipText: {
        fontSize: 15,
        fontWeight: '700',
    },
    divider: {
        height: 1,
        backgroundColor: '#EEE9E3',
        marginTop: 24,
        marginBottom: 18,
    },
    scoreTitle: {
        color: '#F0A000',
        fontSize: 18,
        lineHeight: 23,
        fontWeight: '900',
        marginBottom: 12,
    },
    scoreRow: {
        marginBottom: 13,
    },
    scoreRowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 14,
        marginBottom: 6,
    },
    scoreLabel: {
        color: '#161311',
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '800',
    },
    scoreValue: {
        color: '#161311',
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '700',
    },
    scoreTrack: {
        height: 5,
        borderRadius: 3,
        backgroundColor: '#E5E5EA',
        overflow: 'hidden',
    },
    scoreFill: {
        height: '100%',
        borderRadius: 3,
        backgroundColor: '#F7B500',
        borderLeftWidth: 5,
        borderLeftColor: '#FF421D',
    },
    sentLikeCard: {
        minHeight: 62,
        borderRadius: 31,
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 18,
        paddingRight: 7,
        shadowColor: '#2D241E',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
        elevation: 7,
    },
    skipScoreButton: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8F5F1',
    },
    sentLikeText: {
        flex: 1,
        minWidth: 0,
        color: '#2E2925',
        fontSize: 14,
        lineHeight: 19,
        fontWeight: '700',
    },
    initiateButton: {
        minWidth: 112,
        height: 50,
        borderRadius: 25,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FF413C',
    },
    initiateButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '900',
    },
});
