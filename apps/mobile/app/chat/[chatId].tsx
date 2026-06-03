import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    Image,
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

import { type ChatPreview, type CompatibilityResult, type DiscoverProfile, type LikeItem } from '@/constants/mock-data';
import { useAppState } from '@/store/use-app-state';

type ActiveTab = 'chat' | 'score' | 'profile';

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
    compatibilityScore: number;
    compatibility?: CompatibilityResult;
};

function buildThreadFromPreview(chatId: string, chat?: ChatPreview): ChatThread {
    if (!chat) {
        return {
            id: chatId,
            name: 'Match',
            avatarUrl:
                'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=180&q=80',
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
        messages: chat.messages,
    };
}

function buildMatchProfile(
    chat: ChatPreview | undefined,
    discoverProfiles: DiscoverProfile[],
    likes: LikeItem[]
): MatchProfile {
    const discoverProfile = discoverProfiles.find(
        (profile) => profile.id === chat?.participantId || profile.name === chat?.name
    );
    const like = likes.find((item) => item.fromProfileId === chat?.participantId || item.fromName === chat?.name);
    const chatCompatibility = chat?.compatibility;

    if (discoverProfile) {
        return {
            name: discoverProfile.name,
            age: discoverProfile.age,
            location: discoverProfile.location,
            bio: discoverProfile.bio,
            photos: discoverProfile.photos,
            details: discoverProfile.details,
            compatibilityScore: chatCompatibility?.overallScore ?? discoverProfile.compatibility.overallScore,
            compatibility: chatCompatibility ?? discoverProfile.compatibility,
        };
    }

    if (like) {
        return {
            name: like.fromName,
            age: like.age,
            location: like.location,
            bio: like.openingMessage,
            photos: [like.avatarUrl],
            details: [
                { label: 'location', icon: 'home-outline', text: like.location },
                { label: 'intent', icon: 'heart-outline', text: like.note },
            ],
            compatibilityScore: chatCompatibility?.overallScore ?? like.compatibility.overallScore,
            compatibility: chatCompatibility ?? like.compatibility,
        };
    }

    return {
        name: chat?.name ?? 'Match',
        location: 'Location not shared',
        bio: chat?.lastMessage ?? 'This profile is available from your match thread.',
        photos: chat?.avatarUrl ? [chat.avatarUrl] : [],
        details: [
            {
                label: 'compatibility',
                icon: 'sparkles-outline',
                text: `${chatCompatibility?.overallScore ?? chat?.compatibilityScore ?? 0}% Kundli match`,
            },
            { label: 'status', icon: 'chatbubble-ellipses-outline', text: 'Matched conversation' },
        ],
        compatibilityScore: chatCompatibility?.overallScore ?? chat?.compatibilityScore ?? 0,
        compatibility: chatCompatibility,
    };
}

function buildScoreRows(profile: MatchProfile) {
    if (profile.compatibility) {
        return profile.compatibility.breakdown;
    }

    const score = profile.compatibilityScore;
    return [
        { label: 'Guna Milan', value: Math.min(score + 8, 96) },
        { label: 'Nadi Compatibility', value: Math.max(score - 10, 58) },
        { label: 'Bhakoot/Rashi Matching', value: Math.min(score + 3, 94) },
        { label: 'Overall Match', value: score },
    ];
}

export default function ChatThreadScreen() {
    const params = useLocalSearchParams<{ chatId: string | string[] }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const {
        chats,
        discoverProfiles,
        isServiceBusy,
        likes,
        loadEarlierChatMessages,
        markChatRead,
        refreshChats,
        sendChatMessage,
    } = useAppState();
    const chatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;
    const chat = chats.find((item) => item.id === chatId);

    const thread = useMemo(() => {
        if (!chatId) {
            return buildThreadFromPreview('missing-chat');
        }

        return buildThreadFromPreview(chatId, chat);
    }, [chat, chatId]);

    const matchProfile = useMemo(
        () => buildMatchProfile(chat, discoverProfiles, likes),
        [chat, discoverProfiles, likes]
    );

    useEffect(() => {
        if (chatId && !chat) {
            void refreshChats();
        }
    }, [chat, chatId, refreshChats]);

    useEffect(() => {
        if (chatId) {
            void markChatRead(chatId);
        }
    }, [chatId, markChatRead]);

    async function handleSend() {
        const text = draft.trim();
        if (!chatId || !text) {
            return;
        }

        setDraft('');
        await sendChatMessage(chatId, text);
    }

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.screen}>
                <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 20) }]}>
                    <Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={29} color="#1F1B18" />
                    </Pressable>
                    <Text style={styles.headerTitle}>{thread.name}</Text>
                    <Pressable
                        accessibilityLabel="Open chat actions"
                        hitSlop={12}
                        onPress={() => setIsMenuOpen(true)}>
                        <Ionicons name="ellipsis-horizontal" size={25} color="#1F1B18" />
                    </Pressable>
                </View>

                <View style={styles.tabs}>
                    <ThreadTab activeTab={activeTab} label="Chat" tab="chat" onPress={setActiveTab} />
                    <ThreadTab activeTab={activeTab} label="Score" tab="score" onPress={setActiveTab} />
                    <ThreadTab activeTab={activeTab} label="Profile" tab="profile" onPress={setActiveTab} />
                </View>

                {activeTab === 'chat' ? (
                    <ChatTab
                        isLoadingEarlier={isServiceBusy}
                        thread={thread}
                        hasMoreMessages={Boolean(chat?.hasMoreMessages)}
                        onLoadEarlier={() => (chatId ? loadEarlierChatMessages(chatId) : Promise.resolve())}
                    />
                ) : null}
                {activeTab === 'score' ? <ScoreTab profile={matchProfile} /> : null}
                {activeTab === 'profile' ? <ProfileTab profile={matchProfile} /> : null}

                {activeTab === 'chat' ? (
                    <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom + 8, 18) }]}>
                        <TextInput
                            placeholder="Send a message"
                            placeholderTextColor="#B4ACA6"
                            value={draft}
                            onChangeText={setDraft}
                            onSubmitEditing={handleSend}
                            style={styles.composer}
                        />
                        <Pressable accessibilityLabel="Send message" onPress={handleSend} style={styles.micButton}>
                            <Ionicons name={draft.trim() ? 'send' : 'mic'} size={22} color="#FFFFFF" />
                        </Pressable>
                    </View>
                ) : null}
            </KeyboardAvoidingView>

            <Modal transparent animationType="fade" visible={isMenuOpen} onRequestClose={() => setIsMenuOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setIsMenuOpen(false)}>
                    <View style={[styles.actionSheet, { paddingBottom: Math.max(insets.bottom + 10, 18) }]}>
                        <Pressable style={styles.actionItem}>
                            <Text style={styles.actionText}>We Met</Text>
                        </Pressable>
                        <Pressable style={styles.actionItem}>
                            <Text style={styles.actionText}>Hide</Text>
                        </Pressable>
                        <Pressable style={styles.actionItem}>
                            <Text style={styles.actionText}>Unmatch</Text>
                        </Pressable>
                        <Pressable style={styles.actionItem}>
                            <Text style={styles.reportText}>Report</Text>
                        </Pressable>
                        <Pressable style={styles.cancelItem} onPress={() => setIsMenuOpen(false)}>
                            <Text style={styles.actionText}>Cancel</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

function ThreadTab({
    activeTab,
    label,
    onPress,
    tab,
}: {
    activeTab: ActiveTab;
    label: string;
    onPress: (tab: ActiveTab) => void;
    tab: ActiveTab;
}) {
    const isActive = activeTab === tab;

    return (
        <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onPress(tab)}
            style={isActive ? styles.tabActive : styles.tab}>
            <Text style={isActive ? styles.tabTextActive : styles.tabText}>{label}</Text>
        </Pressable>
    );
}

function ChatTab({
    hasMoreMessages,
    isLoadingEarlier,
    onLoadEarlier,
    thread,
}: {
    hasMoreMessages: boolean;
    isLoadingEarlier: boolean;
    onLoadEarlier: () => Promise<void>;
    thread: ChatThread;
}) {
    return (
        <ScrollView
            contentContainerStyle={styles.messages}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {hasMoreMessages ? (
                <Pressable
                    accessibilityRole="button"
                    disabled={isLoadingEarlier}
                    onPress={onLoadEarlier}
                    style={({ pressed }: { pressed: boolean }) => [
                        styles.loadEarlierButton,
                        pressed && styles.loadEarlierPressed,
                        isLoadingEarlier && styles.loadEarlierDisabled,
                    ]}>
                    <Text style={styles.loadEarlierText}>{isLoadingEarlier ? 'Loading...' : 'Earlier messages'}</Text>
                </Pressable>
            ) : null}
            {thread.messages.length > 0 ? (
                thread.messages.map((message) => (
                    <View
                        key={message.id}
                        style={[styles.messageRow, message.senderId === 'me' && styles.messageRowMine]}>
                        {message.senderId !== 'me' ? <Image source={{ uri: thread.avatarUrl }} style={styles.messageAvatar} /> : null}
                        <View style={[styles.bubble, message.senderId === 'me' ? styles.bubbleMine : styles.bubbleTheirs]}>
                            <Text style={[styles.bubbleText, message.senderId === 'me' && styles.bubbleTextMine]}>
                                {message.text}
                            </Text>
                            {message.senderId === 'me' ? (
                                <Text style={styles.statusText}>{message.seenAt ? 'Seen' : 'Sent'}</Text>
                            ) : null}
                        </View>
                    </View>
                ))
            ) : (
                <View style={styles.emptyPanel}>
                    <Ionicons name="chatbubble-ellipses-outline" size={30} color="#8C8580" />
                    <Text style={styles.emptyTitle}>Start the conversation</Text>
                </View>
            )}
        </ScrollView>
    );
}

function ScoreTab({ profile }: { profile: MatchProfile }) {
    const rows = buildScoreRows(profile);
    const summary = profile.compatibility.raw.conclusion.match_report ??
        profile.compatibility?.summary ??
        'Your charts show a balanced opening for conversation, practical timing, and steady emotional rhythm.';
    const yogas = profile.compatibility?.yogas ?? ['Hamsa', 'Dhan'];
    const doshas = profile.compatibility?.doshas ?? ['Kendrum'];

    return (
        <ScrollView contentContainerStyle={styles.scoreContent} showsVerticalScrollIndicator={false}>
            <View style={styles.scoreHero}>
                <Image source={{ uri: profile.photos[0] }} style={styles.scoreAvatar} />
                <View style={styles.scoreRing}>
                    <Text style={styles.scorePercent}>{profile.compatibilityScore}%</Text>
                    <Text style={styles.scoreLabel}>Kundli Match</Text>
                </View>
            </View>

            <View style={styles.scoreCard}>
                <View style={styles.scoreCardHeader}>
                    <View style={styles.scoreIcon}>
                        <Ionicons name="sparkles" size={22} color="#FFFFFF" />
                    </View>
                    <View style={styles.scoreHeaderCopy}>
                        <Text style={styles.scoreTitle}>Match Analysis</Text>
                        <Text style={styles.scoreSummary}>{summary}</Text>
                    </View>
                </View>

                <Text style={styles.scoreGroupTitle}>Yogas</Text>
                <View style={styles.chipRow}>
                    {yogas.map((item) => (
                        <View key={item} style={styles.goldChip}>
                            <Text style={styles.goldChipText}>{item}</Text>
                        </View>
                    ))}
                </View>

                <Text style={[styles.scoreGroupTitle, styles.doshaTitle]}>Doshas</Text>
                <View style={styles.chipRow}>
                    {doshas.map((item) => (
                        <View key={item} style={styles.redChip}>
                            <Text style={styles.redChipText}>{item}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.scoreDivider} />
                {rows.map((row) => (
                    <View key={row.label} style={styles.scoreRow}>
                        <View style={styles.scoreRowHeader}>
                            <Text style={styles.scoreRowLabel}>{row.label}</Text>
                            <Text style={styles.scoreRowValue}>{row.value}%</Text>
                        </View>
                        <View style={styles.scoreTrack}>
                            <View style={[styles.scoreFill, { width: `${row.value}%` }]} />
                        </View>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

function ProfileTab({ profile }: { profile: MatchProfile }) {
    const [heroPhoto, ...morePhotos] = profile.photos;

    return (
        <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
            <View style={styles.profileHero}>
                {heroPhoto ? (
                    <Image source={{ uri: heroPhoto }} style={styles.profileHeroImage} />
                ) : (
                    <View style={styles.profileHeroPlaceholder}>
                        <Ionicons name="person" size={54} color="#FFFFFF" />
                    </View>
                )}
            </View>

            <View style={styles.profileCopy}>
                <Text style={styles.profileName}>
                    {profile.name}
                    {profile.age ? `, ${profile.age}` : ''}
                </Text>
                <Text style={styles.profileLocation}>{profile.location}</Text>
                <Text style={styles.profileBio}>{profile.bio}</Text>
            </View>

            {profile.details.length > 0 ? (
                <View style={styles.profileDetails}>
                    {profile.details.map((item) => (
                        <View key={item.label} style={styles.profileDetailRow}>
                            <Ionicons name={item.icon} size={22} color="#FCAD00" />
                            <Text style={styles.profileDetailText}>{item.text}</Text>
                        </View>
                    ))}
                </View>
            ) : null}

            {morePhotos.map((photo) => (
                <Image key={photo} source={{ uri: photo }} style={styles.profileInlinePhoto} />
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingBottom: 12,
        paddingHorizontal: 20,
    },
    headerTitle: {
        color: '#171412',
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: 0,
    },
    tabs: {
        borderBottomColor: '#ECE8E4',
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        height: 46,
    },
    tabActive: {
        alignItems: 'center',
        borderBottomColor: '#171412',
        borderBottomWidth: 2,
        flex: 1,
        justifyContent: 'center',
    },
    tab: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    tabTextActive: {
        color: '#171412',
        fontSize: 14,
        fontWeight: '700',
    },
    tabText: {
        color: '#8C8580',
        fontSize: 14,
        fontWeight: '600',
    },
    messages: {
        paddingHorizontal: 22,
        paddingTop: 46,
        paddingBottom: 28,
    },
    emptyPanel: {
        alignItems: 'center',
        borderColor: '#EEEAE6',
        borderRadius: 8,
        borderWidth: 1,
        marginTop: 20,
        paddingHorizontal: 20,
        paddingVertical: 28,
    },
    emptyTitle: {
        color: '#2A2521',
        fontSize: 16,
        fontWeight: '800',
        marginTop: 10,
    },
    loadEarlierButton: {
        alignItems: 'center',
        alignSelf: 'center',
        borderColor: '#E2DDD8',
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 18,
        minHeight: 38,
        paddingHorizontal: 16,
        paddingVertical: 9,
    },
    loadEarlierPressed: {
        opacity: 0.65,
    },
    loadEarlierDisabled: {
        opacity: 0.5,
    },
    loadEarlierText: {
        color: '#4A403A',
        fontSize: 13,
        fontWeight: '800',
    },
    messageRow: {
        alignItems: 'flex-end',
        flexDirection: 'row',
        marginTop: 12,
    },
    messageRowMine: {
        justifyContent: 'flex-end',
    },
    messageAvatar: {
        borderRadius: 19,
        height: 38,
        marginRight: 10,
        width: 38,
    },
    bubble: {
        borderRadius: 7,
        maxWidth: '82%',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    bubbleTheirs: {
        backgroundColor: '#F4F3F2',
    },
    bubbleMine: {
        backgroundColor: '#7D2B76',
        borderBottomRightRadius: 2,
    },
    bubbleText: {
        color: '#2A2521',
        fontSize: 17,
        letterSpacing: 0,
        lineHeight: 22,
    },
    bubbleTextMine: {
        color: '#FFFFFF',
    },
    statusText: {
        alignSelf: 'flex-end',
        color: 'rgba(255, 255, 255, 0.74)',
        fontSize: 11,
        fontWeight: '700',
        marginTop: 4,
    },
    scoreContent: {
        paddingHorizontal: 22,
        paddingTop: 24,
        paddingBottom: 34,
    },
    scoreHero: {
        alignItems: 'center',
        marginBottom: 20,
    },
    scoreAvatar: {
        backgroundColor: '#EFEAE5',
        borderColor: '#FFFFFF',
        borderRadius: 42,
        borderWidth: 3,
        height: 84,
        marginBottom: -16,
        width: 84,
        zIndex: 2,
    },
    scoreRing: {
        alignItems: 'center',
        borderBottomColor: '#FF4245',
        borderLeftColor: '#F4B000',
        borderRadius: 40,
        borderRightColor: '#FF4245',
        borderTopColor: '#F4B000',
        borderWidth: 4,
        minWidth: 190,
        paddingHorizontal: 30,
        paddingBottom: 18,
        paddingTop: 28,
    },
    scorePercent: {
        color: '#F4AA00',
        fontSize: 42,
        fontWeight: '900',
        lineHeight: 48,
    },
    scoreLabel: {
        color: '#2D2926',
        fontSize: 16,
        fontWeight: '800',
    },
    scoreCard: {
        borderColor: '#F3D99A',
        borderRadius: 18,
        borderWidth: 1,
        padding: 18,
    },
    scoreCardHeader: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    scoreIcon: {
        alignItems: 'center',
        backgroundColor: '#F8BE1C',
        borderRadius: 22,
        height: 44,
        justifyContent: 'center',
        width: 44,
    },
    scoreHeaderCopy: {
        flex: 1,
    },
    scoreTitle: {
        color: '#27211E',
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 5,
    },
    scoreSummary: {
        color: '#302B27',
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    scoreGroupTitle: {
        color: '#F0A000',
        fontSize: 15,
        fontWeight: '900',
        marginBottom: 10,
    },
    doshaTitle: {
        color: '#FF4D58',
        marginTop: 16,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    goldChip: {
        borderColor: '#F4AA00',
        borderRadius: 18,
        borderWidth: 1,
        paddingHorizontal: 11,
        paddingVertical: 8,
    },
    goldChipText: {
        color: '#F0A000',
        fontSize: 13,
        fontWeight: '800',
    },
    redChip: {
        borderColor: '#FF4D58',
        borderRadius: 18,
        borderWidth: 1,
        paddingHorizontal: 11,
        paddingVertical: 8,
    },
    redChipText: {
        color: '#FF4D58',
        fontSize: 13,
        fontWeight: '800',
    },
    scoreDivider: {
        backgroundColor: '#EEE9E3',
        height: 1,
        marginBottom: 18,
        marginTop: 22,
    },
    scoreRow: {
        marginBottom: 15,
    },
    scoreRowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 7,
    },
    scoreRowLabel: {
        color: '#2F2925',
        fontSize: 14,
        fontWeight: '800',
    },
    scoreRowValue: {
        color: '#F0A000',
        fontSize: 14,
        fontWeight: '900',
    },
    scoreTrack: {
        backgroundColor: '#F4EFE8',
        borderRadius: 4,
        height: 8,
        overflow: 'hidden',
    },
    scoreFill: {
        backgroundColor: '#F8BE1C',
        borderRadius: 4,
        height: '100%',
    },
    profileContent: {
        paddingBottom: 34,
    },
    profileHero: {
        backgroundColor: '#2D241E',
        height: 360,
    },
    profileHeroImage: {
        height: '100%',
        width: '100%',
    },
    profileHeroPlaceholder: {
        alignItems: 'center',
        backgroundColor: '#C9A35D',
        flex: 1,
        justifyContent: 'center',
    },
    profileCopy: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        marginTop: -30,
        paddingHorizontal: 26,
        paddingTop: 30,
    },
    profileName: {
        color: '#171412',
        fontSize: 30,
        fontWeight: '900',
        textAlign: 'center',
    },
    profileLocation: {
        color: '#8A7B70',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
        marginTop: 7,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    profileBio: {
        color: '#4B4540',
        fontSize: 16,
        lineHeight: 23,
        marginTop: 18,
        textAlign: 'center',
    },
    profileDetails: {
        borderColor: '#FFE08B',
        borderRadius: 18,
        borderWidth: 1,
        marginHorizontal: 26,
        marginTop: 20,
        overflow: 'hidden',
    },
    profileDetailRow: {
        alignItems: 'center',
        borderBottomColor: '#F5E2BA',
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: 14,
        minHeight: 50,
        paddingHorizontal: 16,
    },
    profileDetailText: {
        color: '#272320',
        flex: 1,
        fontSize: 15,
        lineHeight: 20,
    },
    profileInlinePhoto: {
        aspectRatio: 0.78,
        backgroundColor: '#EFEAE5',
        borderRadius: 18,
        marginHorizontal: 26,
        marginTop: 18,
        overflow: 'hidden',
        width: 'auto',
    },
    composerWrap: {
        alignItems: 'center',
        borderTopColor: '#F1EEEB',
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    composer: {
        borderColor: '#ECE8E5',
        borderRadius: 23,
        borderWidth: 1,
        color: '#171412',
        flex: 1,
        fontSize: 16,
        minHeight: 46,
        paddingHorizontal: 22,
    },
    micButton: {
        alignItems: 'center',
        backgroundColor: '#DDDAD7',
        borderRadius: 24,
        height: 48,
        justifyContent: 'center',
        width: 48,
    },
    modalOverlay: {
        backgroundColor: 'rgba(0, 0, 0, 0.36)',
        flex: 1,
        justifyContent: 'flex-end',
    },
    actionSheet: {
        paddingHorizontal: 18,
    },
    actionItem: {
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderBottomColor: '#E7E1DD',
        borderBottomWidth: StyleSheet.hairlineWidth,
        minHeight: 54,
        justifyContent: 'center',
    },
    actionText: {
        color: '#2A2521',
        fontSize: 16,
        fontWeight: '500',
    },
    reportText: {
        color: '#D45F55',
        fontSize: 16,
        fontWeight: '500',
    },
    cancelItem: {
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        justifyContent: 'center',
        marginTop: 8,
        minHeight: 54,
    },
});
