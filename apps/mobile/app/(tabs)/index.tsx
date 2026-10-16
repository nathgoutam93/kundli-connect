import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
    FadeInDown,
    FadeInUp,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompatibilityHero, CompatibilityReport } from '@/components/compatibility-report';
import { ProfileView } from '@/components/profile-view';
import { AppText } from '@/components/ui/app-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { DiscoverSkeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { toast } from '@/components/ui/toast';
import { colors, gutter, radius, shadow, space } from '@/constants/theme';
import { type CompatibilityResult, type DiscoverProfile } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { haptics } from '@/lib/haptics';
import { AnimatedPressable, easings, springs } from '@/lib/motion';

export default function DiscoverScreen() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevisitingSkipped, setIsRevisitingSkipped] = useState(false);
    const {
        chats,
        discoverProfiles,
        creditsBalance,
        generateCompatibility,
        isLoadingDiscover,
        likedProfileIds,
        passProfile,
        profile: viewer,
        sendLike,
        isServiceBusy,
        serviceError,
        skippedProfileIds,
        subscription,
    } = useAppData();

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
    const isPremium = subscription.status === 'active';

    function showNextProfile() {
        setCurrentIndex((index) => index + 1);
    }

    async function handlePass(profileId: string) {
        try {
            await passProfile(profileId);
        } catch (error) {
            Alert.alert('Could not skip', error instanceof Error ? error.message : 'Please try again.');
            return;
        }
        if (isRevisitingSkipped) {
            showNextProfile();
        }
    }

    /** Resolves to whether the like went through, so the card can come back if it didn't. */
    async function handleLike(profileId: string, name: string, message: string) {
        try {
            const sent = await sendLike(profileId, message);
            if (!sent) {
                Alert.alert('Credits needed', 'Add credits or upgrade to keep liking profiles.');
                return false;
            }
            toast.show({ title: 'Like sent', message: `${name} will see your message first.`, tone: 'success', icon: 'heart' });
            return true;
        } catch (error) {
            const alertMessage = error instanceof Error ? error.message : 'Could not send like.';
            haptics.error();
            Alert.alert('Like unavailable', alertMessage);
            return false;
        }
    }

    async function handleViewScore(profileId: string) {
        try {
            return await generateCompatibility(profileId);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not generate match score.';
            Alert.alert('Match score unavailable', message);
            return undefined;
        }
    }

    const header = (
        <DiscoverHeader
            creditsBalance={creditsBalance}
            isPremium={isPremium}
            isRevisitingSkipped={isRevisitingSkipped && Boolean(profile)}
        />
    );

    if (!profile && isLoadingDiscover) {
        return (
            <Screen>
                {header}
                <DiscoverSkeleton />
            </Screen>
        );
    }

    if (!profile) {
        const canRevisitSkipped = freshProfiles.length === 0 && skippedProfiles.length > 0 && !isRevisitingSkipped;

        return (
            <Screen>
                {header}
                <EmptyState
                    loading={isServiceBusy}
                    icon={serviceError ? 'cloud-offline-outline' : 'moon-outline'}
                    title={
                        isServiceBusy
                            ? 'Reading the stars'
                            : serviceError
                                ? 'Could not load profiles'
                                : canRevisitSkipped
                                    ? 'You’ve seen everyone new'
                                    : 'That’s everyone for today'
                    }
                    message={
                        isServiceBusy
                            ? 'Finding people whose charts align with yours.'
                            : serviceError
                                ? serviceError
                                : canRevisitSkipped
                                    ? 'Take another look at the profiles you skipped earlier.'
                                    : 'New recommendations appear as more people join. Check back soon.'
                    }
                    action={
                        canRevisitSkipped ? (
                            <Button
                                label="Review skipped profiles"
                                variant="secondary"
                                icon="refresh"
                                fullWidth={false}
                                onPress={() => {
                                    setCurrentIndex(0);
                                    setIsRevisitingSkipped(true);
                                }}
                            />
                        ) : null
                    }
                />
            </Screen>
        );
    }

    return (
        <Screen starSeed={11}>
            {header}
            <RecommendationCard
                key={`${profile.id}-${currentIndex}`}
                profile={profile}
                viewerName={viewer.name}
                viewerPhotoUri={viewer.photoUris[0]}
                onPass={() => handlePass(profile.id)}
                onLike={(message) => handleLike(profile.id, profile.name, message)}
                onViewScore={() => handleViewScore(profile.id)}
            />
        </Screen>
    );
}

function DiscoverHeader({
    creditsBalance,
    isPremium,
    isRevisitingSkipped,
}: {
    creditsBalance: number;
    isPremium: boolean;
    isRevisitingSkipped: boolean;
}) {
    return (
        <View style={styles.header}>
            <View style={styles.headerTitle}>
                <AppText variant="title2">Discover</AppText>
                {isRevisitingSkipped ? (
                    <View style={styles.revisitPill}>
                        <AppText variant="caption" color={colors.textMuted}>
                            Revisiting skipped
                        </AppText>
                    </View>
                ) : null}
            </View>
            <CreditPill creditsBalance={creditsBalance} isPremium={isPremium} />
        </View>
    );
}

/** Credits shortcut; the count pops when the balance changes (a like spent, a pack bought). */
function CreditPill({ creditsBalance, isPremium }: { creditsBalance: number; isPremium: boolean }) {
    const pop = useSharedValue(1);
    const previousBalance = useRef(creditsBalance);
    const { animatedStyle, pressHandlers } = usePressAnimation({
        pressedScale: 0.94,
        onPress: () => router.push('/subscriptions'),
    });

    useEffect(() => {
        if (previousBalance.current !== creditsBalance) {
            pop.value = withSequence(withTiming(1.3, { duration: 120 }), withSpring(1, springs.pop));
            previousBalance.current = creditsBalance;
        }
    }, [creditsBalance, pop]);

    const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

    return (
        <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={isPremium ? 'Premium member' : `${creditsBalance} credits. Open plans`}
            style={[styles.creditPill, animatedStyle]}
            {...pressHandlers}>
            <Ionicons name={isPremium ? 'infinite' : 'flash'} size={14} color={colors.accent} />
            <Animated.View style={countStyle}>
                <AppText variant="subhead">{isPremium ? 'Premium' : creditsBalance}</AppText>
            </Animated.View>
        </AnimatedPressable>
    );
}

function RecommendationCard({
    profile,
    viewerName,
    viewerPhotoUri,
    onPass,
    onLike,
    onViewScore,
}: {
    profile: DiscoverProfile;
    viewerName: string;
    viewerPhotoUri?: string;
    onPass: () => void;
    onLike: (message: string) => Promise<boolean>;
    onViewScore: () => Promise<CompatibilityResult | undefined>;
}) {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    // Cards arrive with a soft scale-up and leave left (pass) or up-right (like).
    const arrival = useSharedValue(0);
    const departure = useSharedValue(0);
    const direction = useSharedValue(0);

    useEffect(() => {
        arrival.value = withSpring(1, springs.settle);
    }, [arrival]);

    const cardStyle = useAnimatedStyle(() => {
        const d = departure.value;
        return {
            opacity: Math.min(arrival.value, 1) * interpolate(d, [0, 0.7, 1], [1, 0.6, 0]),
            transform: [
                { translateX: direction.value * d * width * 0.85 },
                { translateY: direction.value > 0 ? -d * 90 : d * 16 + (1 - arrival.value) * 18 },
                { rotate: `${direction.value * d * 9}deg` },
                { scale: 0.94 + 0.06 * Math.min(arrival.value, 1) },
            ],
        };
    });

    function animateOut(towards: -1 | 1) {
        return new Promise<void>((resolve) => {
            direction.value = towards;
            departure.value = withTiming(1, { duration: 320, easing: easings.in }, (finished) => {
                if (finished) {
                    runOnJS(resolve)();
                }
            });
        });
    }

    function animateBack() {
        departure.value = withSpring(0, springs.settle);
    }

    async function pass() {
        await animateOut(-1);
        onPass();
    }
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [openingMessage, setOpeningMessage] = useState('');
    const [isScoreOpen, setIsScoreOpen] = useState(false);
    const [isScoreLoading, setIsScoreLoading] = useState(false);
    const [compatibility, setCompatibility] = useState(profile.compatibility);
    const heroPhoto = profile.photos[0];
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

    async function sendLike() {
        const trimmedMessage = openingMessage.trim();

        if (!trimmedMessage) {
            return;
        }

        setOpeningMessage('');
        setIsMessageOpen(false);
        haptics.press();
        const [sent] = await Promise.all([onLike(trimmedMessage), animateOut(1)]);
        if (!sent) {
            setOpeningMessage(trimmedMessage);
            animateBack();
        }
    }

    function skipAfterScore() {
        setIsScoreOpen(false);
        void pass();
    }

    return (
        <View style={styles.cardContainer}>
            <Animated.View style={[styles.cardContainer, cardStyle]}>
                <ScrollView
                    contentContainerStyle={[styles.cardContent, { paddingBottom: insets.bottom + 120 }]}
                    showsVerticalScrollIndicator={false}>
                    <ProfileView profile={profile} />
                </ScrollView>
            </Animated.View>

            <View style={styles.actionsDock}>
                <IconButton
                    icon="close"
                    accessibilityLabel={`Pass on ${profile.name}`}
                    onPress={pass}
                    size={60}
                    iconSize={28}
                    variant="surface"
                    effect="wiggle"
                    style={styles.dockButton}
                />
                <IconButton
                    icon={isScoreLoading ? 'hourglass-outline' : 'heart'}
                    accessibilityLabel={`Like ${profile.name}`}
                    onPress={requestLike}
                    disabled={isScoreLoading}
                    size={72}
                    iconSize={32}
                    variant="like"
                    effect="burst"
                    haptic="press"
                    style={styles.dockButton}
                />
            </View>

            <BottomSheet
                visible={isMessageOpen}
                onClose={() => setIsMessageOpen(false)}
                eyebrow="Opening message"
                title={`Say hello to ${profile.name}`}>
                <TextField
                    autoFocus
                    maxLength={120}
                    onChangeText={setOpeningMessage}
                    placeholder="Your profile has such calm Sunday energy."
                    returnKeyType="send"
                    value={openingMessage}
                    onSubmitEditing={sendLike}
                    hint={`${openingMessage.length}/120 · a thoughtful first line gets more replies`}
                />
                <Button
                    label="Send like"
                    variant="like"
                    icon="heart"
                    iconPosition="trailing"
                    disabled={!canSendLike}
                    onPress={sendLike}
                    accessibilityLabel={`Send like to ${profile.name}`}
                />
            </BottomSheet>

            <Modal animationType="fade" visible={isScoreOpen} onRequestClose={skipAfterScore}>
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

    return (
        <Screen edges={['top']} starSeed={21}>
            <ScrollView contentContainerStyle={styles.scoreContent} showsVerticalScrollIndicator={false}>
                <Animated.View entering={FadeInDown.duration(400)} style={styles.scoreHeading}>
                    <AppText variant="overline" color={colors.accent} align="center">
                        Your Kundli match
                    </AppText>
                    <AppText variant="title1" align="center">
                        {safeViewerName} & {likedName}
                    </AppText>
                </Animated.View>
                <CompatibilityHero
                    score={compatibility.overallScore}
                    viewerName={safeViewerName}
                    viewerPhotoUri={viewerPhotoUri}
                    partnerName={likedName}
                    partnerPhotoUri={likedPhotoUri}
                />
                <CompatibilityReport
                    summary={compatibility.summary}
                    yogas={compatibility.yogas}
                    doshas={compatibility.doshas}
                    breakdown={compatibility.breakdown}
                />
            </ScrollView>

            <Animated.View
                entering={FadeInUp.delay(250).duration(400)}
                style={[styles.scoreFooter, { paddingBottom: Math.max(insets.bottom, space.md) + space.xs }]}>
                <AppText variant="footnote" color={colors.textMuted} align="center">
                    Only reach out if the match feels right.
                </AppText>
                <View style={styles.scoreActions}>
                    <Button
                        label="Skip"
                        variant="secondary"
                        icon="close"
                        onPress={onSkip}
                        accessibilityLabel={`Skip ${likedName}`}
                        style={styles.scoreAction}
                    />
                    <Button
                        label="Say hello"
                        icon="chatbubble-ellipses"
                        onPress={onInitiate}
                        accessibilityLabel={`Initiate chat with ${likedName}`}
                        style={styles.scoreActionPrimary}
                    />
                </View>
            </Animated.View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: gutter,
        paddingTop: space.xs,
        paddingBottom: space.sm,
    },
    headerTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    revisitPill: {
        paddingHorizontal: space.xs,
        paddingVertical: 3,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
    },
    creditPill: {
        minHeight: 34,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: space.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.accentLine,
        backgroundColor: colors.surface,
    },
    cardContainer: {
        flex: 1,
    },
    cardContent: {
        paddingHorizontal: space.md,
        paddingTop: space.xxs,
    },
    actionsDock: {
        position: 'absolute',
        bottom: space.lg,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xl,
        padding: space.xs,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        backgroundColor: colors.glass,
        ...shadow.soft,
    },
    dockButton: {
        borderWidth: 0,
    },
    scoreContent: {
        paddingHorizontal: gutter,
        paddingTop: space.xl,
        paddingBottom: space.xxl,
        gap: space.md,
    },
    scoreHeading: {
        gap: space.xxs,
    },
    scoreFooter: {
        paddingHorizontal: gutter,
        paddingTop: space.sm,
        gap: space.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.backgroundDeep,
    },
    scoreActions: {
        flexDirection: 'row',
        gap: space.sm,
    },
    scoreAction: {
        flex: 1,
    },
    scoreActionPrimary: {
        flex: 1.6,
    },
});
