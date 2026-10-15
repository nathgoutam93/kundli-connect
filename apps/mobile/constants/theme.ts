/**
 * Kundali Konnect design tokens — "Celestial Night".
 *
 * Every screen should pull colors, type, spacing and radii from here instead of
 * hard-coding values. Components in `components/ui` wrap the common patterns.
 */

import { DarkTheme, type Theme } from '@react-navigation/native';
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const palette = {
  midnight950: '#07051A',
  midnight900: '#0E0B1F',
  midnight850: '#120F27',
  midnight800: '#17132E',
  midnight700: '#211B40',
  midnight600: '#2E2750',
  midnight500: '#463C73',
  lavender400: '#6F6890',
  lavender300: '#A79FC0',
  moon100: '#F4EEDF',
  moon200: '#E2DACA',
  gold500: '#E9B949',
  gold600: '#C99A2E',
  gold300: '#F3D58A',
  ember500: '#E7795B',
  ember600: '#CF5F42',
  jade400: '#7FD1A8',
  rose400: '#F07178',
} as const;

export const colors = {
  /** App canvas. */
  background: palette.midnight900,
  /** Deepest tone, used at the bottom of background gradients and behind modals. */
  backgroundDeep: palette.midnight950,
  /** Cards, sheets, list rows. */
  surface: palette.midnight800,
  /** Elevated or pressed surfaces, selected rows. */
  surfaceRaised: palette.midnight700,
  /** Inputs and recessed wells. */
  surfaceSunken: palette.midnight850,

  border: palette.midnight600,
  borderStrong: palette.midnight500,

  text: palette.moon100,
  textMuted: palette.lavender300,
  textFaint: palette.lavender400,

  accent: palette.gold500,
  accentPressed: palette.gold600,
  accentSoft: 'rgba(233, 185, 73, 0.10)',
  accentLine: 'rgba(233, 185, 73, 0.38)',
  onAccent: '#1A1206',

  like: palette.ember500,
  likePressed: palette.ember600,
  likeSoft: 'rgba(231, 121, 91, 0.16)',
  onLike: '#FFFFFF',

  success: palette.jade400,
  successSoft: 'rgba(127, 209, 168, 0.14)',
  danger: palette.rose400,
  dangerSoft: 'rgba(240, 113, 120, 0.14)',

  scrim: 'rgba(7, 5, 26, 0.72)',
  overlayOnPhoto: 'rgba(7, 5, 26, 0.38)',
  glass: 'rgba(23, 19, 46, 0.72)',
  glassBorder: 'rgba(244, 238, 223, 0.12)',
  white: '#FFFFFF',
  transparent: 'transparent',
} as const;

/** Gradient stops for the app canvas, top to bottom. */
export const backgroundGradient = ['#1B1440', palette.midnight900, palette.midnight950] as const;

/** Fades a photo into the canvas so text laid over its lower half stays legible. */
export const photoScrimGradient = ['transparent', 'rgba(7, 5, 26, 0.35)', palette.midnight950] as const;

/** Heavier scrim for full-screen artwork behind a headline and buttons. */
export const artworkScrimGradient = [
  'rgba(7, 5, 26, 0.35)',
  'rgba(7, 5, 26, 0.2)',
  'rgba(14, 11, 31, 0.92)',
  palette.midnight950,
] as const;

export const fontFamily = {
  display: 'Fraunces_500Medium',
  displayRegular: 'Fraunces_400Regular',
  displaySemiBold: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_400Regular_Italic',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
} as const;

export const type = {
  display: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 46, letterSpacing: -0.6 },
  title1: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.4 },
  title2: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  title3: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  headline: { fontFamily: fontFamily.bodySemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 22 },
  subhead: { fontFamily: fontFamily.bodyMedium, fontSize: 14, lineHeight: 20 },
  footnote: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.bodyMedium, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
} as const;

/** Standard horizontal padding for screen content. */
export const gutter = space.xl;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const shadow = {
  soft: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.35,
      shadowRadius: 24,
    },
    default: { elevation: 8 },
  }),
  glow: Platform.select<ViewStyle>({
    ios: {
      shadowColor: palette.gold500,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 18,
    },
    default: { elevation: 6 },
  }),
} as const;

/** React Navigation theme so stack transitions and default headers match the canvas. */
export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    notification: colors.like,
  },
};

/** Shared header options for stack screens that show a native header. */
export const stackHeaderOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.text,
  headerTitleStyle: { fontFamily: fontFamily.bodySemiBold, fontSize: 17 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
} as const;
