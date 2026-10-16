import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Children, Fragment, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { SwitchRow } from '@/components/ui/app-switch';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors, gutter, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { openLegalDocument } from '@/lib/legal';
import { AnimatedPressable } from '@/lib/motion';

export default function SettingsScreen() {
  const {
    isServiceBusy,
    logout,
    notifications,
    privacy,
    profile,
    serviceError,
    subscription,
    updateNotifications,
    updatePrivacy,
  } = useAppData();

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/welcome');
  }

  function confirmLogout() {
    Alert.alert('Log out?', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: handleLogout },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.accountCard}>
          <Avatar uri={profile.photoUris[0]} name={profile.name} size={52} />
          <View style={styles.accountCopy}>
            <AppText variant="headline">{profile.name}</AppText>
            <AppText variant="footnote" color={colors.textMuted}>
              {profile.phoneNumber || profile.email || 'Kundali Konnect account'}
            </AppText>
          </View>
        </Card>

        {serviceError ? (
          <AppText variant="footnote" color={colors.danger}>
            {serviceError}
          </AppText>
        ) : null}

        <SettingsSection title="Notifications">
          <SwitchRow
            label="Likes"
            value={notifications.likes}
            onValueChange={(value) => updateNotifications({ likes: value })}
          />
          <SwitchRow
            label="Matches"
            value={notifications.matches}
            onValueChange={(value) => updateNotifications({ matches: value })}
          />
          <SwitchRow
            label="Messages"
            value={notifications.messages}
            onValueChange={(value) => updateNotifications({ messages: value })}
          />
          <SwitchRow
            label="Astrology reports"
            description="Occasional insights about your chart"
            value={notifications.astrologyReports}
            onValueChange={(value) => updateNotifications({ astrologyReports: value })}
          />
        </SettingsSection>

        <SettingsSection title="Privacy">
          <SwitchRow
            label="Show distance"
            value={privacy.showDistance}
            onValueChange={(value) => updatePrivacy({ showDistance: value })}
          />
          <SwitchRow
            label="Show online status"
            value={privacy.showOnlineStatus}
            onValueChange={(value) => updatePrivacy({ showOnlineStatus: value })}
          />
          <SwitchRow
            label="Discoverable profile"
            description="Turn off to pause appearing in Discover"
            value={privacy.profileDiscoverable}
            onValueChange={(value) => updatePrivacy({ profileDiscoverable: value })}
          />
        </SettingsSection>

        <SettingsSection title="Billing">
          <LinkRow onPress={() => router.push('/subscriptions')} accessibilityLabel="Subscription">
            <View style={styles.linkIcon}>
              <Ionicons name="diamond-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.accountCopy}>
              <AppText variant="subhead">Subscription</AppText>
              <AppText variant="footnote" color={colors.textMuted}>
                {subscription.status === 'active' ? `Active until ${subscription.renewalDate}` : 'Free plan'}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </LinkRow>
        </SettingsSection>

        <SettingsSection title="Safety & account">
          <LinkRow onPress={() => router.push('/blocked-users')} accessibilityLabel="Blocked people">
            <View style={styles.linkIcon}>
              <Ionicons name="ban-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.accountCopy}>
              <AppText variant="subhead">Blocked people</AppText>
              <AppText variant="footnote" color={colors.textMuted}>
                See and unblock people you’ve blocked
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </LinkRow>
          <LinkRow onPress={() => router.push('/delete-account')} accessibilityLabel="Delete account">
            <View style={[styles.linkIcon, styles.linkIconDanger]}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </View>
            <View style={styles.accountCopy}>
              <AppText variant="subhead" color={colors.danger}>
                Delete account
              </AppText>
              <AppText variant="footnote" color={colors.textMuted}>
                Permanently remove your profile and data
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </LinkRow>
        </SettingsSection>

        <SettingsSection title="Legal">
          <LinkRow onPress={() => void openLegalDocument('terms')} accessibilityLabel="Terms of Service">
            <View style={styles.linkIcon}>
              <Ionicons name="document-text-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.accountCopy}>
              <AppText variant="subhead">Terms of Service</AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </LinkRow>
          <LinkRow onPress={() => void openLegalDocument('privacy')} accessibilityLabel="Privacy Policy">
            <View style={styles.linkIcon}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.accountCopy}>
              <AppText variant="subhead">Privacy Policy</AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </LinkRow>
        </SettingsSection>

        <Button
          label="Log out"
          variant="danger"
          icon="log-out-outline"
          loading={isServiceBusy}
          onPress={confirmLogout}
          style={styles.logout}
        />
      </ScrollView>
    </Screen>
  );
}

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  const rows = Children.toArray(children);

  return (
    <View style={styles.section}>
      <AppText variant="overline" color={colors.textMuted} style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={styles.sectionCard}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** Navigation row inside a settings card: subtle press spring, no haptic (it only navigates). */
function LinkRow({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress: () => void; accessibilityLabel: string }) {
  const { animatedStyle, pressHandlers } = usePressAnimation({
    pressedScale: 0.98,
    backgroundColor: 'rgba(33, 27, 64, 0)',
    pressedBackgroundColor: colors.surfaceRaised,
    haptic: false,
    onPress,
  });

  return (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[styles.linkRow, animatedStyle]} {...pressHandlers}>
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter,
    paddingTop: space.md,
    paddingBottom: space.huge,
    gap: space.lg,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  accountCopy: {
    flex: 1,
    gap: 2,
  },
  section: {
    gap: space.xs,
  },
  sectionTitle: {
    paddingHorizontal: space.xxs,
  },
  sectionCard: {
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  linkRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    // Lets the pressed highlight extend slightly past the content without shifting it.
    marginHorizontal: -space.xs,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
  },
  linkIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  linkIconDanger: {
    backgroundColor: colors.dangerSoft,
  },
  logout: {
    marginTop: space.sm,
  },
});
