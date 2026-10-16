import { ScrollView, StyleSheet } from 'react-native';

import { KundliChartContent } from '@/app/(onboarding)/cosmic-chart';
import { InsightsCard } from '@/components/insights-card';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { gutter, space } from '@/constants/theme';

export default function KundliScreen() {
    return (
        <Screen>
            <ScreenHeader title="My Kundli" />
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <InsightsCard />
                <KundliChartContent />
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: gutter,
        paddingTop: space.md,
        paddingBottom: space.huge,
    },
});
