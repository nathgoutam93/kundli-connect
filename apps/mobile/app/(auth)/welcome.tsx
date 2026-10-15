import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Alert, ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { artworkScrimGradient, colors, fontFamily, gutter, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

export default function WelcomeScreen() {
  const completeGoogleLogin = useAppData((state) => state.completeGoogleLogin);

  function handleCreateAccount() {
    router.push('/(auth)/phone');
  }

  async function handleGoogleLogin() {
    try {
      await completeGoogleLogin();
      router.replace('/(onboarding)/basics');
    } catch (error) {
      Alert.alert('Google sign-in unavailable', error instanceof Error ? error.message : 'Try phone sign-in instead.');
    }
  }

  return (
    <ImageBackground
      source={require('@/assets/images/onboard_bg.png')}
      resizeMode="cover"
      style={styles.background}>
      <LinearGradient
        colors={artworkScrimGradient}
        locations={[0, 0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.brand}>
          <AppText variant="overline" color={colors.accent}>
            ✦ Kundali Konnect ✦
          </AppText>
        </View>

        <View style={styles.content}>
          <View style={styles.copy}>
            <AppText variant="display" align="center" style={styles.title}>
              Find the one{'\n'}written in the{' '}
              <AppText variant="display" color={colors.accent} style={styles.titleAccent}>
                stars
              </AppText>
            </AppText>
            <AppText variant="callout" color={colors.textMuted} align="center">
              Matches guided by your Kundli — compatibility you can read, not just swipe.
            </AppText>
          </View>

          <View style={styles.actions}>
            <Button label="Create account" onPress={handleCreateAccount} />
            <Button label="Continue with Google" variant="light" icon="logo-google" onPress={handleGoogleLogin} />

            <Pressable style={styles.authLink} onPress={handleCreateAccount} hitSlop={8}>
              <AppText variant="footnote" color={colors.textMuted}>
                Already have an account?{' '}
                <AppText variant="footnote" color={colors.accent} style={styles.authLinkStrong}>
                  Sign in
                </AppText>
              </AppText>
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
    backgroundColor: colors.backgroundDeep,
  },
  container: {
    flex: 1,
    paddingHorizontal: gutter,
  },
  brand: {
    alignItems: 'center',
    paddingTop: space.md,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: space.md,
    gap: space.xxl,
  },
  copy: {
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  title: {
    fontSize: 44,
    lineHeight: 50,
  },
  titleAccent: {
    fontFamily: fontFamily.displayItalic,
    fontSize: 44,
    lineHeight: 50,
  },
  actions: {
    gap: space.sm,
  },
  authLink: {
    alignSelf: 'center',
    paddingVertical: space.xs,
  },
  authLinkStrong: {
    fontFamily: fontFamily.bodySemiBold,
  },
});
