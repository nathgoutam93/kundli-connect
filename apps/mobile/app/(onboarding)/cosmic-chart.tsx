import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { colors, gutter, palette, radius, space } from '@/constants/theme';
import { useKundliQuery } from '@/hooks/use-domain-data';

type Planet = {
    key: string;
    label: string;
    x: number;
    y: number;
    degree: number;
};

const PLANETS = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa', 'Ra', 'Ke', 'Ur', 'Ne', 'Pl'];
const CHART_POINTS = [
    { x: 50, y: 11 },
    { x: 78, y: 10 },
    { x: 92, y: 30 },
    { x: 84, y: 60 },
    { x: 70, y: 82 },
    { x: 49, y: 63 },
    { x: 28, y: 82 },
    { x: 13, y: 60 },
    { x: 18, y: 31 },
    { x: 35, y: 17 },
] as const;
const CHARTS = { "D1": "Birth", "D9": "Navamansha" } as const;

type JsonBadge = {
    key: string;
    label: string;
    value: string;
};

function shuffle<T>(items: T[]) {
    return [...items].sort(() => Math.random() - 0.5);
}

function generatePlanets(): Planet[] {
    return shuffle(PLANETS)
        .slice(0, 10)
        .map((label, index) => ({
            key: `${label}-${index}`,
            label,
            x: CHART_POINTS[index].x,
            y: CHART_POINTS[index].y,
            degree: Math.floor(Math.random() * 30),
        }));
}

function formatJsonLabel(value: string) {
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

/** Chart images (or a placeholder chart) plus the parsed Kundli details. Used in onboarding and on the Kundli screen. */
export function KundliChartContent() {
    const { data: kundliSummary = null, isPending: isLoadingSummary } = useKundliQuery();
    const { width } = useWindowDimensions();
    const [activeChart, setActiveChart] = useState(0);
    const planets = useMemo(() => generatePlanets(), []);
    const chartImages = kundliSummary?.chartImages ?? [];
    const chartWidth = width - gutter * 2;
    const jsonBadges = useMemo(
        () => flattenJsonBadges(kundliSummary?.rawResponse).slice(0, 80),
        [kundliSummary?.rawResponse]
    );

    return (
        <View style={styles.content}>
            {isLoadingSummary ? (
                <Card style={styles.loadingCard}>
                    <EmptyState loading title="Reading the stars" message="Fetching your generated chart." />
                </Card>
            ) : chartImages.length > 0 ? (
                <View style={styles.chartCarousel}>
                    <ScrollView
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(event) =>
                            setActiveChart(Math.round(event.nativeEvent.contentOffset.x / chartWidth))
                        }>
                        {chartImages.map((chartImage) => (
                            <View key={chartImage.path} style={[styles.chartImageCard, { width: chartWidth }]}>
                                <Image
                                    source={{ uri: chartImage.signedUrl }}
                                    style={styles.chartImage}
                                    contentFit="contain"
                                />
                                <AppText variant="overline" color={palette.midnight600} align="center">
                                    {CHARTS[chartImage.chartId as keyof typeof CHARTS] ?? chartImage.chartId} chart
                                </AppText>
                            </View>
                        ))}
                    </ScrollView>
                    {chartImages.length > 1 ? (
                        <View style={styles.pagination}>
                            {chartImages.map((chartImage, index) => (
                                <View
                                    key={chartImage.path}
                                    style={[styles.dot, index === activeChart && styles.activeDot]}
                                />
                            ))}
                        </View>
                    ) : null}
                </View>
            ) : (
                <Card padded={false} style={styles.chartCard}>
                    <View style={styles.chart}>
                        <View style={[styles.line, styles.lineDown]} />
                        <View style={[styles.line, styles.lineUp]} />
                        <View style={[styles.line, styles.verticalDiamond]} />
                        <View style={[styles.line, styles.horizontalDiamond]} />
                        <AppText variant="caption" color={colors.textFaint} style={[styles.houseNumber, styles.houseTop]}>1</AppText>
                        <AppText variant="caption" color={colors.textFaint} style={[styles.houseNumber, styles.houseLeft]}>7</AppText>
                        <AppText variant="caption" color={colors.textFaint} style={[styles.houseNumber, styles.houseCenter]}>5</AppText>
                        <AppText variant="caption" color={colors.textFaint} style={[styles.houseNumber, styles.houseRight]}>3</AppText>
                        <AppText variant="caption" color={colors.textFaint} style={[styles.houseNumber, styles.houseBottom]}>11</AppText>

                        {planets.map((planet) => (
                            <View
                                key={planet.key}
                                style={[
                                    styles.planet,
                                    {
                                        left: `${planet.x}%`,
                                        top: `${planet.y}%`,
                                    },
                                ]}>
                                <AppText variant="subhead" color={colors.text}>
                                    {planet.label}
                                    <AppText variant="caption" color={colors.accent}> {planet.degree}°</AppText>
                                </AppText>
                            </View>
                        ))}
                    </View>
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
    chartCard: {
        overflow: 'hidden',
    },
    chart: {
        aspectRatio: 1.16,
        minHeight: 230,
        maxHeight: 270,
    },
    line: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 382,
        height: 1,
        backgroundColor: colors.accentLine,
    },
    lineDown: {
        transform: [{ translateX: -191 }, { rotate: '39deg' }],
    },
    lineUp: {
        transform: [{ translateX: -191 }, { rotate: '-39deg' }],
    },
    verticalDiamond: {
        transform: [{ translateX: -191 }, { rotate: '90deg' }],
    },
    horizontalDiamond: {
        transform: [{ translateX: -191 }],
    },
    houseNumber: {
        position: 'absolute',
    },
    houseTop: {
        top: '7%',
        left: '68%',
    },
    houseLeft: {
        top: '23%',
        left: '18%',
    },
    houseCenter: {
        top: '44%',
        left: '49%',
    },
    houseRight: {
        top: '23%',
        right: '18%',
    },
    houseBottom: {
        bottom: '43%',
        left: '49%',
    },
    planet: {
        position: 'absolute',
        transform: [{ translateX: -14 }, { translateY: -9 }],
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
