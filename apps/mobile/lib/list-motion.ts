import { FadeInDown, FadeOutLeft, LinearTransition } from 'react-native-reanimated';

/** Rows past this index appear together, so long lists don't trickle in. */
const MAX_STAGGERED = 6;

/** Entrance for the nth row of a list: fade and rise, staggered. */
export function listItemEntering(index: number) {
  return FadeInDown.delay(Math.min(index, MAX_STAGGERED) * 55)
    .springify()
    .damping(18)
    .stiffness(180);
}

/** Exit for a row that is removed (dismissed like, hidden chat). */
export const listItemExiting = FadeOutLeft.duration(220);

/** Lets the remaining rows glide into the gap. */
export const listItemLayout = LinearTransition.springify().damping(20).stiffness(200);
