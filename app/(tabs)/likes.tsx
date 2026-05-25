import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
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

import { type DiscoverProfile, type LikeItem } from '@/constants/mock-data';
import { useAppState } from '@/store/use-app-state';

type ScoreModalTab = 'score' | 'profile';

export default function LikesScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { consumeCredit, likes, profile, replyToLike, dismissLike } = useAppState();
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

    function updateReply(likeId: string, value: string) {
        setReplyDrafts((drafts) => ({
            ...drafts,
            [likeId]: value,
        }));
    }

    async function sendReply(likeId: string) {
        const reply = replyDrafts[likeId]?.trim();

        if (!reply) {
            return;
        }

        const chatId = await replyToLike(likeId, reply);
        setReplyDrafts((drafts) => {
            const nextDrafts = { ...drafts };
            delete nextDrafts[likeId];
            return nextDrafts;
        });
        router.push(chatId ? `/chat/${chatId}` : '/(tabs)/chats');
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.screen}>
            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    { paddingTop: Math.max(insets.top + 28, 58), paddingBottom: insets.bottom + 32 },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.eyebrow}>Incoming likes</Text>
                        <Text style={styles.title}>Likes You</Text>
                    </View>
                    <View style={styles.countBadge}>
                        <Ionicons name="heart" size={16} color="#FFFFFF" />
                        <Text style={styles.countText}>{likes.length}</Text>
                    </View>
                </View>

                {likes.length > 0 ? (
                    <View style={styles.list}>
                        {likes.map((like) => (
                            <LikeCard
                                key={like.id}
                                like={like}
                                reply={replyDrafts[like.id] ?? ''}
                                viewerName={profile.name}
                                viewerPhotoUri={profile.photoUris[0]}
                                onChangeReply={(value) => updateReply(like.id, value)}
                                onDismiss={() => dismissLike(like.id)}
                                onReply={() => sendReply(like.id)}
                                onViewScore={async () => {
                                    const consumed = await consumeCredit(`Generated score for ${like.fromName}`);
                                    if (!consumed) {
                                        Alert.alert('Credits needed', 'Add credits or upgrade to generate match scores.');
                                    }
                                    return consumed;
                                }}
                            />
                        ))}
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Ionicons name="heart-outline" size={30} color="#8D7F74" />
                        </View>
                        <Text style={styles.emptyTitle}>No pending likes</Text>
                        <Text style={styles.emptyText}>
                            New likes with opening messages will appear here before they move to Chats.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function LikeCard({
    like,
    reply,
    viewerName,
    viewerPhotoUri,
    onChangeReply,
    onDismiss,
    onReply,
    onViewScore,
}: {
    like: LikeItem;
    reply: string;
    viewerName: string;
    viewerPhotoUri?: string;
    onChangeReply: (value: string) => void;
    onDismiss: () => void;
    onReply: () => void;
    onViewScore: () => Promise<boolean>;
}) {
    const [isScoreOpen, setIsScoreOpen] = useState(false);

    return (
        <View style={styles.card}>
            <View style={styles.identityRow}>
                <Image source={{ uri: like.avatarUrl }} style={styles.avatar} />
                <View style={styles.identityText}>
                    <Text style={styles.name}>
                        {like.fromName}, {like.age}
                    </Text>
                    <Text style={styles.meta}>
                        {like.location} • {like.timeAgo}
                    </Text>
                </View>
                <Pressable
                    accessibilityLabel={`View Kundali score with ${like.fromName}`}
                    hitSlop={10}
                    onPress={async () => {
                        const canViewScore = await onViewScore();
                        if (canViewScore) {
                            setIsScoreOpen(true);
                        }
                    }}
                    style={({ pressed }) => [styles.scorePill, pressed && styles.pressed]}>
                    <Ionicons name="sparkles" size={14} color="#F0A000" />
                    <Text style={styles.scorePillText}>Score</Text>
                </Pressable>
            </View>

            <View style={styles.messageRow}>
                <View style={styles.messageBubble}>
                    <Text style={styles.messageText}>{like.openingMessage}</Text>
                </View>
            </View>

            <Modal
                animationType="fade"
                visible={isScoreOpen}
                onRequestClose={() => setIsScoreOpen(false)}>
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
                    viewerName={viewerName}
                    viewerPhotoUri={viewerPhotoUri}
                />
            </Modal>
        </View>
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
}) {
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<ScoreModalTab>('score');
    const safeViewerName = viewerName === 'New User' ? 'You' : viewerName;
    const fallbackViewerPhoto =
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=85';
    const discoverProfile = useAppState((state) =>
        state.discoverProfiles.find((profile) => profile.id === like.fromProfileId || profile.name === like.fromName)
    );
    const profile = buildLikeProfile(like, discoverProfile);
    const scores = like.compatibility.breakdown ?? [
        { label: 'Guna Milan', value: 84 },
        { label: 'Nadi Compatibility', value: 74 },
        { label: 'Bhakoot/Rashi Matching', value: 86 },
        { label: 'Overall Match', value: 80 },
    ];
    const overallScore = like.compatibility.overallScore ?? 80;
    const summary =
        like.compatibility.summary ??
        `${safeViewerName} and ${likedName}'s charts show a balanced opening for conversation and steady emotional rhythm.`;
    const yogas = like.compatibility.yogas ?? ['Hamsa', 'Dhan'];
    const doshas = like.compatibility.doshas ?? ['Kendrum'];
    const [isReplyComposerOpen, setIsReplyComposerOpen] = useState(false);
    const canReply = reply.trim().length > 0;
    const canPressReply = !isReplyComposerOpen || canReply;

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
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.scoreScreen, { paddingTop: Math.max(insets.top + 18, 40) }]}>
            <Pressable
                accessibilityLabel="Close Kundali score"
                hitSlop={12}
                onPress={onClose}
                style={({ pressed }) => [styles.scoreCloseButton, pressed && styles.pressed]}>
                <Ionicons name="close" size={23} color="#312A24" />
            </Pressable>

            <ScrollView
                style={styles.scoreScroll}
                contentContainerStyle={styles.scoreContent}
                showsVerticalScrollIndicator={false}>
                <View style={styles.modalTabs}>
                    <ScoreModalTabButton activeTab={activeTab} label="Score" tab="score" onPress={setActiveTab} />
                    <ScoreModalTabButton activeTab={activeTab} label="Profile" tab="profile" onPress={setActiveTab} />
                </View>

                {activeTab === 'score' ? (
                    <>
                        <View style={styles.scoreHeader}>
                            <ProfileOrb uri={viewerPhotoUri ?? fallbackViewerPhoto} color="#FCB200" />
                            <Ionicons name="close" size={34} color="#F2A600" />
                            <ProfileOrb uri={likedPhotoUri} color="#FF3F45" />
                        </View>

                        <View style={styles.matchBadge}>
                            <Text style={styles.matchPercent}>{overallScore}%</Text>
                            <Text style={styles.matchLabel}>Astro Match</Text>
                        </View>

                        <View style={styles.analysisCard}>
                            <View style={styles.analysisHeader}>
                                <View style={styles.sparkleBadge}>
                                    <Ionicons name="sparkles" size={23} color="#FFFFFF" />
                                </View>
                                <View style={styles.analysisCopy}>
                                    <Text style={styles.analysisTitle}>Kundli Match Analysis ✦</Text>
                                    <Text style={styles.analysisText}>{summary}</Text>
                                </View>
                            </View>

                            <Text style={styles.groupTitle}>Yogas</Text>
                            <View style={styles.chipRow}>
                                {yogas.map((item) => (
                                    <AstroChip key={item} icon="flower-outline" label={item} color="#F4AA00" />
                                ))}
                            </View>

                            <Text style={[styles.groupTitle, styles.doshaTitle]}>Doshas</Text>
                            <View style={styles.chipRow}>
                                {doshas.map((item) => (
                                    <AstroChip key={item} icon="moon-outline" label={item} color="#FF4D58" />
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
                    </>
                ) : (
                    <LikeProfileTab profile={profile} />
                )}
            </ScrollView>

            <View style={[styles.scoreActions, { marginBottom: Math.max(insets.bottom + 18, 28) }]}>
                {isReplyComposerOpen ? (
                    <View style={styles.scoreReplyBox}>
                        <Text style={styles.scoreReplyLabel}>{likedName}&apos;s opening message</Text>
                        <View style={styles.scoreOpeningMessage}>
                            <Text style={styles.scoreOpeningText}>{openingMessage}</Text>
                        </View>
                        <TextInput
                            multiline
                            onChangeText={onChangeReply}
                            placeholder={`Reply to ${likedName}`}
                            placeholderTextColor="#9B9189"
                            style={styles.scoreReplyInput}
                            textAlignVertical="top"
                            value={reply}
                        />
                    </View>
                ) : null}
                <View style={styles.scoreActionButtons}>
                    <Pressable
                        accessibilityLabel={`Dismiss ${likedName}`}
                        onPress={onDismiss}
                        style={({ pressed }) => [styles.scoreDismissButton, pressed && styles.pressed]}>
                        <Ionicons name="close" size={19} color="#5B174F" />
                        <Text style={styles.scoreDismissText}>Dismiss</Text>
                    </Pressable>
                    <Pressable
                        accessibilityLabel={`Reply to ${likedName}`}
                        disabled={!canPressReply}
                        onPress={handleReplyPress}
                        style={({ pressed }) => [
                            styles.scoreReplyButton,
                            !canPressReply && styles.replyButtonDisabled,
                            pressed && canPressReply && styles.replyButtonPressed,
                        ]}>
                        <Text style={styles.scoreReplyText}>{isReplyComposerOpen ? 'Send Reply' : 'Reply'}</Text>
                        <Ionicons name="chatbubble-ellipses" size={18} color="#FFFFFF" />
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

function buildLikeProfile(like: LikeItem, discoverProfile?: DiscoverProfile) {
    if (discoverProfile) {
        return {
            name: discoverProfile.name,
            age: discoverProfile.age,
            location: discoverProfile.location,
            bio: discoverProfile.bio,
            photos: discoverProfile.photos,
            details: discoverProfile.details,
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

function ScoreModalTabButton({
    activeTab,
    label,
    onPress,
    tab,
}: {
    activeTab: ScoreModalTab;
    label: string;
    onPress: (tab: ScoreModalTab) => void;
    tab: ScoreModalTab;
}) {
    const isActive = activeTab === tab;

    return (
        <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onPress(tab)}
            style={isActive ? styles.modalTabActive : styles.modalTab}>
            <Text style={isActive ? styles.modalTabTextActive : styles.modalTabText}>{label}</Text>
        </Pressable>
    );
}

function LikeProfileTab({ profile }: { profile: ReturnType<typeof buildLikeProfile> }) {
    const [heroPhoto, ...morePhotos] = profile.photos;

    return (
        <View style={styles.profileTabContent}>
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
                    {profile.name}, {profile.age}
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
        </View>
    );
}

function ProfileOrb({ uri, color }: { uri: string; color: string }) {
    return (
        <View style={[styles.profileOrb, { borderColor: color }]}>
            <Image source={{ uri }} style={styles.profileOrbImage} />
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

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    content: {
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
        padding: 16
    },
    eyebrow: {
        color: '#8A7B70',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.4,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    title: {
        color: '#171412',
        fontSize: 30,
        fontWeight: '800',
        letterSpacing: 0,
        lineHeight: 36,
    },
    countBadge: {
        alignItems: 'center',
        backgroundColor: '#2D241E',
        borderRadius: 18,
        flexDirection: 'row',
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 12,
    },
    countText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
    list: {
        gap: 0,
    },
    card: {
        backgroundColor: '#ffffff00',
        borderColor: '#eaeaea',
        borderBottomWidth: 1,
        padding: 16,
    },
    identityRow: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    avatar: {
        backgroundColor: '#EFEAE5',
        borderRadius: 31,
        height: 62,
        marginRight: 14,
        width: 62,
    },
    identityText: {
        flex: 1,
        minWidth: 0,
    },
    name: {
        color: '#24201D',
        fontSize: 19,
        fontWeight: '800',
        letterSpacing: 0,
        marginBottom: 4,
    },
    meta: {
        color: '#7A7068',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0,
    },
    scorePill: {
        alignItems: 'center',
        borderColor: '#F4C96D',
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 5,
        minHeight: 32,
        paddingHorizontal: 10,
        flexShrink: 0,
    },
    scorePillText: {
        color: '#F0A000',
        fontSize: 12,
        fontWeight: '900',
    },
    messageRow: {
        alignSelf: 'flex-start',
        alignItems: 'flex-end',
        flexDirection: 'row',
        marginLeft: 40,
        marginTop: 10,
        maxWidth: '82%',
    },
    messageBubble: {
        backgroundColor: '#F7F4F0',
        borderRadius: 16,
        borderTopLeftRadius: 3,
        flexShrink: 1,
        paddingHorizontal: 14,
        paddingVertical: 13,
    },
    messageText: {
        color: '#27221E',
        fontSize: 15,
        fontWeight: '600',
        letterSpacing: 0,
        lineHeight: 22,
    },
    replyButtonDisabled: {
        backgroundColor: '#C9BFB6',
    },
    replyButtonPressed: {
        opacity: 0.78,
        transform: [{ scale: 0.98 }],
    },
    pressed: {
        opacity: 0.65,
    },
    emptyState: {
        alignItems: 'center',
        borderColor: '#EEE5DA',
        borderRadius: 8,
        borderWidth: 1,
        marginTop: 42,
        paddingHorizontal: 24,
        paddingVertical: 34,
    },
    emptyIcon: {
        alignItems: 'center',
        backgroundColor: '#F5F1EC',
        borderRadius: 28,
        height: 56,
        justifyContent: 'center',
        marginBottom: 16,
        width: 56,
    },
    emptyTitle: {
        color: '#27221E',
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 8,
    },
    emptyText: {
        color: '#6D6259',
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 20,
        textAlign: 'center',
    },
    scoreScreen: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 24,
    },
    scoreCloseButton: {
        position: 'absolute',
        right: 18,
        top: 18,
        zIndex: 2,
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8F5F1',
    },
    modalTabs: {
        borderBottomColor: '#ECE8E4',
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        height: 46,
        marginBottom: 24,
        paddingRight: 48,
    },
    modalTabActive: {
        alignItems: 'center',
        borderBottomColor: '#171412',
        borderBottomWidth: 2,
        flex: 1,
        justifyContent: 'center',
    },
    modalTab: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    modalTabTextActive: {
        color: '#171412',
        fontSize: 14,
        fontWeight: '700',
    },
    modalTabText: {
        color: '#8C8580',
        fontSize: 14,
        fontWeight: '600',
    },
    scoreScroll: {
        flex: 1,
    },
    scoreContent: {
        paddingBottom: 22,
    },
    scoreHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 34,
        justifyContent: 'center',
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
        alignItems: 'center',
        alignSelf: 'center',
        borderBottomColor: '#FF4245',
        borderLeftColor: '#F4B000',
        borderRadius: 42,
        borderRightColor: '#FF4245',
        borderTopColor: '#F4B000',
        borderWidth: 5,
        marginBottom: 28,
        minWidth: 210,
        paddingHorizontal: 36,
        paddingVertical: 20,
    },
    matchPercent: {
        color: '#F4AA00',
        fontSize: 48,
        fontWeight: '900',
        letterSpacing: 0,
        lineHeight: 54,
    },
    matchLabel: {
        color: '#2D2926',
        fontSize: 18,
        fontWeight: '800',
        lineHeight: 23,
    },
    analysisCard: {
        backgroundColor: '#FFFFFF',
        borderColor: '#F3D99A',
        borderRadius: 22,
        borderWidth: 1,
        padding: 22,
    },
    analysisHeader: {
        alignItems: 'flex-start',
        flexDirection: 'row',
        gap: 14,
        marginBottom: 24,
    },
    sparkleBadge: {
        alignItems: 'center',
        backgroundColor: '#F8BE1C',
        borderRadius: 24,
        height: 48,
        justifyContent: 'center',
        width: 48,
    },
    analysisCopy: {
        flex: 1,
        minWidth: 0,
    },
    analysisTitle: {
        color: '#27211E',
        fontSize: 18,
        fontWeight: '900',
        lineHeight: 23,
        marginBottom: 5,
    },
    analysisText: {
        color: '#302B27',
        fontSize: 15,
        fontWeight: '500',
        lineHeight: 22,
    },
    moreText: {
        color: '#F0A000',
    },
    groupTitle: {
        color: '#F0A000',
        fontSize: 17,
        fontWeight: '900',
        lineHeight: 22,
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
        alignItems: 'center',
        borderRadius: 22,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 12,
    },
    astroChipText: {
        fontSize: 15,
        fontWeight: '700',
    },
    divider: {
        backgroundColor: '#EEE9E3',
        height: 1,
        marginBottom: 18,
        marginTop: 24,
    },
    scoreTitle: {
        color: '#F0A000',
        fontSize: 18,
        fontWeight: '900',
        lineHeight: 23,
        marginBottom: 12,
    },
    scoreRow: {
        marginBottom: 13,
    },
    scoreRowHeader: {
        flexDirection: 'row',
        gap: 14,
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    scoreLabel: {
        color: '#161311',
        fontSize: 15,
        fontWeight: '800',
        lineHeight: 20,
    },
    scoreValue: {
        color: '#161311',
        fontSize: 15,
        fontWeight: '700',
        lineHeight: 20,
    },
    scoreTrack: {
        backgroundColor: '#E5E5EA',
        borderRadius: 3,
        height: 5,
        overflow: 'hidden',
    },
    scoreFill: {
        backgroundColor: '#F7B500',
        borderLeftColor: '#FF421D',
        borderLeftWidth: 5,
        borderRadius: 3,
        height: '100%',
    },
    scoreReplyBox: {
        alignSelf: 'stretch',
        paddingHorizontal: 8,
        paddingTop: 8,
    },
    scoreReplyLabel: {
        color: '#5C5149',
        fontSize: 13,
        fontWeight: '800',
        lineHeight: 18,
        marginBottom: 10,
    },
    scoreOpeningMessage: {
        backgroundColor: '#F7F4F0',
        borderLeftColor: '#FFD11B',
        borderLeftWidth: 3,
        borderRadius: 12,
        marginBottom: 12,
        paddingHorizontal: 13,
        paddingVertical: 12,
    },
    scoreOpeningText: {
        color: '#27221E',
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 20,
    },
    scoreReplyInput: {
        backgroundColor: '#FFFCF8',
        borderColor: '#E7DED4',
        borderRadius: 14,
        borderWidth: 1,
        color: '#211D1A',
        fontSize: 15,
        lineHeight: 21,
        minHeight: 88,
        paddingHorizontal: 14,
        paddingTop: 12,
    },
    profileTabContent: {
        paddingBottom: 10,
    },
    profileHero: {
        backgroundColor: '#2D241E',
        borderRadius: 18,
        height: 340,
        overflow: 'hidden',
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
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        marginHorizontal: 10,
        marginTop: -28,
        paddingHorizontal: 16,
        paddingTop: 26,
    },
    profileName: {
        color: '#171412',
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: 0,
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
        marginTop: 18,
        overflow: 'hidden',
        width: '100%',
    },
    scoreActions: {
        alignItems: 'stretch',
        backgroundColor: '#FFFFFF',
        borderRadius: 31,
        elevation: 7,
        gap: 10,
        minHeight: 62,
        paddingHorizontal: 7,
        paddingVertical: 7,
        shadowColor: '#2D241E',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
    },
    scoreActionButtons: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 10,
        minHeight: 50,
    },
    scoreDismissButton: {
        alignItems: 'center',
        backgroundColor: '#F8F5F1',
        borderRadius: 25,
        flex: 1,
        flexDirection: 'row',
        gap: 7,
        height: 50,
        justifyContent: 'center',
    },
    scoreDismissText: {
        color: '#5B174F',
        fontSize: 15,
        fontWeight: '900',
    },
    scoreReplyButton: {
        alignItems: 'center',
        backgroundColor: '#FF413C',
        borderRadius: 25,
        flex: 1,
        flexDirection: 'row',
        gap: 8,
        height: 50,
        justifyContent: 'center',
    },
    scoreReplyText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '900',
    },
});
