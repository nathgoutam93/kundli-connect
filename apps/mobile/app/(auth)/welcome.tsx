import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Alert, ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { artworkScrimGradient, colors, fontFamily, gutter, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { MINIMUM_AGE } from '@/lib/age';
import { openLegalDocument } from '@/lib/legal';
import { enabledSocialProviders, type SocialProvider } from '@/services/auth';

const PROVIDER_BUTTONS: Record<
  SocialProvider,
  { label: string; icon: ComponentProps<typeof Button>['icon']; variant: ComponentProps<typeof Button>['variant'] }
> = {
  google: { label: 'Continue with Google', icon: 'logo-google', variant: 'light' },
  facebook: { label: 'Continue with Facebook', icon: 'logo-facebook', variant: 'secondary' },
  apple: { label: 'Continue with Apple', icon: 'logo-apple', variant: 'light' },
};

export default function WelcomeScreen() {
  const signInWithProvider = useAppData((state) => state.signInWithProvider);
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);

  function handleCreateAccount() {
    router.push('/(auth)/phone');
  }

  async function handleSocialSignIn(provider: SocialProvider) {
    setBusyProvider(provider);
    try {
      const result = await signInWithProvider(provider);
      // On success the (auth) layout redirects to onboarding or the app once the profile loads.
      if (result.status === 'failed') {
        Alert.alert('Sign-in failed', result.reason);
      }
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Try phone sign-in instead.');
    } finally {
      setBusyProvider(null);
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
            <Button label="Continue with phone" icon="call" onPress={handleCreateAccount} disabled={busyProvider !== null} />
            {enabledSocialProviders.map((provider) => (
              <Button
                key={provider}
                label={PROVIDER_BUTTONS[provider].label}
                icon={PROVIDER_BUTTONS[provider].icon}
                variant={PROVIDER_BUTTONS[provider].variant}
                loading={busyProvider === provider}
                disabled={busyProvider !== null && busyProvider !== provider}
                onPress={() => handleSocialSignIn(provider)}
              />
            ))}

            <Pressable style={styles.authLink} onPress={handleCreateAccount} hitSlop={8}>
              <AppText variant="footnote" color={colors.textMuted}>
                Already have an account?{' '}
                <AppText variant="footnote" color={colors.accent} style={styles.authLinkStrong}>
                  Sign in
                </AppText>
              </AppText>
            </Pressable>

            <AppText variant="caption" color={colors.textFaint} align="center" style={styles.consent}>
              By continuing, you confirm you’re {MINIMUM_AGE} or older and agree to our{' '}
              <AppText
                variant="caption"
                color={colors.textMuted}
                style={styles.consentLink}
                accessibilityRole="link"
                onPress={() => void openLegalDocument('terms')}>
                Terms
              </AppText>{' '}
              and{' '}
              <AppText
                variant="caption"
                color={colors.textMuted}
                style={styles.consentLink}
                accessibilityRole="link"
                onPress={() => void openLegalDocument('privacy')}>
                Privacy Policy
              </AppText>
              .
            </AppText>
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
  consent: {
    paddingHorizontal: space.md,
  },
  consentLink: {
    textDecorationLine: 'underline',
  },
});
