import { Image, type ImageProps } from 'expo-image';

import { profileImageSource } from '@/lib/profile-photos';
import { useAuth } from '@/providers/auth-provider';

type Props = Omit<ImageProps, 'source'> & { uri: string };

/** Private photos are authorized on each network request and never stored in the disk image cache. */
export function ProfileImage({ uri, ...props }: Props) {
  const { session } = useAuth();
  const source = profileImageSource(uri, process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', session?.access_token,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY);
  return <Image {...props} source={source} cachePolicy="none" recyclingKey={`${session?.user.id ?? 'anonymous'}:${uri}`} />;
}
