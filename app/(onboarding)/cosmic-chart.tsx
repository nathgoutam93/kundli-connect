import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const YOGAS = ['Hamsa', 'Dhan', 'Gajkesari'];
const DOSHAS = ['Kendrum', 'Kaal Sarp'];

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

export default function CosmicChartScreen() {
    const planets = useMemo(() => generatePlanets(), []);
    const highlightedYogas = useMemo(() => shuffle(YOGAS), []);
    const highlightedDoshas = useMemo(() => shuffle(DOSHAS), []);

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}>

                <View style={styles.header}>
                    <Text style={styles.title}>Cosmic Chart</Text>
                    <Text style={styles.subtitle}>Lagna Chart (D1)</Text>
                </View>

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

                <View style={styles.pagination}>
                    <View style={styles.activeDot} />
                    <View style={styles.dot} />
                </View>

                <View style={styles.analysisCard}>
                    <Text style={styles.cardTitle}>Kundli Analysis +</Text>
                    <Text style={styles.analysisText}>
                        You value emotional intelligence, loyalty, and long-term thinking over surface-level attraction.
                        When you commit<Text style={styles.goldText}>...more</Text>
                    </Text>

                    <Text style={styles.groupTitle}>Yogas</Text>
                    <View style={styles.chipRow}>
                        {highlightedYogas.map((yoga) => (
                            <View key={yoga} style={styles.yogaChip}>
                                <Text style={styles.yogaText}>{yoga}</Text>
                            </View>
                        ))}
                    </View>

                    <Text style={[styles.groupTitle, styles.doshaTitle]}>Doshas</Text>
                    <View style={styles.chipRow}>
                        {highlightedDoshas.map((dosha) => (
                            <View key={dosha} style={styles.doshaChip}>
                                <Text style={styles.doshaText}>{dosha}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>

            <Pressable style={styles.nextButton} onPress={() => router.push('/(onboarding)/gender')}>
                <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
            </Pressable>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFCF7',
    },
    content: {
        flex: 1,
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
    cardTitle: {
        fontSize: 19,
        lineHeight: 23,
        fontWeight: '800',
        color: '#F2A900',
        letterSpacing: 0.4,
    },
    analysisText: {
        marginTop: 5,
        fontSize: 19,
        lineHeight: 27,
        fontWeight: '600',
        color: '#2A2230',
        letterSpacing: 0.2,
    },
    goldText: {
        color: '#F2A900',
    },
    groupTitle: {
        marginTop: 10,
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '800',
        color: '#F2A900',
        letterSpacing: 0.8,
    },
    doshaTitle: {
        color: '#E85B5F',
    },
    chipRow: {
        marginTop: 6,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    yogaChip: {
        borderWidth: 1,
        borderColor: '#FFB000',
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    yogaText: {
        fontSize: 17,
        lineHeight: 20,
        fontWeight: '700',
        color: '#EFA600',
    },
    doshaChip: {
        borderWidth: 1,
        borderColor: '#F15A61',
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    doshaText: {
        fontSize: 17,
        lineHeight: 20,
        fontWeight: '700',
        color: '#E85B5F',
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
