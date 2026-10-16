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
import { type UserProfile } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { AnimatedPressable } from '@/lib/motion';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function ProfileScreen() {
    const { creditsBalance, profile, subscription } = useAppData();
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
                <ProfileView
                    profile={{
                        name: displayName,
                        age: profile.age,
                        location: profile.location,
                        bio: profile.bio,
                        photos: profile.photoUris ?? [],
                        details: buildProfileDetails(profile),
                    }}
                />
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
