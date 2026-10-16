import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompatibilityHero, CompatibilityReport, getMatchReport } from '@/components/compatibility-report';
import { ProfileView } from '@/components/profile-view';
import { ReportSheet } from '@/components/report-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { LikesSkeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { colors, fontFamily, gutter, radius, space } from '@/constants/theme';
import { type LikeItem } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';
import { useRefreshControl } from '@/hooks/use-refresh-control';
import { haptics } from '@/lib/haptics';
import { listItemEntering, listItemLayout } from '@/lib/list-motion';

type ScoreModalTab = 'score' | 'profile';

const SCORE_TABS = [
    { value: 'score', label: 'Match' },
    { value: 'profile', label: 'Profile' },
] as const;

export default function LikesScreen() {
    const router = useRouter();
    const { likes, isLoadingLikes, profile, refreshLikes, replyToLike, dismissLike } = useAppData();
    const refreshControl = useRefreshControl(refreshLikes);
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [sendingReplyIds, setSendingReplyIds] = useState<Record<string, boolean>>({});

    function updateReply(likeId: string, value: string) {
        setReplyDrafts((drafts) => ({
            ...drafts,
            [likeId]: value,
        }));
    }

    async function sendReply(likeId: string) {
        const reply = replyDrafts[likeId]?.trim();

        if (!reply || sendingReplyIds[likeId]) {
            return;
        }

        setSendingReplyIds((ids) => ({ ...ids, [likeId]: true }));
        const like = likes.find((item) => item.id === likeId);

        try {
            const chatId = await replyToLike(likeId, reply);
            setReplyDrafts((drafts) => {
                const nextDrafts = { ...drafts };
                delete nextDrafts[likeId];
                return nextDrafts;
            });
            if (chatId && like) {
                // Replying turns the like into a match: celebrate, then the match screen opens the chat.
                router.push({
                    pathname: '/match',
                    params: {
                        chatId,
                        name: like.fromName,
                        avatarUrl: like.avatarUrl,
                        score: String(like.compatibility.overallScore ?? ''),
                    },
                });
            } else {
                router.push(chatId ? `/chat/${chatId}` : '/(tabs)/chats');
            }
        } catch (error) {
            haptics.error();
            Alert.alert('Reply not sent', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setSendingReplyIds((ids) => {
                const nextIds = { ...ids };
                delete nextIds[likeId];
                return nextIds;
            });
        }
    }

    return (
        <Screen starSeed={5}>
            <ScreenHeader
                onBack={false}
                largeTitle="Likes you"
                subtitle={
                    likes.length > 0
                        ? `${likes.length} ${likes.length === 1 ? 'person has' : 'people have'} reached out. Check your match before replying.`
                        : undefined
                }
            />
            {likes.length === 0 && isLoadingLikes ? (
                <LikesSkeleton />
            ) : likes.length > 0 ? (
                <ScrollView
                    contentContainerStyle={styles.list}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={refreshControl}
                    showsVerticalScrollIndicator={false}>
                    {likes.map((like, index) => (
                        // No exit animation: the card owns the open score modal, which must close with it.
                        <Animated.View key={like.id} entering={listItemEntering(index)} layout={listItemLayout}>
                            <LikeCard
                                like={like}
                                reply={replyDrafts[like.id] ?? ''}
                                isSendingReply={Boolean(sendingReplyIds[like.id])}
                                viewerName={profile.name}
                                viewerPhotoUri={profile.photoUris[0]}
                                onChangeReply={(value) => updateReply(like.id, value)}
                                onDismiss={() => dismissLike(like.id)}
                                onReply={() => sendReply(like.id)}
                            />
                        </Animated.View>
                    ))}
                </ScrollView>
            ) : (
                <ScrollView contentContainerStyle={styles.emptyContent} refreshControl={refreshControl}>
                    <EmptyState
                        icon="heart-outline"
                        title="No likes yet"
                        message="When someone likes you, their opening message lands here before it moves to Chats."
                    />
                </ScrollView>
            )}
        </Screen>
    );
}

function LikeCard({
    like,
    reply,
    isSendingReply,
    viewerName,
    viewerPhotoUri,
    onChangeReply,
    onDismiss,
    onReply,
}: {
    like: LikeItem;
    reply: string;
    isSendingReply: boolean;
    viewerName: string;
    viewerPhotoUri?: string;
    onChangeReply: (value: string) => void;
    onDismiss: () => void;
    onReply: () => void;
}) {
    const [isScoreOpen, setIsScoreOpen] = useState(false);
    const isUnread = !like.readAt;

    return (
        <Card
            onPress={() => setIsScoreOpen(true)}
            accessibilityLabel={`View Kundli match with ${like.fromName}`}
            style={styles.card}>
            <View style={styles.identityRow}>
                <Avatar uri={like.avatarUrl} name={like.fromName} size={52} ring={isUnread ? colors.like : null} />
                <View style={styles.identityText}>
                    <AppText variant="headline">
                        {like.fromName}, {like.age}
                    </AppText>
                    <AppText variant="footnote" color={colors.textMuted}>
                        {like.location} · {like.timeAgo}
                    </AppText>
                </View>
                <View style={styles.scoreBadge}>
                    <AppText color={colors.accent} style={styles.scoreBadgeValue}>
                        {like.compatibility.overallScore}%
                    </AppText>
                    <AppText variant="caption" color={colors.textFaint}>
                        match
                    </AppText>
                </View>
            </View>

            <View style={styles.quote}>
                <AppText style={styles.quoteText}>“{like.openingMessage}”</AppText>
            </View>

            <View style={styles.cardFooter}>
                <AppText variant="subhead" color={colors.accent}>
                    View match & reply
                </AppText>
                <Ionicons name="arrow-forward" size={16} color={colors.accent} />
            </View>

            <Modal animationType="fade" visible={isScoreOpen} onRequestClose={() => setIsScoreOpen(false)}>
                <KundaliScorePreview
                    like={like}
                    likedName={like.fromName}
                    likedPhotoUri={like.avatarUrl}
                    openingMessage={like.openingMessage}
                    onDismiss={onDismiss}
                    onReply={onReply}
                    onChangeReply={onChangeReply}
                    onClose={() => setIsScoreOpen(false)}
                    reply={reply}
                    isSendingReply={isSendingReply}
                    viewerName={viewerName}
                    viewerPhotoUri={viewerPhotoUri}
                />
            </Modal>
        </Card>
    );
}

function KundaliScorePreview({
    like,
    viewerName,
    viewerPhotoUri,
    likedName,
    likedPhotoUri,
    openingMessage,
    onClose,
    onChangeReply,
    onDismiss,
    onReply,
    reply,
    isSendingReply,
}: {
    like: LikeItem;
    viewerName: string;
    viewerPhotoUri?: string;
    likedName: string;
    likedPhotoUri: string;
    openingMessage: string;
    onClose: () => void;
    onChangeReply: (value: string) => void;
    onDismiss: () => void;
    onReply: () => void;
    reply: string;
    isSendingReply: boolean;
}) {
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<ScoreModalTab>('score');
    const safeViewerName = viewerName === 'New User' ? 'You' : viewerName;
    const profile = buildLikeProfile(like);
    const scores = like.compatibility.breakdown ?? [];
    const overallScore = like.compatibility.overallScore ?? 0;
    const summary =
        getMatchReport(like.compatibility) ??
        like.compatibility.summary ??
        `${safeViewerName} and ${likedName}'s charts show a balanced opening for conversation and steady emotional rhythm.`;
    const yogas = like.compatibility.yogas ?? [];
    const doshas = like.compatibility.doshas ?? [];
    const [isReplyComposerOpen, setIsReplyComposerOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const canReply = reply.trim().length > 0;
    const canPressReply = !isSendingReply && (!isReplyComposerOpen || canReply);

    function handleReplyPress() {
        if (activeTab !== 'score') {
            setActiveTab('score');
            setIsReplyComposerOpen(true);
            return;
        }

        if (!isReplyComposerOpen) {
            setIsReplyComposerOpen(true);
            return;
        }

        onReply();
    }

    return (
        <Screen starSeed={17}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}>
                <ScreenHeader
                    backIcon="close"
                    onBack={onClose}
                    right={
                        <SegmentedControl
                            options={SCORE_TABS}
                            value={activeTab}
                            onChange={setActiveTab}
                            style={styles.tabs}
                        />
                    }
                />

                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.scoreContent}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}>
                    {activeTab === 'score' ? (
                        <>
                            <View style={styles.scoreHeading}>
                                <AppText variant="overline" color={colors.accent} align="center">
                                    {likedName} liked you
                                </AppText>
                                <AppText variant="title1" align="center">
                                    {safeViewerName} & {likedName}
                                </AppText>
                            </View>
                            <CompatibilityHero
                                score={overallScore}
                                viewerName={safeViewerName}
                                viewerPhotoUri={viewerPhotoUri}
                                partnerName={likedName}
                                partnerPhotoUri={likedPhotoUri}
                            />
                            <CompatibilityReport summary={summary} yogas={yogas} doshas={doshas} breakdown={scores} />
                        </>
                    ) : (
                        <ProfileView profile={profile} />
                    )}
                    <Button
                        label={`Report ${likedName}`}
                        icon="flag-outline"
                        variant="ghost"
                        size="sm"
                        fullWidth={false}
                        onPress={() => setIsReportOpen(true)}
                        style={styles.reportLink}
                    />
                </ScrollView>
                <ReportSheet
                    visible={isReportOpen}
                    onClose={() => setIsReportOpen(false)}
                    userId={like.fromProfileId}
                    name={likedName}
                    onReported={(blocked) => {
                        if (blocked) {
                            onClose();
                        }
                    }}
                />

                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) + space.xs }]}>
                    {isReplyComposerOpen ? (
                        <View style={styles.replyBox}>
                            <View style={styles.openingMessage}>
                                <AppText variant="overline" color={colors.textFaint}>
                                    {likedName} said
                                </AppText>
                                <AppText variant="callout">{openingMessage}</AppText>
                            </View>
                            <TextField
                                autoFocus
                                editable={!isSendingReply}
                                multiline
                                onChangeText={onChangeReply}
                                placeholder={`Reply to ${likedName}`}
                                value={reply}
                                style={styles.replyInput}
                            />
                        </View>
                    ) : null}
                    <View style={styles.footerActions}>
                        <Button
                            label="Dismiss"
                            variant="secondary"
                            icon="close"
                            onPress={onDismiss}
                            accessibilityLabel={`Dismiss ${likedName}`}
                            style={styles.footerAction}
                        />
                        <Button
                            label={isReplyComposerOpen ? 'Send reply' : 'Reply'}
                            icon={isReplyComposerOpen ? 'send' : 'chatbubble-ellipses'}
                            loading={isSendingReply}
                            disabled={!canPressReply}
                            onPress={handleReplyPress}
                            accessibilityLabel={`Reply to ${likedName}`}
                            style={styles.footerActionPrimary}
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Screen>
    );
}

function buildLikeProfile(like: LikeItem) {
    if (like.fromProfile) {
        return {
            name: like.fromProfile.name,
            age: like.fromProfile.age,
            location: like.fromProfile.location,
            bio: like.fromProfile.bio,
            photos: like.fromProfile.photos,
            details: like.fromProfile.details,
        };
    }

    return {
        name: like.fromName,
        age: like.age,
        location: like.location,
        bio: like.openingMessage,
        photos: [like.avatarUrl],
        details: [
            { label: 'location', icon: 'home-outline' as const, text: like.location },
            { label: 'intent', icon: 'heart-outline' as const, text: like.note },
            { label: 'compatibility', icon: 'sparkles-outline' as const, text: `${like.compatibility.overallScore}% Kundli match` },
        ],
    };
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    emptyContent: {
        flexGrow: 1,
    },
    list: {
        paddingHorizontal: gutter,
        paddingTop: space.xs,
        paddingBottom: space.xxl,
        gap: space.sm,
    },
    card: {
        gap: space.md,
    },
    identityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    identityText: {
        flex: 1,
        gap: 2,
    },
    scoreBadge: {
        alignItems: 'center',
        paddingHorizontal: space.sm,
        paddingVertical: space.xxs,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.accentLine,
    },
    scoreBadgeValue: {
        fontFamily: fontFamily.display,
        fontSize: 20,
        lineHeight: 24,
    },
    quote: {
        paddingLeft: space.sm,
        borderLeftWidth: 2,
        borderLeftColor: colors.like,
    },
    quoteText: {
        fontFamily: fontFamily.displayItalic,
        fontSize: 17,
        lineHeight: 25,
        color: colors.text,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xxs,
    },
    tabs: {
        width: 200,
    },
    reportLink: {
        alignSelf: 'center',
    },
    scoreContent: {
        paddingHorizontal: gutter,
        paddingTop: space.md,
        paddingBottom: space.xxl,
        gap: space.md,
    },
    scoreHeading: {
        gap: space.xxs,
    },
    footer: {
        paddingHorizontal: gutter,
        paddingTop: space.sm,
        gap: space.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.backgroundDeep,
    },
    replyBox: {
        gap: space.sm,
    },
    openingMessage: {
        gap: 2,
        paddingLeft: space.sm,
        borderLeftWidth: 2,
        borderLeftColor: colors.like,
    },
    replyInput: {
        minHeight: 72,
    },
    footerActions: {
        flexDirection: 'row',
        gap: space.sm,
    },
    footerAction: {
        flex: 1,
    },
    footerActionPrimary: {
        flex: 1.6,
    },
});
