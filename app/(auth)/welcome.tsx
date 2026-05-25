import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ImageBackground, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useAppState } from '@/store/use-app-state';

export default function WelcomeScreen() {
  const completeGoogleLogin = useAppState((state) => state.completeGoogleLogin);

  function handleCreateAccount() {
    router.push('/(auth)/phone');
  }

  async function handleGoogleLogin() {
    await completeGoogleLogin();
    router.replace('/(onboarding)/basics');
  }

  return (
    <ImageBackground
      source={require('@/assets/images/onboard_bg.png')}
      resizeMode="cover"
      style={styles.background}>
      <StatusBar style="light" />
      <View style={styles.overlay} />

      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Find The One{`\n`}From Destiny</Text>

          <View style={styles.actions}>
            <Pressable style={styles.primaryButton} onPress={handleCreateAccount}>
              <Text style={styles.primaryButtonText}>Create account</Text>
            </Pressable>

            <Pressable style={styles.googleButton} onPress={handleGoogleLogin}>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </Pressable>

            <Pressable style={styles.authLink} onPress={handleCreateAccount}>
              <Text style={styles.authLinkText}>Already have an account? </Text>
              <Text style={styles.authLinkHighlight}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#07090F',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 34,
    gap: 26,
  },
  title: {
    color: '#E8C63B',
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  actions: {
    gap: 16,
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: '#F0CC43',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#2A1E05',
    fontWeight: '700',
    fontSize: 18,
  },
  googleButton: {
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  googleButtonText: {
    color: '#1F1B18',
    fontWeight: '800',
    fontSize: 16,
  },
  authLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  authLinkText: {
    color: '#CEC7BC',
    fontSize: 13,
    fontWeight: '500',
  },
  authLinkHighlight: {
    color: '#F0CC43',
    fontSize: 13,
    fontWeight: '700',
  },
});
