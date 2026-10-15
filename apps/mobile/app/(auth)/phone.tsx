import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import CountryPicker, { Country, CountryCode } from 'react-native-country-picker-modal';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { TextField } from '@/components/ui/text-field';
import { colors, fontFamily, gutter, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

const COUNTRY_PICKER_THEME = {
    primaryColor: colors.accent,
    primaryColorVariant: colors.border,
    backgroundColor: colors.background,
    onBackgroundTextColor: colors.text,
    filterPlaceholderTextColor: colors.textFaint,
    fontFamily: fontFamily.body,
    fontSize: 16,
};

const OTP_LENGTH = 6;

function countryCodeToFlagEmoji(code: string) {
    return code
        .toUpperCase()
        .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function splitStoredPhone(rawPhone: string) {
    const value = rawPhone.trim();

    if (value.startsWith('+91')) {
        return {
            callingCode: '91',
            localPhone: value.slice(3).replace(/\D/g, ''),
        };
    }

    if (value.startsWith('+1')) {
        return {
            callingCode: '1',
            localPhone: value.slice(2).replace(/\D/g, ''),
        };
    }

    const match = value.match(/^\+(\d{1,4})(\d+)$/);

    if (!match) {
        return {
            callingCode: '91',
            localPhone: value.replace(/\D/g, ''),
        };
    }

    return {
        callingCode: match[1],
        localPhone: match[2],
    };
}

export default function PhoneScreen() {
    const { completeOtpLogin, isServiceBusy, profile, requestOtp, serviceError, setPhoneNumber } = useAppData();
    const parsedPhone = useMemo(() => splitStoredPhone(profile.phoneNumber), [profile.phoneNumber]);
    const phoneInputRef = useRef<TextInput>(null);
    const otpInputRef = useRef<TextInput>(null);
    const [countryCode, setCountryCode] = useState<CountryCode>('IN');
    const [callingCode, setCallingCode] = useState(parsedPhone.callingCode);
    const [phone, setPhone] = useState(parsedPhone.localPhone);
    const [otp, setOtp] = useState('');
    const [otpPhoneNumber, setOtpPhoneNumber] = useState('');
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [showOtp, setShowOtp] = useState(false);
    const [countryPickerVisible, setCountryPickerVisible] = useState(false);
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const isVerifyingRef = useRef(false);

    useFocusEffect(
        useCallback(() => {
            const timer = setTimeout(() => {
                phoneInputRef.current?.focus();
            }, 250);

            return () => clearTimeout(timer);
        }, [])
    );

    useEffect(() => {
        if (!showOtp) {
            return;
        }

        otpInputRef.current?.focus();
    }, [showOtp]);

    useEffect(() => {
        if (!showOtp) {
            return;
        }

        if (secondsLeft <= 0) {
            return;
        }

        const timer = setTimeout(() => {
            setSecondsLeft((value) => value - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [secondsLeft, showOtp]);

    useEffect(() => {
        if (!showOtp) {
            return;
        }

        if (otp.length !== OTP_LENGTH) {
            return;
        }

        if (!otpPhoneNumber || isVerifyingRef.current) {
            return;
        }

        isVerifyingRef.current = true;
        setIsVerifying(true);
        completeOtpLogin(otp, otpPhoneNumber)
            .then(() => {
                router.replace('/');
            })
            .catch(() => setOtp(''))
            .finally(() => {
                isVerifyingRef.current = false;
                setIsVerifying(false);
            });
    }, [completeOtpLogin, otp, otp.length, otpPhoneNumber, showOtp]);

    async function resendCode() {
        if (secondsLeft > 0) {
            return;
        }

        const sanitizedLocalPhone = phone.replace(/\D/g, '');
        const nextPhoneNumber = sanitizedLocalPhone ? `+${callingCode}${sanitizedLocalPhone}` : '';
        if (!nextPhoneNumber) {
            return;
        }

        setPhoneNumber(nextPhoneNumber);
        await requestOtp(nextPhoneNumber);
        setOtpPhoneNumber(nextPhoneNumber);
        setOtp('');
        setSecondsLeft(42);
    }

    function onCountrySelect(country: Country) {
        setCountryCode(country.cca2);
        setCallingCode(country.callingCode?.[0] ?? '91');
    }

    function onPhoneChange(value: string) {
        setPhone(value.replace(/\D/g, ''));
    }

    async function onContinue() {
        if (!phone.trim() || isSendingOtp) {
            return;
        }

        const sanitizedLocalPhone = phone.replace(/\D/g, '');
        const nextPhoneNumber = sanitizedLocalPhone ? `+${callingCode}${sanitizedLocalPhone}` : '';
        if (!nextPhoneNumber) {
            return;
        }

        setPhoneNumber(nextPhoneNumber);
        setIsSendingOtp(true);

        try {
            await requestOtp(nextPhoneNumber);
            setOtpPhoneNumber(nextPhoneNumber);
            setShowOtp(true);
            setOtp('');
            setSecondsLeft(42);
        } finally {
            setIsSendingOtp(false);
        }
    }

    const canContinue = Boolean(phone.trim()) && !isSendingOtp && !isServiceBusy;

    return (
        <Screen>
            <ScreenHeader
                onBack={() => {
                    if (showOtp) {
                        setShowOtp(false);
                        setOtp('');
                        phoneInputRef.current?.focus();
                        return;
                    }
                    router.back();
                }}
            />
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.headerSection}>
                    <AppText variant="overline" color={colors.accent}>
                        {showOtp ? 'Step 2 of 2' : 'Step 1 of 2'}
                    </AppText>
                    <AppText variant="title1">
                        {showOtp ? 'Enter the code we sent' : 'What\'s your phone number?'}
                    </AppText>
                    <AppText variant="callout" color={colors.textMuted}>
                        {showOtp
                            ? `A ${OTP_LENGTH}-digit code is on its way to ${otpPhoneNumber}.`
                            : 'We only use it to verify it\'s you. It never appears on your profile.'}
                    </AppText>
                </View>

                {!showOtp ? (
                    <View style={styles.form}>
                        <TextField
                            ref={phoneInputRef}
                            autoFocus
                            value={phone}
                            onChangeText={onPhoneChange}
                            placeholder="Phone number"
                            keyboardType="number-pad"
                            returnKeyType="done"
                            onSubmitEditing={onContinue}
                            leading={
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Choose country code"
                                    style={styles.countryCode}
                                    onPress={() => setCountryPickerVisible(true)}>
                                    <AppText variant="bodyStrong">
                                        {`${countryCodeToFlagEmoji(countryCode)} +${callingCode}`}
                                    </AppText>
                                    <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                                </Pressable>
                            }
                        />
                        <Button
                            label={isSendingOtp ? 'Sending code' : 'Send code'}
                            onPress={onContinue}
                            disabled={!canContinue}
                            loading={isSendingOtp}
                        />
                    </View>
                ) : (
                    <View style={styles.form}>
                        <Pressable
                            style={styles.otpRow}
                            disabled={isVerifying}
                            onPress={() => otpInputRef.current?.focus()}>
                            {Array.from({ length: OTP_LENGTH }).map((_, index) => {
                                const value = otp[index] ?? '';
                                const isFilled = Boolean(value);
                                const isActive = index === otp.length && otp.length < OTP_LENGTH;

                                return (
                                    <View
                                        key={`otp-box-${index}`}
                                        style={[
                                            styles.otpBox,
                                            isFilled && styles.otpBoxFilled,
                                            isActive && styles.otpBoxActive,
                                        ]}>
                                        <AppText variant="title2" color={colors.text}>
                                            {value}
                                        </AppText>
                                    </View>
                                );
                            })}
                            <TextInput
                                ref={otpInputRef}
                                value={otp}
                                onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                                editable={!isVerifying}
                                keyboardType="number-pad"
                                maxLength={OTP_LENGTH}
                                textContentType="oneTimeCode"
                                style={styles.hiddenOtpInput}
                            />
                        </Pressable>

                        {isVerifying ? (
                            <View
                                accessibilityLiveRegion="polite"
                                accessibilityRole="progressbar"
                                style={styles.verifyingRow}>
                                <ActivityIndicator size="small" color={colors.accent} />
                                <AppText variant="subhead" color={colors.textMuted}>
                                    Verifying code
                                </AppText>
                            </View>
                        ) : secondsLeft > 0 ? (
                            <AppText variant="subhead" color={colors.textMuted} align="center">
                                Resend code in{' '}
                                <AppText variant="subhead" color={colors.accent}>
                                    {secondsLeft}s
                                </AppText>
                            </AppText>
                        ) : (
                            <Button
                                label="Resend code"
                                variant="ghost"
                                size="md"
                                onPress={resendCode}
                                disabled={isServiceBusy}
                            />
                        )}
                    </View>
                )}
                {serviceError ? (
                    <AppText variant="footnote" color={colors.danger}>
                        {serviceError}
                    </AppText>
                ) : null}
            </KeyboardAvoidingView>

            <CountryPicker
                countryCode={countryCode}
                withFlagButton={false}
                withFilter
                withFlag
                withCallingCode
                withEmoji
                withAlphaFilter
                theme={COUNTRY_PICKER_THEME}
                visible={countryPickerVisible}
                onClose={() => setCountryPickerVisible(false)}
                onSelect={onCountrySelect}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: gutter,
        paddingTop: space.xl,
        gap: space.xxl,
    },
    headerSection: {
        gap: space.xs,
    },
    form: {
        gap: space.md,
    },
    countryCode: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingRight: space.sm,
        marginRight: space.xxs,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        alignSelf: 'stretch',
    },
    otpRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: space.xs,
    },
    otpBox: {
        flex: 1,
        maxWidth: 52,
        aspectRatio: 0.86,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
    },
    otpBoxFilled: {
        borderColor: colors.accentLine,
        backgroundColor: colors.accentSoft,
    },
    otpBoxActive: {
        borderColor: colors.accent,
    },
    verifyingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
    },
    hiddenOtpInput: {
        position: 'absolute',
        opacity: 0,
        width: 1,
        height: 1,
    },
});
