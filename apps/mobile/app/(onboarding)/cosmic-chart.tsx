import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { KundliChart } from '@/components/kundli-chart';
import { OnboardingStep } from '@/components/onboarding-step';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { colors, gutter, palette, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { useKundliQuery } from '@/hooks/use-domain-data';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import { generateCurrentUserKundli } from '@/services/supabase-auth-service';

const CHARTS = { D1: 'Birth chart', D9: 'Navamsa' } as const;

type JsonBadge = {
    key: string;
    label: string;
    value: string;
};

/**
 * Readable names for astro_details keys. The API's own keys are terse and some are misspelt
 * ("Naksahtra"), so known ones are mapped and the rest are title-cased.
 */
const DETAIL_LABELS: Record<string, string> = {
    ascendant: 'Ascendant',
    ascendantlord: 'Ascendant lord',
    sign: 'Moon sign',
    signlord: 'Moon sign lord',
    naksahtra: 'Nakshatra',
    nakshatra: 'Nakshatra',
    naksahtralord: 'Nakshatra lord',
    nakshatralord: 'Nakshatra lord',
    charan: 'Pada',
    varna: 'Varna',
    vashya: 'Vashya',
    yoni: 'Yoni',
    gan: 'Gana',
    nadi: 'Nadi',
    yog: 'Yoga',
    karan: 'Karana',
    tithi: 'Tithi',
    yunja: 'Yunja',
    tatva: 'Element',
    namealphabet: 'Name syllable',
    paya: 'Paya',
};

function formatJsonLabel(value: string) {
    const known = DETAIL_LABELS[value.toLowerCase().replace(/[^a-z]/g, '')];
    if (known) {
        return known;
    }
    return value
        .replace(/\[(\d+)\]/g, ' $1')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatJsonValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => formatJsonValue(item))
            .filter(Boolean)
            .join(', ');
    }

    return '';
}

function flattenJsonBadges(value: unknown, parentKey = ''): JsonBadge[] {
    if (!value || typeof value !== 'object') {
        const formattedValue = formatJsonValue(value);
        return formattedValue && parentKey
            ? [
                {
                    key: parentKey,
                    label: formatJsonLabel(parentKey),
                    value: formattedValue,
                },
            ]
            : [];
    }

    if (Array.isArray(value)) {
        const formattedValue = formatJsonValue(value);
        return formattedValue && parentKey
            ? [
                {
                    key: parentKey,
                    label: formatJsonLabel(parentKey),
                    value: formattedValue,
                },
            ]
            : [];
    }

    return Object.entries(value as Record<string, unknown>).flatMap(([key, childValue]) => {
        const nextKey = parentKey ? `${parentKey}.${key}` : key;
        const formattedValue = formatJsonValue(childValue);

        if (formattedValue) {
            return [
                {
                    key: nextKey,
                    label: formatJsonLabel(key),
                    value: formattedValue,
                },
            ];
        }

        return flattenJsonBadges(childValue, nextKey);
    });
}

/**
 * The Kundli chart plus the parsed details. Draws the chart from house data when the server has
 * it, falls back to the generated chart images, and otherwise says so honestly with a retry.
 * Used in onboarding and on the Kundli screen.
 */
export function KundliChartContent() {
    const { data: kundliSummary = null, isPending: isLoadingSummary } = useKundliQuery();
    const generateKundli = useAppData((state) => state.generateKundli);
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [isRetrying, setIsRetrying] = useState(false);
    const chartHouses = kundliSummary?.chartHouses ?? {};
    const drawableCharts = Object.keys(CHARTS).filter((chartId) => chartHouses[chartId]?.length === 12);
    const [selectedChart, setSelectedChart] = useState<string | null>(null);
    const activeChart = selectedChart && drawableCharts.includes(selectedChart) ? selectedChart : drawableCharts[0];
    const chartImages = kundliSummary?.chartImages ?? [];
    const jsonBadges = useMemo(
        () => flattenJsonBadges(kundliSummary?.rawResponse).slice(0, 80),
        [kundliSummary?.rawResponse]
    );

    // Kundlis generated before chart data was stored: one quiet request fills it in (the server
    // reuses the stored Kundli and only fetches the chart layout).
    const hasRequestedBackfill = useRef(false);
    const needsBackfill = Boolean(kundliSummary) && drawableCharts.length === 0;
    useEffect(() => {
        if (needsBackfill && user && !hasRequestedBackfill.current) {
            hasRequestedBackfill.current = true;
            generateCurrentUserKundli()
                .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.kundli(user.id) }))
                .catch(() => undefined);
        }
    }, [needsBackfill, queryClient, user]);

    async function retry() {
        setIsRetrying(true);
        try {
            await generateKundli();
        } catch (error) {
            Alert.alert('Chart unavailable', error instanceof Error ? error.message : 'Please try again in a moment.');
        } finally {
            setIsRetrying(false);
        }
    }

    return (
        <View style={styles.content}>
            {isLoadingSummary ? (
                <Card style={styles.loadingCard}>
                    <EmptyState loading title="Reading the stars" message="Fetching your generated chart." />
                </Card>
            ) : activeChart ? (
                <View style={styles.chartBlock}>
                    {drawableCharts.length > 1 ? (
                        <SegmentedControl
                            options={drawableCharts.map((chartId) => ({
                                value: chartId,
                                label: CHARTS[chartId as keyof typeof CHARTS] ?? chartId,
                            }))}
                            value={activeChart}
                            onChange={setSelectedChart}
                        />
                    ) : null}
                    <KundliChart
                        key={activeChart}
                        houses={chartHouses[activeChart]}
                        caption={`${CHARTS[activeChart as keyof typeof CHARTS] ?? activeChart} (${activeChart}). Numbers are signs; Asc marks your ascendant.`}
                    />
                </View>
            ) : chartImages.length > 0 ? (
                <ChartImageCarousel chartImages={chartImages} />
            ) : (
                <Card style={styles.loadingCard}>
                    <EmptyState
                        icon="planet-outline"
                        title="Your chart is still being prepared"
                        message="Your details are saved. We couldn’t draw the chart just now; try again in a moment."
                        action={
                            <Button
                                label="Try again"
                                icon="refresh"
                                variant="secondary"
                                fullWidth={false}
                                loading={isRetrying}
                                onPress={retry}
                            />
                        }
                    />
                </Card>
            )}

            {jsonBadges.length > 0 ? (
                <View style={styles.details}>
                    <AppText variant="title3">Kundli details</AppText>
                    <View style={styles.badgeGrid}>
                        {jsonBadges.map((badge) => (
                            <View key={badge.key} style={styles.jsonBadge}>
                                <AppText variant="overline" color={colors.textFaint}>
                                    {badge.label}
                                </AppText>
                                <AppText variant="bodyStrong">{badge.value}</AppText>
                            </View>
                        ))}
                    </View>
                </View>
            ) : null}
        </View>
    );
}

function ChartImageCarousel({ chartImages }: { chartImages: { chartId: string; path: string; signedUrl: string }[] }) {
    const { width } = useWindowDimensions();
    const [activeImage, setActiveImage] = useState(0);
    const chartWidth = width - gutter * 2;

    return (
        <View style={styles.chartCarousel}>
            <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => setActiveImage(Math.round(event.nativeEvent.contentOffset.x / chartWidth))}>
                {chartImages.map((chartImage) => (
                    <View key={chartImage.path} style={[styles.chartImageCard, { width: chartWidth }]}>
                        <Image source={{ uri: chartImage.signedUrl }} style={styles.chartImage} contentFit="contain" transition={250} />
                        <AppText variant="overline" color={palette.ink600} align="center">
                            {CHARTS[chartImage.chartId as keyof typeof CHARTS] ?? `${chartImage.chartId} chart`}
                        </AppText>
                    </View>
                ))}
            </ScrollView>
            {chartImages.length > 1 ? (
                <View style={styles.pagination}>
                    {chartImages.map((chartImage, index) => (
                        <View key={chartImage.path} style={[styles.dot, index === activeImage && styles.activeDot]} />
                    ))}
                </View>
            ) : null}
        </View>
    );
}

export default function CosmicChartScreen() {
    return (
        <OnboardingStep
            step="cosmic-chart"
            title="Your cosmic chart"
            subtitle="Generated from your birth details. We use it to score compatibility with every match."
            onContinue={() => router.push('/(onboarding)/gender')}>
            <KundliChartContent />
        </OnboardingStep>
    );
}

const styles = StyleSheet.create({
    content: {
        gap: space.xl,
    },
    loadingCard: {
        minHeight: 240,
    },
    chartBlock: {
        gap: space.md,
    },
    chartCarousel: {
        gap: space.sm,
    },
    chartImageCard: {
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: palette.moon100,
        paddingBottom: space.md,
        gap: space.xs,
    },
    chartImage: {
        width: '100%',
        aspectRatio: 1,
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: space.xs,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.borderStrong,
    },
    activeDot: {
        width: 18,
        backgroundColor: colors.accent,
    },
    details: {
        gap: space.sm,
    },
    badgeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.xs,
    },
    jsonBadge: {
        maxWidth: '100%',
        gap: 2,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: space.sm,
        paddingVertical: space.xs,
        backgroundColor: colors.surface,
    },
});
