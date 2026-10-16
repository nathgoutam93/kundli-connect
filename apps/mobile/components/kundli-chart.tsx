import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Polygon, Rect } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { colors, fontFamily, palette, radius } from '@/constants/theme';
import { easings } from '@/lib/motion';
import { type ChartHouse } from '@/services/supabase-auth-service';

const AnimatedLine = Animated.createAnimatedComponent(Line);

/**
 * Where each house sits in a North Indian chart, as fractions of the square's side. Houses run
 * anticlockwise from the top diamond (house 1, the ascendant). `kind` sets how much room the
 * label has: the four diamonds are roomy, the eight triangles are not.
 */
const HOUSE_LAYOUT: Record<number, { x: number; y: number; signX: number; signY: number; kind: 'diamond' | 'triangle' }> = {
  1: { x: 0.5, y: 0.24, signX: 0.5, signY: 0.44, kind: 'diamond' },
  2: { x: 0.25, y: 0.085, signX: 0.25, signY: 0.2, kind: 'triangle' },
  3: { x: 0.09, y: 0.25, signX: 0.2, signY: 0.25, kind: 'triangle' },
  4: { x: 0.24, y: 0.5, signX: 0.44, signY: 0.5, kind: 'diamond' },
  5: { x: 0.09, y: 0.75, signX: 0.2, signY: 0.75, kind: 'triangle' },
  6: { x: 0.25, y: 0.915, signX: 0.25, signY: 0.8, kind: 'triangle' },
  7: { x: 0.5, y: 0.76, signX: 0.5, signY: 0.56, kind: 'diamond' },
  8: { x: 0.75, y: 0.915, signX: 0.75, signY: 0.8, kind: 'triangle' },
  9: { x: 0.91, y: 0.75, signX: 0.8, signY: 0.75, kind: 'triangle' },
  10: { x: 0.76, y: 0.5, signX: 0.56, signY: 0.5, kind: 'diamond' },
  11: { x: 0.91, y: 0.25, signX: 0.8, signY: 0.25, kind: 'triangle' },
  12: { x: 0.75, y: 0.085, signX: 0.75, signY: 0.2, kind: 'triangle' },
};

type KundliChartProps = {
  houses: ChartHouse[];
  /** Shown under the chart, e.g. "Birth chart (D1)". */
  caption?: string;
};

/**
 * North Indian Kundli drawn from house data: the lines draw themselves in, then the planets
 * appear house by house. Numbers in each house are the sign (1 = Aries … 12 = Pisces).
 */
export function KundliChart({ houses, caption }: KundliChartProps) {
  const [size, setSize] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setSize(event.nativeEvent.layout.width);
  }

  const description = houses
    .map((house) => {
      const planets = house.planets.map((planet) => planet.name).join(', ');
      return `House ${house.house}, ${house.signName}${planets ? `: ${planets}` : ''}`;
    })
    .join('. ');

  return (
    <View style={styles.wrap}>
      <View
        style={styles.square}
        onLayout={handleLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Kundli chart. ${description}`}>
        {size > 0 ? <ChartLines size={size} /> : null}
        {size > 0
          ? houses.map((house, index) => <HouseLabel key={house.house} house={house} size={size} order={index} />)
          : null}
      </View>
      {caption ? (
        <AppText variant="overline" color={colors.textFaint} align="center">
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

function ChartLines({ size }: { size: number }) {
  const progress = useSharedValue(0);
  const s = size;
  const diagonal = Math.SQRT2 * s;
  const diamondEdge = (Math.SQRT2 * s) / 2;

  useEffect(() => {
    progress.value = withDelay(100, withTiming(1, { duration: 900, easing: easings.out }));
  }, [progress]);

  const diagonalProps = useAnimatedProps(() => ({ strokeDashoffset: diagonal * (1 - progress.value) }));
  const diamondProps = useAnimatedProps(() => ({ strokeDashoffset: diamondEdge * (1 - progress.value) }));

  const diagonals = [
    [0, 0, s, s],
    [s, 0, 0, s],
  ];
  const diamond = [
    [s / 2, 0, s, s / 2],
    [s, s / 2, s / 2, s],
    [s / 2, s, 0, s / 2],
    [0, s / 2, s / 2, 0],
  ];

  return (
    <Svg width={s} height={s} style={StyleSheet.absoluteFill}>
      {/* The ascendant's house gets a faint gold wash. */}
      <Polygon points={`${s / 4},${s / 4} ${s / 2},0 ${(3 * s) / 4},${s / 4} ${s / 2},${s / 2}`} fill={colors.accentSoft} />
      <Rect x={0.5} y={0.5} width={s - 1} height={s - 1} rx={radius.md} stroke={colors.accentLine} strokeWidth={1} fill="none" />
      {diagonals.map(([x1, y1, x2, y2], index) => (
        <AnimatedLine
          key={`d${index}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={colors.accentLine}
          strokeWidth={1}
          strokeDasharray={`${diagonal} ${diagonal}`}
          animatedProps={diagonalProps}
        />
      ))}
      {diamond.map(([x1, y1, x2, y2], index) => (
        <AnimatedLine
          key={`m${index}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={colors.accentLine}
          strokeWidth={1}
          strokeDasharray={`${diamondEdge} ${diamondEdge}`}
          animatedProps={diamondProps}
        />
      ))}
    </Svg>
  );
}

function HouseLabel({ house, size, order }: { house: ChartHouse; size: number; order: number }) {
  const layout = HOUSE_LAYOUT[house.house];
  if (!layout) {
    return null;
  }

  const boxWidth = size * (layout.kind === 'diamond' ? 0.3 : 0.22);
  const boxHeight = size * (layout.kind === 'diamond' ? 0.22 : 0.15);
  // Triangles are tight: two planets per row there, one per row in the diamonds.
  const perRow = layout.kind === 'diamond' ? 1 : 2;
  const rows: ChartHouse['planets'][] = [];
  for (let index = 0; index < house.planets.length; index += perRow) {
    rows.push(house.planets.slice(index, index + perRow));
  }
  const isAscendant = house.house === 1;
  const delay = 500 + order * 45;

  return (
    <>
      <Animated.View
        entering={FadeIn.delay(delay).duration(350)}
        pointerEvents="none"
        style={[styles.sign, { left: layout.signX * size - 10, top: layout.signY * size - 8 }]}>
        <AppText style={[styles.signText, isAscendant && styles.signTextAscendant]}>{house.sign}</AppText>
      </Animated.View>
      <Animated.View
        entering={FadeIn.delay(delay + 120).duration(400)}
        pointerEvents="none"
        style={[
          styles.house,
          {
            width: boxWidth,
            height: boxHeight,
            left: layout.x * size - boxWidth / 2,
            top: layout.y * size - boxHeight / 2,
          },
        ]}>
        {isAscendant ? <AppText style={styles.ascendant}>Asc</AppText> : null}
        {rows.map((row, rowIndex) => (
          <AppText key={rowIndex} style={styles.planetRow} numberOfLines={1}>
            {row.map((planet, planetIndex) => (
              <AppText key={planet.name} style={styles.planetRow}>
                {planetIndex > 0 ? ' ' : ''}
                <AppText style={styles.planet}>{planet.abbr}</AppText>
                {planet.degree ? <AppText style={styles.degree}>{planet.degree}</AppText> : null}
              </AppText>
            ))}
          </AppText>
        ))}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  square: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  sign: {
    position: 'absolute',
    width: 20,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textFaint,
  },
  signTextAscendant: {
    color: colors.accent,
  },
  house: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ascendant: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  planetRow: {
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
  planet: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 15,
    color: colors.text,
  },
  degree: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    lineHeight: 15,
    color: palette.gold300,
  },
});
