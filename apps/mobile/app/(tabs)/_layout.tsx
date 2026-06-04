import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { registerCurrentUserPushToken } from '@/services/supabase-auth-service';
import { useAppState } from '@/store/use-app-state';

export default function MainTabsLayout() {
  const { isHydrated, isAuthenticated, hasCompletedOnboarding, profile } = useAppState();
  const hasCheckedNotificationPromptRef = useRef(false);

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
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#2D241E" />
      </View>
    );
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
        tabBarActiveTintColor: '#2D241E',
        tabBarInactiveTintColor: '#8D7F74',
        tabBarStyle: {
          borderTopColor: '#E9E2D9',
          backgroundColor: '#FBF8F3',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => <Ionicons name="flame" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="likes"
        options={{
          title: 'Likes',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={color} />
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
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F5F0',
  },
});
