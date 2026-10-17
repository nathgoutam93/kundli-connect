import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { AppText } from '@/components/ui/app-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WheelPicker } from '@/components/ui/wheel-picker';
import { colors, fontFamily, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { isAdultBirthDate, latestAdultBirthDate, MINIMUM_AGE } from '@/lib/age';

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

// The pickers stop at the latest birth date of someone who is already 18.
function getMaxYear() {
    return latestAdultBirthDate().getFullYear();
}

function getMaxMonth(year: number) {
    const latest = latestAdultBirthDate();
    return year >= latest.getFullYear() ? latest.getMonth() + 1 : 12;
}

function getMaxDay(year: number, month: number) {
    const latest = latestAdultBirthDate();

    if (year >= latest.getFullYear() && month >= latest.getMonth() + 1) {
        return latest.getDate();
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

    return (
        numericYear >= MIN_BIRTH_YEAR &&
        date.getFullYear() === numericYear &&
        date.getMonth() === numericMonth - 1 &&
        date.getDate() === numericDay &&
        isAdultBirthDate(numericYear, numericMonth, numericDay)
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
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.inputBox, pressed && styles.inputBoxPressed]}
                        onPress={() => onPressPart(index)}>
                        <AppText variant="title3">{value}</AppText>
                    </Pressable>
                    {showSeparator && index < values.length - 1 ? (
                        <AppText variant="title3" color={colors.textFaint}>
                            {separatorChar}
                        </AppText>
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
    const [dateConfirmed, setDateConfirmed] = useState(false);
    const [timeConfirmed, setTimeConfirmed] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    // Kept after closing so the sheet's exit animation still shows the same wheel.
    const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);
    const [selectedDay, selectedMonth, selectedYear] = dobParts;
    const selectedYearNumber = Number(selectedYear);
    const selectedMonthNumber = Number(selectedMonth);
    const selectedDayNumber = Number(selectedDay);
    const maxYear = getMaxYear();
    const dayOptions = useMemo(
        () => buildNumberOptions(1, getMaxDay(selectedYearNumber, selectedMonthNumber)),
        [selectedMonthNumber, selectedYearNumber]
    );
    const monthOptions = useMemo(
        () => buildMonthOptions(getMaxMonth(selectedYearNumber)),
        [selectedYearNumber]
    );
    const yearOptions = useMemo(
        () => buildNumberOptions(MIN_BIRTH_YEAR, maxYear, false).reverse(),
        [maxYear]
    );
    const hourOptions = useMemo(() => buildNumberOptions(0, 23), []);
    const minuteSecondOptions = useMemo(() => buildNumberOptions(0, 59), []);
    const displayedDobParts = [selectedDay, getMonthLabel(selectedMonth), selectedYear];

    const isFormValid = useMemo(
        () =>
            dateConfirmed && timeConfirmed && isValidDate(dobParts[0], dobParts[1], dobParts[2]) &&
            isValidTime(timeParts[0], timeParts[1], timeParts[2]),
        [dobParts, timeParts, dateConfirmed, timeConfirmed]
    );

    function updateDate(nextDay: number, nextMonth: number, nextYear: number) {
        setDateConfirmed(false);
        const clampedMonth = Math.min(nextMonth, getMaxMonth(nextYear));
        const clampedDay = Math.min(nextDay, getMaxDay(nextYear, clampedMonth));

        setDobParts([pad2(clampedDay), pad2(clampedMonth), String(nextYear)]);
    }

    function openPicker(picker: ActivePicker) {
        setActivePicker(picker);
        setIsPickerOpen(true);
    }

    function updateTimePart(index: number, value: string) {
        setTimeConfirmed(false);
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
            return ['Day of birth', 'Month of birth', 'Year of birth'][activePicker.index] ?? '';
        }

        return ['Hour', 'Minute', 'Second'][activePicker.index] ?? '';
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

    async function handleContinue() {
        if (!isFormValid) {
            return;
        }

        await updateProfile({
            dateOfBirth: dobParts.join('-'),
            timeOfBirth: timeParts.join(':'),
        });

        router.push('/(onboarding)/birth-location');
    }

    return (
        <OnboardingStep
            step="kundli-details"
            title="Your birth details"
            subtitle="Your Kundli is generated from these. Please double-check — they can’t be changed later."
            onContinue={handleContinue}
            canContinue={isFormValid}>
            <Card style={styles.panel}>
                <View style={styles.section}>
                    <View style={styles.sectionLabel}>
                        <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                        <AppText variant="overline" color={colors.textMuted}>
                            Date of birth
                        </AppText>
                    </View>
                    <GroupedInputRow
                        values={displayedDobParts}
                        onPressPart={(index) => openPicker({ group: 'date', index })}
                        showSeparator
                        separatorChar="·"
                        wideLastInput
                    />
                    <Button
                        label={dateConfirmed ? 'Birth date confirmed' : `Confirm ${displayedDobParts.join(' ')}`}
                        variant="ghost"
                        disabled={dateConfirmed}
                        onPress={() => setDateConfirmed(true)}
                    />
                </View>

                <View style={styles.divider} />

                <View style={styles.section}>
                    <View style={styles.sectionLabel}>
                        <Ionicons name="time-outline" size={16} color={colors.accent} />
                        <AppText variant="overline" color={colors.textMuted}>
                            Time of birth · 24h
                        </AppText>
                    </View>
                    <GroupedInputRow
                        values={timeParts}
                        onPressPart={(index) => openPicker({ group: 'time', index })}
                        showSeparator
                        separatorChar=":"
                    />
                    <Button
                        label={timeConfirmed ? 'Birth time confirmed' : `Confirm ${timeParts.join(':')}`}
                        variant="ghost"
                        disabled={timeConfirmed}
                        onPress={() => setTimeConfirmed(true)}
                    />
                </View>
            </Card>

            <View style={styles.tip}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textMuted} />
                <AppText variant="footnote" color={colors.textMuted} style={styles.tipText}>
                    Kundali Konnect is only for people aged {MINIMUM_AGE} or over.
                </AppText>
            </View>

            <View style={styles.tip}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                <AppText variant="footnote" color={colors.textMuted} style={styles.tipText}>
                    An accurate birth time makes your chart and compatibility scores far more precise. Check your
                    birth certificate if you can.
                </AppText>
            </View>

            <BottomSheet
                visible={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                title={getActivePickerTitle()}
                doneLabel="Done">
                <View style={styles.singlePickerFrame}>
                    <WheelPicker
                        key={activePicker ? `${activePicker.group}-${activePicker.index}` : 'none'}
                        data={getActivePickerOptions()}
                        value={getActivePickerValue()}
                        itemHeight={ITEM_HEIGHT}
                        visibleItemCount={VISIBLE_ITEMS}
                        enableScrollByTapOnItem
                        onValueChanged={updateActivePickerValue}
                        width="100%"
                        style={styles.singlePicker}
                        itemTextStyle={styles.pickerText}
                        overlayItemStyle={styles.centerSelection}
                    />
                </View>
            </BottomSheet>
        </OnboardingStep>
    );
}

const styles = StyleSheet.create({
    panel: {
        gap: space.lg,
    },
    section: {
        gap: space.sm,
    },
    sectionLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
    },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    groupPart: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    groupPartShort: {
        flex: 1,
    },
    groupPartYear: {
        flex: 1.4,
    },
    inputBox: {
        flex: 1,
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSunken,
    },
    inputBoxPressed: {
        borderColor: colors.accent,
    },
    tip: {
        flexDirection: 'row',
        gap: space.xs,
        paddingHorizontal: space.xxs,
    },
    tipText: {
        flex: 1,
    },
    singlePickerFrame: {
        overflow: 'hidden',
    },
    singlePicker: {
        width: '100%',
    },
    pickerText: {
        fontFamily: fontFamily.display,
        fontSize: 24,
        lineHeight: 30,
        color: colors.text,
    },
    centerSelection: {
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.accentLine,
        backgroundColor: colors.accentSoft,
    },
});
