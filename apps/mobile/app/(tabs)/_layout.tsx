import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import { Redirect, Tabs } from 'expo-router';
import { type ComponentProps, useEffect, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { FullScreenLoader } from '@/components/ui/loader';
import { colors, fontFamily, radius } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { registerCurrentUserPushToken } from '@/services/supabase-auth-service';

type IconName = ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.indicator, focused && styles.indicatorActive]} />
      <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={22} color={color} />
    </View>
  );
}

export default function MainTabsLayout() {
  const { isHydrated, isAuthenticated, hasCompletedOnboarding, profile } = useAppData();
  const hasCheckedNotificationPromptRef = useRef(false);
  useRealtimeSync();

  useEffect(() => {
    if (!isHydrated || !isAuthenticated || !hasCompletedOnboarding || hasCheckedNotificationPromptRef.current) {
      return;
    }

    hasCheckedNotificationPromptRef.current = true;

    async function promptForNotificationsIfNeeded() {
      const permissions = await Notifications.getPermissionsAsync();

      if (permissions.granted || !permissions.canAskAgain) {
        return;
      }

      const promptKey = `push-permission-prompted:${profile.id || 'current-user'}`;
      const hasPrompted = await AsyncStorage.getItem(promptKey);

      if (hasPrompted) {
        return;
      }

      Alert.alert(
        'Turn on notifications?',
        'Get alerts for likes, matches, and new messages.',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => {
              void AsyncStorage.setItem(promptKey, 'true');
            },
          },
          {
            text: 'Turn On',
            onPress: () => {
              void AsyncStorage.setItem(promptKey, 'true');
              void registerCurrentUserPushToken({ requestPermission: true }).catch((error) => {
                console.warn('Push token registration failed from returning-user prompt.', error);
              });
            },
          },
        ]
      );
    }

    promptForNotificationsIfNeeded().catch((error) => {
      console.warn('Returning-user notification prompt failed.', error);
    });
  }, [hasCompletedOnboarding, isAuthenticated, isHydrated, profile.id]);

  if (!isHydrated) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)/basics" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => <TabIcon name="flame" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="likes"
        options={{
          title: 'Likes',
          tabBarIcon: ({ color, focused }) => <TabIcon name="heart" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="chatbubble-ellipses" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <TabIcon name="person" focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.backgroundDeep,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  iconWrap: {
    alignItems: 'center',
    gap: 4,
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.transparent,
    position: 'absolute',
    top: -7,
  },
  indicatorActive: {
    backgroundColor: colors.accent,
  },
});
