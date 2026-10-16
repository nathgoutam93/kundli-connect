import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { colors, fontFamily, photoScrimGradient, radius, space } from '@/constants/theme';
import { type ProfileDetail } from '@/constants/mock-data';

export type ProfileViewData = {
  name: string;
  age?: number;
  location?: string;
  bio?: string;
  photos: string[];
  details: ProfileDetail[];
};

type ProfileViewProps = {
  profile: ProfileViewData;
  /** Rendered over the top-right of the hero photo, e.g. a "more" button for report/block. */
  heroAccessory?: ReactNode;
};

/** Read-only profile layout: hero photo, bio, detail chips and remaining photos. */
export function ProfileView({ profile, heroAccessory }: ProfileViewProps) {
  const [heroPhoto, ...morePhotos] = profile.photos;
  const firstDetails = profile.details.slice(0, 4);
  const secondDetails = profile.details.slice(4);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        {heroPhoto ? (
          <Image source={{ uri: heroPhoto }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="person" size={56} color={colors.textFaint} />
          </View>
        )}
        <LinearGradient
          colors={photoScrimGradient}
          locations={[0.45, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroIdentity}>
          <AppText variant="display" style={styles.heroName}>
            {profile.name}
            {profile.age ? <AppText style={styles.heroAge}>{`  ${profile.age}`}</AppText> : null}
          </AppText>
          {profile.location ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <AppText variant="subhead" color={colors.textMuted}>
                {profile.location}
              </AppText>
            </View>
          ) : null}
        </View>
        {heroAccessory ? <View style={styles.heroAccessory}>{heroAccessory}</View> : null}
      </View>

      {profile.bio ? (
        <View style={styles.bio}>
          <AppText variant="overline" color={colors.accent}>
            About
          </AppText>
          <AppText style={styles.bioText}>{profile.bio}</AppText>
        </View>
      ) : null}

      <ProfileDetails details={firstDetails} />
      {morePhotos[0] ? <ProfilePhoto uri={morePhotos[0]} /> : null}
      <ProfileDetails details={secondDetails} />
      {morePhotos.slice(1).map((uri) => (
        <ProfilePhoto key={uri} uri={uri} />
      ))}
    </View>
  );
}

export function ProfileDetails({ details }: { details: ProfileDetail[] }) {
  if (details.length === 0) {
    return null;
  }

  return (
    <Card padded={false} style={styles.details}>
      {details.map((item, index) => (
        <View key={`${item.label}-${index}`} style={[styles.detailRow, index > 0 && styles.detailDivider]}>
          <View style={styles.detailIcon}>
            <Ionicons name={item.icon} size={17} color={colors.accent} />
          </View>
          <AppText variant="callout" style={styles.detailText}>
            {item.text}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

function ProfilePhoto({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.inlinePhoto} contentFit="cover" transition={250} />;
}

const styles = StyleSheet.create({
  container: {
    gap: space.md,
  },
  hero: {
    aspectRatio: 0.78,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIdentity: {
    padding: space.lg,
    gap: space.xxs,
  },
  heroName: {
    fontSize: 36,
    lineHeight: 42,
  },
  heroAge: {
    fontFamily: fontFamily.displayRegular,
    fontSize: 30,
    color: colors.textMuted,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroAccessory: {
    position: 'absolute',
    top: space.md,
    right: space.md,
  },
  bio: {
    gap: space.xs,
    paddingHorizontal: space.xxs,
    paddingVertical: space.xs,
  },
  bioText: {
    fontFamily: fontFamily.displayRegular,
    fontSize: 20,
    lineHeight: 29,
    color: colors.text,
  },
  details: {
    paddingHorizontal: space.md,
  },
  detailRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  detailDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  detailText: {
    flex: 1,
  },
  inlinePhoto: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
});
