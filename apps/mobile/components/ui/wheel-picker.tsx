import BaseWheelPicker, { type PickerItem, type WheelPickerProps as BaseProps } from '@quidone/react-native-wheel-picker';

type Item = PickerItem<string>;

type WheelPickerProps = Omit<BaseProps<Item>, 'onValueChanged'> & {
  onValueChanged: (value: string) => void;
};

/**
 * The wheel picker, minus a crash: when its data changes or empties while the wheel is still
 * coasting (e.g. a sheet closing mid-scroll), the library reports the settled index against the
 * new data and passes an undefined item. Those events are dropped here.
 *
 * Give the picker a `key` that changes with its data set so each set starts with fresh scroll
 * state.
 */
export function WheelPicker({ onValueChanged, ...props }: WheelPickerProps) {
  return (
    <BaseWheelPicker<Item>
      {...props}
      onValueChanged={({ item }) => {
        if (item && props.data.some((option) => option.value === item.value)) {
          onValueChanged(item.value);
        }
      }}
    />
  );
}
