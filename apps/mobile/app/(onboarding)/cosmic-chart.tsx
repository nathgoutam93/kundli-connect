import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCurrentUserKundliSummary, type KundliSummary } from '@/services/supabase-auth-service';
import { useAppState } from '@/store/use-app-state';

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

function formatJsonValue(value: unknown) {
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

export function KundliChartContent({
    showBackButton = false,
    showNextButton = true,
}: {
    showBackButton?: boolean;
    showNextButton?: boolean;
}) {
    const { profile } = useAppState();
    const [kundliSummary, setKundliSummary] = useState<KundliSummary | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const planets = useMemo(() => generatePlanets(), []);
    const chartImages = kundliSummary?.chartImages ?? [];
    const jsonBadges = useMemo(
        () => flattenJsonBadges(kundliSummary?.rawResponse).slice(0, 80),
        [kundliSummary?.rawResponse]
    );

    useEffect(() => {
        let isMounted = true;

        getCurrentUserKundliSummary()
            .then((summary) => {
                if (isMounted) {
                    setKundliSummary(summary);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setKundliSummary(null);
                }
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoadingSummary(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {showBackButton ? (
                <View style={styles.topBar}>
                    <Pressable
                        accessibilityLabel="Go back"
                        style={styles.backButton}
                        onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={24} color="#101010" />
                    </Pressable>
                    <Text style={styles.topBarTitle}>My Kundli</Text>
                    <View style={styles.topBarSpacer} />
                </View>
            ) : null}
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}>

                <View style={styles.header}>
                    <Text style={styles.title}>Cosmic Chart</Text>
                </View>

                {isLoadingSummary ? (
                    <View style={styles.loadingCard}>
                        <Text style={styles.loadingTitle}>Loading Kundli</Text>
                        <Text style={styles.loadingText}>Fetching your generated chart.</Text>
                    </View>
                ) : chartImages.length > 0 ? (
                    <ScrollView
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chartImageList}>
                        {chartImages.map((chartImage) => (
                            <View key={chartImage.path} style={styles.chartImageCard}>
                                <Image
                                    source={{ uri: chartImage.signedUrl }}
                                    style={styles.chartImage}
                                    contentFit="contain"
                                />
                                <View style={styles.chartImageHeader}>
                                    <Text style={styles.chartImageTitle}>{CHARTS[chartImage.chartId]} Chart</Text>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                ) : (
                    <View style={styles.chartCard}>
                        <View style={styles.chart}>
                            <View style={[styles.line, styles.lineDown]} />
                            <View style={[styles.line, styles.lineUp]} />
                            <View style={[styles.line, styles.verticalDiamond]} />
                            <View style={[styles.line, styles.horizontalDiamond]} />
                            <Text style={[styles.houseNumber, styles.houseTop]}>1</Text>
                            <Text style={[styles.houseNumber, styles.houseLeft]}>7</Text>
                            <Text style={[styles.houseNumber, styles.houseCenter]}>5</Text>
                            <Text style={[styles.houseNumber, styles.houseRight]}>3</Text>
                            <Text style={[styles.houseNumber, styles.houseBottom]}>11</Text>

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
                                    <Text style={styles.planetText}>
                                        {planet.label}
                                        <Text style={styles.degree}> {planet.degree}</Text>
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}


                <View style={styles.analysisCard}>
                    {jsonBadges.length > 0 ? (
                        <>
                            <Text style={styles.groupTitle}>Kundli Details</Text>
                            <View style={styles.badgeGrid}>
                                {jsonBadges.map((badge) => (
                                    <View key={badge.key} style={styles.jsonBadge}>
                                        <Text style={styles.jsonBadgeLabel}>{badge.label}</Text>
                                        <Text style={styles.jsonBadgeValue}>{badge.value}</Text>
                                    </View>
                                ))}
                            </View>
                        </>
                    ) : null}
                </View>
            </ScrollView>

            {showNextButton ? (
                <Pressable style={styles.nextButton} onPress={() => router.push('/(onboarding)/gender')}>
                    <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
                </Pressable>
            ) : null}
        </SafeAreaView>
    );
}

export default function CosmicChartScreen() {
    return <KundliChartContent />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFCF7',
    },
    content: {
        flex: 1,
    },
    topBar: {
        minHeight: 58,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 1,
        borderColor: '#FBD06D',
        backgroundColor: '#FFFCF7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    topBarTitle: {
        color: '#090A0E',
        fontSize: 21,
        lineHeight: 25,
        fontWeight: '800',
    },
    topBarSpacer: {
        width: 46,
        height: 46,
    },
    scrollContent: {
        paddingHorizontal: 30,
        paddingTop: 16,
        paddingBottom: 120,
    },
    header: {
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 18,
    },
    title: {
        fontSize: 36,
        lineHeight: 41,
        fontWeight: '500',
        color: '#070707',
        letterSpacing: 5,
    },
    subtitle: {
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '800',
        color: '#2D2533',
    },
    chartImageList: {
        flexDirection: 'row',
        gap: 14,
    },
    chartImageCard: {
        width: 300,
        // borderWidth: 1,
        // borderColor: '#F5D482',
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
    },
    chartImageHeader: {
        minHeight: 42,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F6E3AE',
    },
    chartImageTitle: {
        fontSize: 13,
        lineHeight: 17,
        fontWeight: '800',
        color: '#2D2533',
        textAlign: 'center'
    },
    chartImage: {
        width: '100%',
        aspectRatio: 1,
        backgroundColor: '#FFFFFF',
    },
    loadingCard: {
        minHeight: 230,
        borderWidth: 1,
        borderColor: '#F5D482',
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    loadingTitle: {
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '800',
        color: '#2D2533',
    },
    loadingText: {
        marginTop: 6,
        fontSize: 14,
        lineHeight: 19,
        fontWeight: '700',
        color: '#8A7B70',
        textAlign: 'center',
    },
    chartCard: {
        borderWidth: 1,
        borderColor: '#F5D482',
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#FFFCF7',
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
        backgroundColor: '#F3DDA4',
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
        fontSize: 10,
        color: '#3D3140',
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
    planetText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#231D28',
    },
    degree: {
        fontSize: 8,
        fontWeight: '700',
    },
    pagination: {
        marginTop: 15,
        marginBottom: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    activeDot: {
        width: 20,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#F7BF16',
    },
    dot: {
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#7A7A7A',
    },
    analysisCard: {
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 24,
        backgroundColor: '#FFFCF7',
    },
    groupTitle: {
        marginTop: 10,
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '800',
        color: '#F2A900',
        letterSpacing: 0.8,
    },
    badgeGrid: {
        marginTop: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    jsonBadge: {
        maxWidth: '100%',
        borderWidth: 1,
        borderColor: '#F0DCA7',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 9,
        backgroundColor: '#FFFFFF',
    },
    jsonBadgeLabel: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '800',
        color: '#8A6C18',
    },
    jsonBadgeValue: {
        marginTop: 3,
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '700',
        color: '#2A2230',
    },
    nextButton: {
        position: 'absolute',
        right: 29,
        bottom: 42,
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#FCAD00',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
