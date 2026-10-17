import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/action-sheet';
import { CompatibilityHero, CompatibilityReport, getMatchReport } from '@/components/compatibility-report';
import { ProfileView } from '@/components/profile-view';
import { ReportSheet } from '@/components/report-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toast } from '@/components/ui/toast';
import { colors, fontFamily, gutter, radius, space } from '@/constants/theme';
import { type ChatPreview, type CompatibilityResult, type DiscoverProfile, type LikeItem } from '@/constants/mock-data';
import { useChatDraft } from '@/hooks/use-chat-draft';
import { useAppData } from '@/hooks/use-app-data';
import { useChatMessagesInfiniteQuery, useChatPreviewQuery } from '@/hooks/use-domain-data';
import { useSafetyActions } from '@/hooks/use-safety-actions';
import { isPendingMessage } from '@/lib/chat-cache';
import { haptics } from '@/lib/haptics';
import { springs } from '@/lib/motion';

type ActiveTab = 'chat' | 'score' | 'profile';

const THREAD_TABS = [
    { value: 'chat', label: 'Chat' },
    { value: 'score', label: 'Match' },
    { value: 'profile', label: 'Profile' },
] as const;


type ChatThread = {
    id: string;
    name: string;
    avatarUrl: string;
    messages: ChatPreview['messages'];
};

type MatchProfile = {
    name: string;
    age?: number;
    location: string;
    bio: string;
    photos: string[];
    details: DiscoverProfile['details'];
    compatibilityScore: number | null;
    compatibility?: CompatibilityResult;
};

function buildThreadFromPreview(chatId: string, chat?: ChatPreview, messages?: ChatPreview['messages']): ChatThread {
    if (!chat) {
        return {
            id: chatId,
            name: 'Match',
            avatarUrl: '',
            messages: [
                {
                    id: `${chatId}-missing`,
                    createdAt: new Date().toISOString(),
                    senderId: 'system',
                    text: 'This chat could not be found.',
                },
            ],
        };
    }

    return {
        id: chat.id,
        name: chat.name,
        avatarUrl: chat.avatarUrl,
        messages: messages ?? chat.messages,
    };
}

function buildMatchProfile(
    chat: ChatPreview | undefined,
    discoverProfiles: DiscoverProfile[],
    likes: LikeItem[]
): MatchProfile {
    const discoverProfile = discoverProfiles.find(
        (profile) => profile.id === chat?.participantId
    );
    const participantProfile = chat?.participantProfile ?? discoverProfile;
    const like = likes.find((item) => item.fromProfileId === chat?.participantId);
    const chatCompatibility = chat?.compatibility;

    if (participantProfile) {
        return {
            name: participantProfile.name,
            age: participantProfile.age,
            location: participantProfile.location,
            bio: participantProfile.bio,
            photos: participantProfile.photos,
            details: participantProfile.details,
            compatibilityScore: chatCompatibility?.overallScore ?? participantProfile.compatibility?.overallScore ?? null,
            compatibility: chatCompatibility ?? participantProfile.compatibility ?? undefined,
        };
    }

    if (like) {
        return {
            name: like.fromName,
            age: like.age,
            location: like.location,
            bio: '',
            photos: [like.avatarUrl],
            details: [
                { label: 'location', icon: 'home-outline', text: like.location },
                { label: 'intent', icon: 'heart-outline', text: like.note },
            ],
            compatibilityScore: chatCompatibility?.overallScore ?? like.compatibility?.overallScore ?? null,
            compatibility: chatCompatibility ?? like.compatibility ?? undefined,
        };
    }

    return {
        name: chat?.name ?? 'Match',
        location: 'Location not shared',
        bio: '',
        photos: chat?.avatarUrl ? [chat.avatarUrl] : [],
        details: [
            {
                label: 'compatibility',
                icon: 'sparkles-outline',
                text: chatCompatibility ? `${chatCompatibility.overallScore}% Kundli match` : 'Compatibility unavailable',
            },
            { label: 'status', icon: 'chatbubble-ellipses-outline', text: 'Matched conversation' },
        ],
        compatibilityScore: chatCompatibility?.overallScore ?? chat?.compatibilityScore ?? null,
        compatibility: chatCompatibility,
    };
}

function buildScoreRows(profile: MatchProfile) {
    if (profile.compatibility) {
        return profile.compatibility.breakdown;
    }

    return [];
}

export default function ChatThreadScreen() {
    const params = useLocalSearchParams<{ chatId: string | string[]; draft?: string | string[] }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const safety = useSafetyActions();
    const {
        chats,
        discoverProfiles,
        likes,
        markChatRead,
        sendChatMessage,
    } = useAppData();
    const routeChatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;
    const seed = Array.isArray(params.draft) ? params.draft[0] : params.draft;
    const { draft,setDraft,seedError } = useChatDraft(routeChatId,seed,() => router.setParams({ draft:undefined }));
    const chatQuery = useChatPreviewQuery(routeChatId ?? '');
    const chat = chatQuery.isSuccess ? chatQuery.data ?? undefined : chats.find((item) => item.id === routeChatId);
    const chatId = chat?.id ?? routeChatId;
    const messagesQuery = useChatMessagesInfiniteQuery(chatId ?? '');
    const markChatReadRef = useRef(markChatRead);
    markChatReadRef.current = markChatRead;
    const messages = useMemo(() => {
        const seenMessageIds = new Set<string>();
        return [...(messagesQuery.data?.pages ?? [])]
            .reverse()
            .flatMap((page) => page.messages)
            .filter((message) => {
                if (seenMessageIds.has(message.id)) {
                    return false;
                }
                seenMessageIds.add(message.id);
                return true;
            });
    }, [messagesQuery.data?.pages]);

    const thread = useMemo(() => {
        if (!chatId) {
            return buildThreadFromPreview('missing-chat');
        }

        return buildThreadFromPreview(chatId, chat, messagesQuery.data ? messages : undefined);
    }, [chat, chatId, messages, messagesQuery.data]);

    const matchProfile = useMemo(
        () => buildMatchProfile(chat, discoverProfiles, likes),
        [chat, discoverProfiles, likes]
    );

    // Mark read on open and whenever a new incoming message arrives while the thread is open.
    const latestIncomingMessageId = [...thread.messages].reverse().find((message) => message.senderId !== 'me')?.id;
    const canMarkRead = Boolean(chat && messagesQuery.data);
    useEffect(() => {
        if (chatId && canMarkRead) {
            void markChatReadRef.current(chatId).catch(() => {
                toast.warning('Could not mark this conversation as read.');
            });
        }
    }, [chatId, canMarkRead, latestIncomingMessageId]);

    const partnerId = chat?.participantId;

    async function toggleHidden() {
        if (!chatId) {
            return;
        }
        const hide = !chat?.hidden;
        try {
            await safety.setHidden(chatId, hide);
            toast.info(hide ? 'Moved to Hidden in your chats.' : 'Back in Conversations.', hide ? 'Chat hidden' : 'Chat restored');
        } catch (error) {
            Alert.alert('Something went wrong', error instanceof Error ? error.message : 'Please try again.');
        }
    }

    function confirmUnmatch() {
        Alert.alert(`Unmatch ${thread.name}?`, 'This ends the chat for both of you and can’t be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Unmatch',
                style: 'destructive',
                onPress: async () => {
                    if (!chatId) return;
                    try {
                        await safety.unmatch(chatId);
                        toast.info(`You and ${thread.name} are no longer matched.`, 'Unmatched');
                        router.back();
                    } catch (error) {
                        Alert.alert('Could not unmatch', error instanceof Error ? error.message : 'Please try again.');
                    }
                },
            },
        ]);
    }

    function confirmBlock() {
        if (!partnerId) return;
        Alert.alert(
            `Block ${thread.name}?`,
            'You won’t see each other anywhere in the app, and this chat ends for both of you. You can unblock them later in Settings.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Block',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await safety.block(partnerId);
                            toast.info(`You won’t see ${thread.name} again.`, 'Blocked');
                            router.back();
                        } catch (error) {
                            Alert.alert('Could not block', error instanceof Error ? error.message : 'Please try again.');
                        }
                    },
                },
            ]
        );
    }

    async function handleSend() {
        const text = draft.trim();
        if (!chatId || !text) {
            return;
        }

        setDraft('');
        try {
            await sendChatMessage(chatId, text, routeChatId);
        } catch (error) {
            // The optimistic bubble is rolled back; give the text back so nothing is lost.
            setDraft((current) => current || text);
            haptics.error();
            Alert.alert('Message not sent', error instanceof Error ? error.message : 'Please try again.');
        }
    }

    if (chatQuery.isPending || (chat && messagesQuery.isPending)) {
        return <Screen><EmptyState title="Loading conversation" loading /></Screen>;
    }
    if (chatQuery.isError || messagesQuery.isError) {
        return <Screen><EmptyState title="Could not load conversation" message="Check your connection and try again."
            action={<Button label="Try again" onPress={() => { void chatQuery.refetch(); void messagesQuery.refetch(); }} />} /></Screen>;
    }
    if (!chat) {
        return <Screen><EmptyState title="Conversation unavailable" message="This match may have ended."
            action={<Button label="Back to chats" onPress={() => router.replace('/(tabs)/chats')} />} /></Screen>;
    }

    return (
        <Screen starSeed={13}>
            <Stack.Screen options={{ headerShown: false }} />
            <KeyboardAvoidingView
                behavior="padding"
                style={styles.flex}>
                <View style={styles.header}>
                    <IconButton icon="chevron-back" accessibilityLabel="Back" size={40} onPress={() => router.back()} />
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View ${thread.name}'s profile`}
                        onPress={() => setActiveTab('profile')}
                        style={styles.headerIdentity}>
                        <Avatar uri={thread.avatarUrl} name={thread.name} size={36} />
                        <View style={styles.headerText}>
                            <AppText variant="headline" numberOfLines={1}>
                                {thread.name}
                            </AppText>
                            {matchProfile.compatibilityScore !== null ? (
                                <AppText variant="caption" color={colors.accent}>
                                    ✦ {matchProfile.compatibilityScore}% Kundli match
                                </AppText>
                            ) : null}
                        </View>
                    </Pressable>
                    <IconButton
                        icon="ellipsis-horizontal"
                        accessibilityLabel="Open chat actions"
                        size={40}
                        variant="plain"
                        onPress={() => setIsMenuOpen(true)}
                    />
                </View>

                <SegmentedControl options={THREAD_TABS} value={activeTab} onChange={setActiveTab} style={styles.tabs} />

                {activeTab === 'chat' ? (
                    <ChatTab
                        isLoaded={Boolean(messagesQuery.data)}
                        isLoadingEarlier={messagesQuery.isFetchingNextPage}
                        thread={thread}
                        hasMoreMessages={Boolean(messagesQuery.hasNextPage)}
                        onLoadEarlier={async () => {
                            await messagesQuery.fetchNextPage();
                        }}
                    />
                ) : null}
                {activeTab === 'score' ? <ScoreTab profile={matchProfile} /> : null}
                {activeTab === 'profile' ? <ProfileTab profile={matchProfile} /> : null}

                {activeTab === 'chat' ? (
                    <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, space.sm) + space.xs }]}>
                        <TextInput
                            maxLength={2000}
                            placeholder="Write a message"
                            keyboardAppearance="dark"
                            placeholderTextColor={colors.textFaint}
                            selectionColor={colors.accent}
                            value={draft}
                            onChangeText={setDraft}
                            onSubmitEditing={handleSend}
                            multiline
                            style={styles.composer}
                        />
                        <SendButton canSend={Boolean(draft.trim())} onSend={handleSend} />
                        {seedError ? <AppText color={colors.danger}>The icebreaker was too long to add to your current draft.</AppText> : null}
                    </View>
                ) : null}
            </KeyboardAvoidingView>

            <ActionSheet
                visible={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                actions={[
                    {
                        label: chat?.hidden ? 'Move back to Conversations' : 'Hide chat',
                        icon: chat?.hidden ? 'eye-outline' : 'eye-off-outline',
                        onPress: toggleHidden,
                    },
                    { label: `Unmatch ${thread.name}`, icon: 'heart-dislike-outline', onPress: confirmUnmatch },
                    { label: `Block ${thread.name}`, icon: 'ban-outline', tone: 'danger', onPress: confirmBlock },
                    { label: `Report ${thread.name}`, icon: 'flag-outline', tone: 'danger', onPress: () => setIsReportOpen(true) },
                ]}
            />
            {partnerId ? (
                <ReportSheet
                    visible={isReportOpen}
                    onClose={() => setIsReportOpen(false)}
                    userId={partnerId}
                    name={thread.name}
                    onReported={(blocked) => {
                        if (blocked) {
                            router.back();
                        }
                    }}
                />
            ) : null}
        </Screen>
    );
}

/** Send button that springs up to full size once there is something to send. */
function SendButton({ canSend, onSend }: { canSend: boolean; onSend: () => void }) {
    const ready = useSharedValue(canSend ? 1 : 0);

    useEffect(() => {
        ready.value = withSpring(canSend ? 1 : 0, canSend ? springs.pop : springs.settle);
    }, [canSend, ready]);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: 0.84 + 0.16 * ready.value }],
    }));

    return (
        <Animated.View style={style}>
            <IconButton
                icon="arrow-up"
                accessibilityLabel="Send message"
                variant="accent"
                size={44}
                iconSize={22}
                haptic="press"
                disabled={!canSend}
                onPress={onSend}
            />
        </Animated.View>
    );
}

function ChatTab({
    hasMoreMessages,
    isLoaded,
    isLoadingEarlier,
    onLoadEarlier,
    thread,
}: {
    hasMoreMessages: boolean;
    isLoaded: boolean;
    isLoadingEarlier: boolean;
    onLoadEarlier: () => Promise<void>;
    thread: ChatThread;
}) {
    const scrollRef = useRef<ScrollView>(null);
    const lastMessageId = thread.messages[thread.messages.length - 1]?.id;
    const scrolledToId = useRef<string | undefined>(undefined);
    // Only messages that arrive after the thread has loaded animate in: not the initial page,
    // and not older pages prepended by "Earlier messages".
    const seenIds = useRef(new Set<string>());
    const isSettled = useRef(false);
    let lastSeenIndex = -1;
    thread.messages.forEach((message, index) => {
        if (seenIds.current.has(message.id)) {
            lastSeenIndex = index;
        }
    });

    useEffect(() => {
        thread.messages.forEach((message) => seenIds.current.add(message.id));
        if (isLoaded) {
            isSettled.current = true;
        }
    });

    function shouldAnimate(message: ChatThread['messages'][number], index: number) {
        if (!isSettled.current || index <= lastSeenIndex || seenIds.current.has(message.id)) {
            return false;
        }
        // A sent message swaps its temporary id for the saved one; it already animated as pending.
        return message.senderId !== 'me' || isPendingMessage(message);
    }

    return (
        <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messages}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
                // Follow new messages to the bottom, but don't jump when older pages load above.
                if (lastMessageId && lastMessageId !== scrolledToId.current) {
                    scrollRef.current?.scrollToEnd({ animated: scrolledToId.current !== undefined });
                    scrolledToId.current = lastMessageId;
                }
            }}>
            {hasMoreMessages ? (
                <Button
                    label={isLoadingEarlier ? 'Loading' : 'Earlier messages'}
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    loading={isLoadingEarlier}
                    onPress={onLoadEarlier}
                    style={styles.loadEarlier}
                />
            ) : null}
            {thread.messages.length > 0 ? (
                thread.messages.map((message, index) => {
                    const isMine = message.senderId === 'me';

                    return (
                        <Animated.View
                            key={message.id}
                            entering={shouldAnimate(message, index) ? FadeInDown.springify().damping(18).stiffness(220) : undefined}
                            style={[styles.messageRow, isMine && styles.messageRowMine]}>
                            {!isMine ? <Avatar uri={thread.avatarUrl} name={thread.name} size={28} /> : null}
                            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                                <AppText variant="callout" color={isMine ? colors.onAccent : colors.text}>
                                    {message.text}
                                </AppText>
                                {isMine ? (
                                    <AppText variant="caption" color={colors.onAccent} style={styles.statusText}>
                                        {message.seenAt ? 'Seen' : 'Sent'}
                                    </AppText>
                                ) : null}
                            </View>
                        </Animated.View>
                    );
                })
            ) : (
                <EmptyState
                    icon="chatbubble-ellipses-outline"
                    title="Start the conversation"
                    message={`Your charts brought you here. Say hello to ${thread.name}.`}
                />
            )}
        </ScrollView>
    );
}

function ScoreTab({ profile }: { profile: MatchProfile }) {
    const { profile: viewer } = useAppData();
    if (!profile.compatibility) return <EmptyState title="Compatibility unavailable" message="A calculated report is not available for this match." />;
    const rows = buildScoreRows(profile);
    const summary = getMatchReport(profile.compatibility) ??
        profile.compatibility?.summary ??
        '';
    const yogas = profile.compatibility?.yogas ?? [];
    const doshas = profile.compatibility?.doshas ?? [];

    return (
        <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            <CompatibilityHero
                score={profile.compatibility.overallScore}
                viewerName={viewer.name}
                viewerPhotoUri={viewer.photoUris[0]}
                partnerName={profile.name}
                partnerPhotoUri={profile.photos[0]}
            />
            <CompatibilityReport summary={summary} yogas={yogas} doshas={doshas} breakdown={rows} />
        </ScrollView>
    );
}

function ProfileTab({ profile }: { profile: MatchProfile }) {
    return (
        <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            <ProfileView profile={profile} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingTop: space.xs,
        paddingBottom: space.sm,
    },
    headerIdentity: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    headerText: {
        flex: 1,
    },
    tabs: {
        marginHorizontal: gutter,
        marginBottom: space.xs,
    },
    messages: {
        flexGrow: 1,
        paddingHorizontal: space.md,
        paddingVertical: space.md,
        gap: space.xs,
    },
    loadEarlier: {
        alignSelf: 'center',
    },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: space.xs,
        maxWidth: '82%',
    },
    messageRowMine: {
        alignSelf: 'flex-end',
    },
    bubble: {
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.lg,
        gap: 2,
        flexShrink: 1,
    },
    bubbleTheirs: {
        backgroundColor: colors.surfaceRaised,
        borderBottomLeftRadius: radius.xs / 2,
    },
    bubbleMine: {
        backgroundColor: colors.accent,
        borderBottomRightRadius: radius.xs / 2,
    },
    statusText: {
        alignSelf: 'flex-end',
        opacity: 0.7,
    },
    composerWrap: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: space.xs,
        paddingHorizontal: space.md,
        paddingTop: space.xs,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.backgroundDeep,
    },
    composer: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        paddingHorizontal: space.md,
        paddingTop: 11,
        paddingBottom: 11,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSunken,
        color: colors.text,
        fontFamily: fontFamily.body,
        fontSize: 16,
        ...Platform.select({ web: { outlineWidth: 0 } }),
    },
    tabContent: {
        paddingHorizontal: gutter,
        paddingTop: space.sm,
        paddingBottom: space.xxl,
        gap: space.md,
    },
});
