import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import { Redirect, Tabs } from 'expo-router';
import { type ComponentProps, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { CelestialTabBar } from '@/components/tab-bar';
import { FullScreenLoader } from '@/components/ui/loader';
import { colors } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { useNotificationRouting } from '@/hooks/use-notification-routing';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { registerCurrentUserPushToken } from '@/services/supabase-auth-service';

type IconName = ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  return <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={22} color={color} />;
}

function badgeValue(count: number) {
  return count > 0 ? (count > 9 ? '9+' : count) : undefined;
}

export default function MainTabsLayout() {
  const { isHydrated, isAuthenticated, hasCompletedOnboarding, profile, likes, chats } = useAppData();
  const unreadLikes = likes.filter((like) => !like.readAt).length;
  const unreadMessages = chats.reduce((total, chat) => total + (chat.hidden ? 0 : chat.unreadCount), 0);
  const hasCheckedNotificationPromptRef = useRef(false);
  useRealtimeSync();
  useNotificationRouting(isHydrated && isAuthenticated && hasCompletedOnboarding);

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
      tabBar={(props) => <CelestialTabBar {...props} />}
      screenOptions={{
        headerShown: false,
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
          tabBarBadge: badgeValue(unreadLikes),
          tabBarIcon: ({ color, focused }) => <TabIcon name="heart" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarBadge: badgeValue(unreadMessages),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="chatbubble-ellipses" focused={focused} color={color} />
          ),
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
