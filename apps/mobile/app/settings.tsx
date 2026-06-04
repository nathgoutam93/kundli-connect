import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '@/hooks/use-app-data';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top + 20, 42), paddingBottom: insets.bottom + 34 },
      ]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Account</Text>
          <Text style={styles.title}>Settings</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color="#2D241E" />
        </Pressable>
      </View>

      <View style={styles.accountCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile.name || 'K').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.meta}>{profile.phoneNumber || profile.email || 'KundaliKonnect account'}</Text>
        </View>
      </View>

      {serviceError ? <Text style={styles.errorText}>{serviceError}</Text> : null}

      <SettingsSection title="Notifications">
        <ToggleRow
          label="Likes"
          value={notifications.likes}
          onValueChange={(value) => updateNotifications({ likes: value })}
        />
        <ToggleRow
          label="Matches"
          value={notifications.matches}
          onValueChange={(value) => updateNotifications({ matches: value })}
        />
        <ToggleRow
          label="Messages"
          value={notifications.messages}
          onValueChange={(value) => updateNotifications({ messages: value })}
        />
        <ToggleRow
          label="Astrology reports"
          value={notifications.astrologyReports}
          onValueChange={(value) => updateNotifications({ astrologyReports: value })}
        />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <ToggleRow
          label="Show distance"
          value={privacy.showDistance}
          onValueChange={(value) => updatePrivacy({ showDistance: value })}
        />
        <ToggleRow
          label="Show online status"
          value={privacy.showOnlineStatus}
          onValueChange={(value) => updatePrivacy({ showOnlineStatus: value })}
        />
        <ToggleRow
          label="Discoverable profile"
          value={privacy.profileDiscoverable}
          onValueChange={(value) => updatePrivacy({ profileDiscoverable: value })}
        />
      </SettingsSection>

      <SettingsSection title="Billing">
        <Pressable style={styles.linkRow} onPress={() => router.push('/subscriptions')}>
          <View>
            <Text style={styles.linkTitle}>Subscription</Text>
            <Text style={styles.linkMeta}>
              {subscription.status === 'active' ? `Active until ${subscription.renewalDate}` : 'Free plan'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6F655D" />
        </Pressable>
      </SettingsSection>

      <Pressable disabled={isServiceBusy} style={styles.logoutButton} onPress={confirmLogout}>
        <Text style={styles.logoutText}>{isServiceBusy ? 'Working...' : 'Logout'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  onValueChange,
  value,
}: {
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch onValueChange={onValueChange} value={value} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 22,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  eyebrow: {
    color: '#8A7B70',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#171412',
    fontSize: 30,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F5F1EC',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  accountCard: {
    alignItems: 'center',
    backgroundColor: '#F7F4F0',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#7D2B76',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  accountCopy: {
    flex: 1,
  },
  name: {
    color: '#211D1A',
    fontSize: 18,
    fontWeight: '800',
  },
  meta: {
    color: '#6F655D',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  errorText: {
    color: '#A83B30',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#2D241E',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  sectionCard: {
    borderColor: '#EEE5DA',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: '#EEE5DA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 14,
  },
  toggleLabel: {
    color: '#27221E',
    fontSize: 15,
    fontWeight: '700',
  },
  linkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 66,
    paddingHorizontal: 14,
  },
  linkTitle: {
    color: '#27221E',
    fontSize: 15,
    fontWeight: '800',
  },
  linkMeta: {
    color: '#6F655D',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#A83B30',
    borderRadius: 8,
    marginTop: 26,
    minHeight: 52,
    justifyContent: 'center',
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
