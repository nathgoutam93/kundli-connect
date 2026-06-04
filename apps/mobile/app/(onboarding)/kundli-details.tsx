import { Ionicons } from '@expo/vector-icons';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/hooks/use-app-data';

const MIN_BIRTH_YEAR = 1900;
const FALLBACK_BIRTH_YEAR = 2000;
const ITEM_HEIGHT = 46;
const VISIBLE_ITEMS = 5;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ActivePicker = {
    group: 'date' | 'time';
    index: number;
};

function splitStoredDate(value: string) {
    const [day = '', month = '', year = ''] = value.split('-');
    return [day, month, year];
}

function splitStoredTime(value: string) {
    const [hour = '', minute = '', second = ''] = value.split(':');
    return [hour, minute, second];
}

function pad2(value: number) {
    return String(value).padStart(2, '0');
}

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
}

function getMaxMonth(year: number) {
    const today = new Date();
    return year === today.getFullYear() ? today.getMonth() + 1 : 12;
}

function getMaxDay(year: number, month: number) {
    const today = new Date();

    if (year === today.getFullYear() && month === today.getMonth() + 1) {
        return today.getDate();
    }

    return getDaysInMonth(year, month);
}

function isValidDate(day: string, month: string, year: string) {
    if (day.length !== 2 || month.length !== 2 || year.length !== 4) {
        return false;
    }

    const numericDay = Number(day);
    const numericMonth = Number(month);
    const numericYear = Number(year);
    const date = new Date(numericYear, numericMonth - 1, numericDay);
    const today = new Date();

    return (
        date.getFullYear() === numericYear &&
        date.getMonth() === numericMonth - 1 &&
        date.getDate() === numericDay &&
        date <= today
    );
}

function isValidTime(hour: string, minute: string, second: string) {
    if (hour.length !== 2 || minute.length !== 2 || second.length !== 2) {
        return false;
    }

    const numericHour = Number(hour);
    const numericMinute = Number(minute);
    const numericSecond = Number(second);

    return (
        numericHour >= 0 &&
        numericHour <= 23 &&
        numericMinute >= 0 &&
        numericMinute <= 59 &&
        numericSecond >= 0 &&
        numericSecond <= 59
    );
}

function buildNumberOptions(start: number, end: number, pad = true) {
    return Array.from({ length: end - start + 1 }, (_, index) => {
        const value = start + index;
        const label = pad ? pad2(value) : String(value);

        return { value: label, label };
    });
}

function buildMonthOptions(end: number) {
    return Array.from({ length: end }, (_, index) => ({
        value: pad2(index + 1),
        label: MONTH_LABELS[index],
    }));
}

function getMonthLabel(value: string) {
    return MONTH_LABELS[Number(value) - 1] ?? value;
}

type GroupedInputRowProps = {
    values: string[];
    onPressPart: (index: number) => void;
    showSeparator?: boolean;
    separatorChar?: string;
    wideLastInput?: boolean;
};

function GroupedInputRow({
    values,
    onPressPart,
    showSeparator = false,
    separatorChar = ':',
    wideLastInput = false,
}: GroupedInputRowProps) {
    return (
        <View style={styles.groupRow}>
            {values.map((value, index) => (
                <View
                    key={`${value}-${index}`}
                    style={[
                        styles.groupPart,
                        wideLastInput && index === values.length - 1
                            ? styles.groupPartYear
                            : styles.groupPartShort,
                    ]}>
                    <Pressable
                        style={styles.inputBox}
                        onPress={() => onPressPart(index)}>
                        <Text style={styles.inputBoxText}>{value}</Text>
                    </Pressable>
                    {showSeparator && index < values.length - 1 ? (
                        <Text style={styles.separator}>{separatorChar}</Text>
                    ) : null}
                </View>
            ))}
        </View>
    );
}

function getInitialDateParts(value: string) {
    const [day, month, year] = splitStoredDate(value);

    if (isValidDate(day, month, year)) {
        return [day, month, year];
    }

    return ['01', '01', String(FALLBACK_BIRTH_YEAR)];
}

function getInitialTimeParts(value: string) {
    const [hour, minute, second] = splitStoredTime(value);
    const nextParts = [hour || '00', minute || '00', second || '00'];

    if (isValidTime(nextParts[0], nextParts[1], nextParts[2])) {
        return nextParts;
    }

    return ['00', '00', '00'];
}

export default function KundliDetailsScreen() {
    const { profile, updateProfile } = useAppData();
    const [dobParts, setDobParts] = useState(() => getInitialDateParts(profile.dateOfBirth));
    const [timeParts, setTimeParts] = useState(() => getInitialTimeParts(profile.timeOfBirth));
    const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);
    const [selectedDay, selectedMonth, selectedYear] = dobParts;
    const selectedYearNumber = Number(selectedYear);
    const selectedMonthNumber = Number(selectedMonth);
    const selectedDayNumber = Number(selectedDay);
    const currentYear = new Date().getFullYear();
    const dayOptions = useMemo(
        () => buildNumberOptions(1, getMaxDay(selectedYearNumber, selectedMonthNumber)),
        [selectedMonthNumber, selectedYearNumber]
    );
    const monthOptions = useMemo(
        () => buildMonthOptions(getMaxMonth(selectedYearNumber)),
        [selectedYearNumber]
    );
    const yearOptions = useMemo(
        () => buildNumberOptions(MIN_BIRTH_YEAR, currentYear, false).reverse(),
        [currentYear]
    );
    const hourOptions = useMemo(() => buildNumberOptions(0, 23), []);
    const minuteSecondOptions = useMemo(() => buildNumberOptions(0, 59), []);
    const displayedDobParts = [selectedDay, getMonthLabel(selectedMonth), selectedYear];

    const isFormValid = useMemo(
        () =>
            isValidDate(dobParts[0], dobParts[1], dobParts[2]) &&
            isValidTime(timeParts[0], timeParts[1], timeParts[2]),
        [dobParts, timeParts]
    );

    function updateDate(nextDay: number, nextMonth: number, nextYear: number) {
        const clampedMonth = Math.min(nextMonth, getMaxMonth(nextYear));
        const clampedDay = Math.min(nextDay, getMaxDay(nextYear, clampedMonth));

        setDobParts([pad2(clampedDay), pad2(clampedMonth), String(nextYear)]);
    }

    function updateTimePart(index: number, value: string) {
        setTimeParts((current) => {
            const next = [...current];
            next[index] = value;
            return next;
        });
    }

    function getActivePickerTitle() {
        if (!activePicker) {
            return '';
        }

        if (activePicker.group === 'date') {
            return ['Select Day', 'Select Month', 'Select Year'][activePicker.index] ?? '';
        }

        return ['Select Hour', 'Select Minute', 'Select Second'][activePicker.index] ?? '';
    }

    function getActivePickerOptions() {
        if (!activePicker) {
            return [];
        }

        if (activePicker.group === 'date') {
            return [dayOptions, monthOptions, yearOptions][activePicker.index] ?? [];
        }

        return activePicker.index === 0 ? hourOptions : minuteSecondOptions;
    }

    function getActivePickerValue() {
        if (!activePicker) {
            return '';
        }

        if (activePicker.group === 'date') {
            return activePicker.index === 0
                ? pad2(Math.min(selectedDayNumber, getMaxDay(selectedYearNumber, selectedMonthNumber)))
                : activePicker.index === 1
                  ? pad2(Math.min(selectedMonthNumber, getMaxMonth(selectedYearNumber)))
                  : selectedYear;
        }

        return timeParts[activePicker.index];
    }

    function updateActivePickerValue(value: string) {
        if (!activePicker) {
            return;
        }

        if (activePicker.group === 'date') {
            if (activePicker.index === 0) {
                updateDate(Number(value), selectedMonthNumber, selectedYearNumber);
            } else if (activePicker.index === 1) {
                updateDate(selectedDayNumber, Number(value), selectedYearNumber);
            } else {
                updateDate(selectedDayNumber, selectedMonthNumber, Number(value));
            }

            return;
        }

        updateTimePart(activePicker.index, value);
    }

    function handleContinue() {
        if (!isFormValid) {
            return;
        }

        updateProfile({
            dateOfBirth: dobParts.join('-'),
            timeOfBirth: timeParts.join(':'),
        });

        router.push('/(onboarding)/birth-location');
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.keyboardContainer}>
                <Pressable style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={27} color="#111111" />
                </Pressable>

                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}>
                    <View>
                        <Text style={styles.title}>Kundli Details</Text>
                        <Text style={styles.subtitle}>
                            Please input the correct details, it cannot be changed once generated.
                        </Text>
                    </View>

                    <View style={styles.panel}>
                        <View style={styles.section}>
                            <Text style={styles.heading}>Your Date Of Birth</Text>
                            <GroupedInputRow
                                values={displayedDobParts}
                                onPressPart={(index) => setActivePicker({ group: 'date', index })}
                                showSeparator
                                separatorChar="-"
                                wideLastInput
                            />
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.heading}>Your Birth Time</Text>
                            <Text style={styles.subheading}>Please enter birth time in 24h format</Text>
                            <GroupedInputRow
                                values={timeParts}
                                onPressPart={(index) => setActivePicker({ group: 'time', index })}
                                showSeparator
                                separatorChar=":"
                            />
                        </View>
                    </View>
                </ScrollView>

                <Pressable
                    style={[styles.nextButton, !isFormValid && styles.nextButtonDisabled]}
                    onPress={handleContinue}
                    disabled={!isFormValid}>
                    <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
                </Pressable>

                <Modal
                    transparent
                    animationType="slide"
                    visible={Boolean(activePicker)}
                    onRequestClose={() => setActivePicker(null)}>
                    <Pressable style={styles.sheetBackdrop} onPress={() => setActivePicker(null)} />
                    <View style={styles.sheet}>
                        <View style={styles.sheetHandle} />
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>{getActivePickerTitle()}</Text>
                            <Pressable style={styles.sheetDoneButton} onPress={() => setActivePicker(null)}>
                                <Text style={styles.sheetDoneText}>Done</Text>
                            </Pressable>
                        </View>
                        <View style={styles.singlePickerFrame}>
                            <WheelPicker
                                data={getActivePickerOptions()}
                                value={getActivePickerValue()}
                                itemHeight={ITEM_HEIGHT}
                                visibleItemCount={VISIBLE_ITEMS}
                                enableScrollByTapOnItem
                                onValueChanged={({ item }) => updateActivePickerValue(item.value)}
                                width="100%"
                                style={styles.singlePicker}
                                itemTextStyle={styles.pickerText}
                                overlayItemStyle={styles.centerSelection}
                            />
                        </View>
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },
    keyboardContainer: {
        flex: 1,
        paddingHorizontal: 26,
        paddingTop: 22,
        paddingBottom: 34,
    },
    backButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#F2B53B',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 13,
        elevation: 3,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        marginTop: 22,
        paddingBottom: 34,
        gap: 29,
    },
    title: {
        fontSize: 38,
        lineHeight: 44,
        fontWeight: '600',
        color: '#070707',
    },
    subtitle: {
        marginTop: 8,
        maxWidth: 340,
        fontSize: 17,
        lineHeight: 23,
        color: '#92929A',
    },
    panel: {
        backgroundColor: '#FFFFFF',
        gap: 48,
    },
    section: {
        gap: 18,
    },
    heading: {
        fontSize: 24,
        lineHeight: 24,
        fontWeight: '700',
        color: '#080808',
    },
    subheading: {
        fontSize: 14,
        lineHeight: 16,
        fontWeight: '500',
        color: '#080808',
    },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        flexWrap: 'nowrap',
        width: '100%',
    },
    groupPart: {
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
    },
    groupPartShort: {
        flex: 1,
    },
    groupPartYear: {
        flex: 1.45,
    },
    inputBox: {
        flex: 1,
        height: 64,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#E4E4EA',
        backgroundColor: '#FBFBFC',
        paddingHorizontal: 6,
        minWidth: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inputBoxText: {
        fontSize: 24,
        lineHeight: 28,
        fontWeight: '700',
        color: '#111111',
    },
    separator: {
        width: 24,
        marginHorizontal: 4,
        fontSize: 34,
        lineHeight: 40,
        fontWeight: '700',
        color: '#111111',
        textAlign: 'center',
    },
    pickerText: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: '700',
        color: '#111111',
    },
    sheetBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.28)',
    },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 26,
        paddingTop: 12,
        paddingBottom: 34,
    },
    sheetHandle: {
        alignSelf: 'center',
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#E4E4EA',
    },
    sheetHeader: {
        marginTop: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sheetTitle: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: '700',
        color: '#080808',
    },
    sheetDoneButton: {
        minWidth: 66,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#FCAD00',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    sheetDoneText: {
        fontSize: 15,
        lineHeight: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    singlePickerFrame: {
        height: ITEM_HEIGHT * VISIBLE_ITEMS,
        marginTop: 18,
        overflow: 'hidden',
    },
    singlePicker: {
        width: '100%',
    },
    centerSelection: {
        borderRadius: 12,
        backgroundColor: '#FFF4D8',
    },
    nextButton: {
        alignSelf: 'flex-end',
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: '#FCAD00',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextButtonDisabled: {
        opacity: 0.45,
    },
});
