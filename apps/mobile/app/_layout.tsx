import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import { ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { colors, navigationTheme, stackHeaderOptions } from '@/constants/theme';
import { configureReactNativeQueryListeners, queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/providers/auth-provider';

void SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  const isReady = fontsLoaded || Boolean(fontError);

  useEffect(() => configureReactNativeQueryListeners(), []);

  useEffect(() => {
    if (isReady) {
      void SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navigationTheme}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="match" options={{ presentation: 'modal' }} />
            <Stack.Screen name="chat/[chatId]" options={{ ...stackHeaderOptions, headerShown: true, title: 'Chat' }} />
            <Stack.Screen name="settings" />
            <Stack.Screen name="edit-profile" />
            <Stack.Screen name="kundli" />
            <Stack.Screen name="subscriptions" />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
