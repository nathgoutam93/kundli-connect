import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { type ComponentProps } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ProfileView } from '@/components/profile-view';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { colors, gutter, radius, space } from '@/constants/theme';
import { LoadErrorNotice } from '@/components/load-error-notice';
import { useOwnPublicProfileQuery } from '@/hooks/use-domain-data';
import { useAppData } from '@/hooks/use-app-data';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { AnimatedPressable } from '@/lib/motion';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function ProfileScreen() {
    const { creditsBalance, profile, subscription } = useAppData();
    const preview = useOwnPublicProfileQuery();
    const displayName = profile.name || 'New User';
    const isPremium = subscription.status === 'active';

    return (
        <Screen starSeed={15}>
            <View style={styles.header}>
                <AppText variant="title2">Profile</AppText>
                <IconButton
                    icon="settings-outline"
                    accessibilityLabel="Open settings"
                    size={40}
                    onPress={() => router.push('/settings')}
                />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Card style={styles.summary}>
                    <Avatar uri={profile.photoUris[0]} name={displayName} size={88} ring={colors.accent} />
                    <View style={styles.summaryText}>
                        <AppText variant="title2" align="center">
                            {displayName}
                            {profile.age ? `, ${profile.age}` : ''}
                        </AppText>
                        <AppText variant="subhead" color={colors.textMuted} align="center">
                            {profile.location || 'Location not added'}
                        </AppText>
                    </View>
                    <Button
                        label="Edit profile"
                        variant="secondary"
                        size="md"
                        icon="create-outline"
                        fullWidth={false}
                        onPress={() => router.push('/edit-profile')}
                    />
                </Card>

                <View style={styles.tiles}>
                    <QuickTile
                        icon="planet-outline"
                        title="My Kundli"
                        caption="Chart & details"
                        href="/kundli"
                    />
                    <QuickTile
                        icon={isPremium ? 'diamond' : 'flash'}
                        title={isPremium ? 'Premium' : `${creditsBalance} credits`}
                        caption={isPremium ? 'Manage plan' : 'Get more'}
                        href="/subscriptions"
                        highlight
                    />
                </View>

                <View style={styles.previewHeader}>
                    <AppText variant="overline" color={colors.textMuted}>
                        How others see you
                    </AppText>
                </View>
                {preview.isError ? <LoadErrorNotice subject="your public profile" onRetry={preview.refetch} /> : null}
                {preview.data ? <ProfileView profile={preview.data} /> : preview.isPending ? (
                    <AppText color={colors.textMuted}>Loading your public profile…</AppText>
                ) : null}
            </ScrollView>
        </Screen>
    );
}

function QuickTile({
    icon,
    title,
    caption,
    href,
    highlight = false,
}: {
    icon: IconName;
    title: string;
    caption: string;
    href: Href;
    highlight?: boolean;
}) {
    const { animatedStyle, pressHandlers } = usePressAnimation({
        pressedScale: 0.98,
        backgroundColor: colors.surface,
        pressedBackgroundColor: colors.surfaceRaised,
        haptic: false,
        onPress: () => router.push(href),
    });

    return (
        <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${caption}`}
            style={[styles.tile, highlight && styles.tileHighlight, animatedStyle]}
            {...pressHandlers}>
            <View style={[styles.tileIcon, highlight && styles.tileIconHighlight]}>
                <Ionicons name={icon} size={20} color={highlight ? colors.onAccent : colors.accent} />
            </View>
            <View style={styles.tileText}>
                <AppText variant="headline">{title}</AppText>
                <AppText variant="footnote" color={colors.textMuted}>
                    {caption}
                </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </AnimatedPressable>
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
    content: {
        paddingHorizontal: space.md,
        paddingBottom: space.xxl,
        gap: space.md,
    },
    summary: {
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.xl,
    },
    summaryText: {
        gap: 2,
    },
    tiles: {
        gap: space.sm,
    },
    tile: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    tileHighlight: {
        borderColor: colors.accentLine,
    },
    tileIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentSoft,
    },
    tileIconHighlight: {
        backgroundColor: colors.accent,
    },
    tileText: {
        flex: 1,
        gap: 2,
    },
    previewHeader: {
        paddingHorizontal: space.xxs,
        paddingTop: space.md,
    },
});
