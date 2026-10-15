import WheelPicker from '@quidone/react-native-wheel-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { colors, fontFamily, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

type HeightUnit = 'ft' | 'cm';

const ITEM_HEIGHT = 56;
const VISIBLE_ITEMS = 5;

const UNIT_OPTIONS = [
    { value: 'ft', label: 'Feet' },
    { value: 'cm', label: 'Centimetres' },
] as const;

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
        <OnboardingStep
            step="height"
            title="How tall are you?"
            onContinue={handleContinue}
            canContinue={isValid}
            scrollable={false}>
            <SegmentedControl options={UNIT_OPTIONS} value={unit} onChange={setUnit} />
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
        </OnboardingStep>
    );
}

const styles = StyleSheet.create({
    pickerFrame: {
        flex: 1,
        justifyContent: 'center',
        overflow: 'hidden',
        paddingBottom: space.xl,
    },
    picker: {
        width: '100%',
    },
    centerSelection: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.accentLine,
        backgroundColor: colors.accentSoft,
    },
    heightText: {
        fontFamily: fontFamily.display,
        fontSize: 30,
        lineHeight: 36,
        color: colors.text,
    },
});
