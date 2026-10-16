import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors, gutter, space } from '@/constants/theme';
import { isLegalDocumentId, LEGAL_DOCUMENTS, type LegalBlock } from '@/constants/legal';

/** Built-in privacy policy and terms (used when no hosted URL is configured). */
export default function LegalDocumentScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();

  if (!isLegalDocumentId(doc)) {
    return (
      <Screen starSeed={41}>
        <ScreenHeader title="Legal" />
        <EmptyState icon="document-text-outline" title="Page not found" message="This document doesn’t exist." />
      </Screen>
    );
  }

  const document = LEGAL_DOCUMENTS[doc];

  return (
    <Screen starSeed={41}>
      <ScreenHeader title={document.title} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="footnote" color={colors.textFaint}>
          Last updated {document.lastUpdated}
        </AppText>
        <AppText variant="callout" color={colors.textMuted}>
          {document.intro}
        </AppText>

        {document.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <AppText variant="headline">{section.heading}</AppText>
            {section.body.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') {
    return (
      <AppText variant="callout" color={colors.textMuted}>
        {block}
      </AppText>
    );
  }

  return (
    <View style={styles.list}>
      {block.map((item) => (
        <View key={item} style={styles.listItem}>
          <AppText variant="callout" color={colors.accent}>
            •
          </AppText>
          <AppText variant="callout" color={colors.textMuted} style={styles.listText}>
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  section: {
    gap: space.sm,
  },
  list: {
    gap: space.xs,
  },
  listItem: {
    flexDirection: 'row',
    gap: space.sm,
    paddingLeft: space.xxs,
  },
  listText: {
    flex: 1,
  },
});
