import { Ionicons } from '@expo/vector-icons';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '@/hooks/use-app-data';

type HeightUnit = 'ft' | 'cm';

const ITEM_HEIGHT = 58;
const VISIBLE_ITEMS = 5;

const FOOT_HEIGHTS = Array.from({ length: 55 }, (_, index) => {
    const totalInches = 36 + index;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}' ${inches}"`;
});

const CM_HEIGHTS = Array.from({ length: 141 }, (_, index) => `${90 + index} cm`);

export default function HeightScreen() {
    const { profile, updateProfile } = useAppData();
    const initialUnit: HeightUnit = profile.height?.includes('cm') ? 'cm' : 'ft';
    const [unit, setUnit] = useState<HeightUnit>(initialUnit);
    const [feetHeight, setFeetHeight] = useState(profile.height && !profile.height.includes('cm') ? profile.height : '');
    const [cmHeight, setCmHeight] = useState(profile.height?.includes('cm') ? profile.height : '');
    const heightOptions = useMemo(
        () => (unit === 'ft' ? FOOT_HEIGHTS : CM_HEIGHTS).map((value) => ({ value, label: value })),
        [unit]
    );
    const selectedHeight = unit === 'ft' ? feetHeight : cmHeight;
    const selectedValue = heightOptions.find((option) => option.value === selectedHeight)?.value ?? heightOptions[0]?.value ?? '';
    const isValid = Boolean(selectedValue);

    function selectHeight(value: string) {
        if (unit === 'ft') {
            setFeetHeight(value);
        } else {
            setCmHeight(value);
        }
    }

    function handleContinue() {
        if (!selectedValue) {
            return;
        }

        updateProfile({ height: selectedValue });
        router.push('/(onboarding)/work');
    }

    return (
        <View style={styles.container}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={27} color="#111111" />
            </Pressable>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}>
                <Text style={styles.title}>How Tall are you?</Text>

                <View style={styles.pickerFrame}>
                    <WheelPicker
                        data={heightOptions}
                        value={selectedValue}
                        itemHeight={ITEM_HEIGHT}
                        visibleItemCount={VISIBLE_ITEMS}
                        enableScrollByTapOnItem
                        onValueChanged={({ item }) => selectHeight(item.value)}
                        width="100%"
                        style={styles.picker}
                        itemTextStyle={styles.heightText}
                        overlayItemStyle={styles.centerSelection}
                    />
                </View>
            </ScrollView>

            <View style={styles.segmentedControl}>
                <Pressable
                    style={[styles.segment, unit === 'ft' && styles.selectedSegment]}
                    onPress={() => setUnit('ft')}>
                    <Text style={[styles.segmentText, unit === 'ft' && styles.selectedSegmentText]}>Feet</Text>
                </Pressable>
                <Pressable
                    style={[styles.segment, unit === 'cm' && styles.selectedSegment]}
                    onPress={() => setUnit('cm')}>
                    <Text style={[styles.segmentText, unit === 'cm' && styles.selectedSegmentText]}>Cm</Text>
                </Pressable>
            </View>

            <Pressable
                style={[styles.nextButton, !isValid && styles.nextButtonDisabled]}
                onPress={handleContinue}
                disabled={!isValid}>
                <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFCF7',
    },
    backButton: {
        position: 'absolute',
        zIndex: 2,
        top: 85,
        left: 28,
        width: 47,
        height: 47,
        borderRadius: 24,
        backgroundColor: '#FFFCF7',
        borderWidth: 1,
        borderColor: '#FBD06D',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#FCAD00',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.2,
        shadowRadius: 9,
        elevation: 4,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 28,
        paddingTop: 155,
        paddingBottom: 128,
    },
    title: {
        maxWidth: 380,
        fontSize: 38,
        lineHeight: 44,
        fontWeight: '500',
        color: '#050505',
        textAlign: 'center'
    },
    segmentedControl: {
        position: 'absolute',
        left: '50%',
        bottom: 140,
        marginLeft: -96,
        width: 192,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        borderColor: '#FFC400',
        backgroundColor: '#FFF8E8',
        flexDirection: 'row',
        padding: 3,
    },
    segment: {
        flex: 1,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectedSegment: {
        backgroundColor: '#FFD829',
    },
    segmentText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#8C8478',
    },
    selectedSegmentText: {
        color: '#050505',
    },
    pickerFrame: {
        marginTop: 80,
        overflow: 'hidden',
    },
    picker: {
        width: '100%',
    },
    centerSelection: {
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#FCAD00',
        backgroundColor: '#FFF8E8',
    },
    heightText: {
        fontSize: 31,
        lineHeight: 37,
        fontWeight: '600',
        color: '#2D2A26',
    },
    nextButton: {
        position: 'absolute',
        right: 19,
        bottom: 40,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FCAD00',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextButtonDisabled: {
        opacity: 0.45,
    },
});
