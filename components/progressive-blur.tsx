import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Easing, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { easeGradient } from 'react-native-easing-gradient';

const { colors, locations } = easeGradient({
    colorStops: {
        0: { color: 'rgba(0, 0, 0, 1)' },
        1: { color: 'transparent' },
    },
    easing: Easing.out(Easing.cubic),
    extraColorStopsPerTransition: 18,
});

type ProgressiveBlurProps = {
    intensity?: number;
    style?: StyleProp<ViewStyle>;
};

export function ProgressiveBlur({ intensity = 100, style }: ProgressiveBlurProps) {
    return (
        <MaskedView
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, style]}
            maskElement={
                <LinearGradient
                    colors={colors}
                    locations={locations}
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                />
            }>
            <BlurView
                intensity={intensity}
                style={[StyleSheet.absoluteFill]}
            />
        </MaskedView>
    );
}
