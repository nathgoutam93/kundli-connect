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
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

import { ToastHost } from '@/components/ui/toast';
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
    <GestureHandlerRootView style={styles.root}>
      {/* The app draws edge-to-edge on Android, so the window no longer resizes for the keyboard. */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider value={navigationTheme}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="match" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
              <Stack.Screen name="chat/[chatId]" options={{ ...stackHeaderOptions, headerShown: true, title: 'Chat' }} />
              <Stack.Screen name="settings" />
              <Stack.Screen name="edit-profile" />
              <Stack.Screen name="kundli" />
              <Stack.Screen name="subscriptions" />
              <Stack.Screen name="blocked-users" />
              <Stack.Screen name="delete-account" />
              <Stack.Screen name="legal/[doc]" />
              <Stack.Screen name="auth/callback" />
            </Stack>
            <StatusBar style="light" />
            <ToastHost />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
