import { Text, type TextProps } from 'react-native';

import { colors, type, type TypeVariant } from '@/constants/theme';

export type AppTextProps = TextProps & {
  variant?: TypeVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
};

export function AppText({ variant = 'body', color = colors.text, align, style, ...rest }: AppTextProps) {
  return <Text style={[type[variant], { color }, align ? { textAlign: align } : null, style]} {...rest} />;
}
