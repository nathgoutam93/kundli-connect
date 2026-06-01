import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import CountryPicker, { Country, CountryCode } from 'react-native-country-picker-modal';

import { useAppState } from '@/store/use-app-state';

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
    const { completeOtpLogin, isServiceBusy, profile, requestOtp, serviceError, setPhoneNumber } = useAppState();
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
        completeOtpLogin(otp, otpPhoneNumber)
            .then(() => {
                router.replace('/(onboarding)/basics');
            })
            .catch(() => setOtp(''))
            .finally(() => {
                isVerifyingRef.current = false;
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
        if (!phone.trim()) {
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
        setShowOtp(true);
        setOtp('');
        setSecondsLeft(42);
    }

    return (
        <View style={styles.container}>

            <View style={styles.headerSection}>
                <Text style={styles.title}>What&apos;s your phone number?</Text>
                <Text style={styles.subtitle}>we only ask to verify it&apos;s you. It won&apos;t be displayed anywhere, including your profile.</Text>

                <View style={styles.section}>
                    <View style={styles.phoneRow}>
                        <Pressable style={styles.countryCodeBox} onPress={() => setCountryPickerVisible(true)}>
                            <Text style={styles.countryCodeText}>
                                {`${countryCodeToFlagEmoji(countryCode)}  +${callingCode}`}
                            </Text>
                            <Ionicons name="chevron-down" size={14} color="#1A1A1A" />
                        </Pressable>
                        <View style={styles.phoneBox}>
                            <TextInput
                                ref={phoneInputRef}
                                autoFocus
                                value={phone}
                                onChangeText={onPhoneChange}
                                placeholder="Phone number"
                                placeholderTextColor="#A7A7A7"
                                keyboardType="number-pad"
                                returnKeyType="done"
                                style={styles.phoneTextInput}
                            />
                        </View>
                    </View>
                </View>

                {!showOtp ? (
                    <Pressable
                        onPress={onContinue}
                        disabled={!phone.trim() || isServiceBusy}
                        style={[styles.continueButton, (!phone.trim() || isServiceBusy) && styles.continueButtonDisabled]}>
                        <Text style={styles.continueButtonText}>{isServiceBusy ? 'Sending...' : 'Continue'}</Text>
                    </Pressable>
                ) : (
                    <>
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>Enter OTP</Text>
                        </View>

                        <Pressable style={styles.otpRow} onPress={() => otpInputRef.current?.focus()}>
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
                                            !isFilled && !isActive && styles.otpBoxMuted,
                                        ]}>
                                        <Text
                                            style={[
                                                styles.otpText,
                                                isFilled && styles.otpTextFilled,
                                                isActive && styles.otpTextActive,
                                                !isFilled && !isActive && styles.otpTextMuted,
                                            ]}>
                                            {value || '0'}
                                        </Text>
                                    </View>
                                );
                            })}
                            <TextInput
                                ref={otpInputRef}
                                value={otp}
                                onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                                keyboardType="number-pad"
                                maxLength={OTP_LENGTH}
                                textContentType="oneTimeCode"
                                style={styles.hiddenOtpInput}
                            />
                        </Pressable>

                        <Pressable onPress={resendCode} disabled={secondsLeft > 0 || isServiceBusy}>
                            <Text style={styles.resendText}>
                                You can resend code in <Text style={styles.resendHighlight}>{secondsLeft}</Text> s
                            </Text>
                        </Pressable>
                    </>
                )}
                {serviceError ? <Text style={styles.errorText}>{serviceError}</Text> : null}
            </View>

            <CountryPicker
                countryCode={countryCode}
                withFlagButton={false}
                withFilter
                withFlag
                withCallingCode
                withEmoji
                withAlphaFilter
                visible={countryPickerVisible}
                onClose={() => setCountryPickerVisible(false)}
                onSelect={onCountrySelect}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2',
        paddingHorizontal: 22,
        paddingTop: 14,
    },
    topBar: {
        height: 52,
        justifyContent: 'center',
    },
    headerSection: {
        alignItems: 'center',
        marginTop: 30,
    },
    title: {
        fontSize: 42,
        lineHeight: 56,
        fontWeight: '400',
        color: '#111111',
        textAlign: 'center',
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 18,
        lineHeight: 24,
        color: '#4B4B4B',
        textAlign: 'center',
        marginBottom: 24,
    },
    section: {
        width: '100%',
        marginBottom: 12,
    },
    sectionLabel: {
        fontSize: 13,
        color: '#8A8A8A',
        marginBottom: 10,
        fontWeight: '500',
    },
    phoneRow: {
        flexDirection: 'row',
        gap: 10,
    },
    countryCodeBox: {
        width: 132,
        height: 58,
        borderWidth: 1.2,
        borderColor: '#F1C40F',
        borderRadius: 16,
        backgroundColor: '#F7F7F7',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
    },
    countryCodeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#191919',
    },
    phoneBox: {
        flex: 1,
        height: 58,
        borderWidth: 1.2,
        borderColor: '#F1C40F',
        borderRadius: 16,
        backgroundColor: '#F7F7F7',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    phoneTextInput: {
        flex: 1,
        fontSize: 16,
        color: '#191919',
        fontWeight: '600',
        paddingVertical: 0,
    },
    continueButton: {
        width: '100%',
        height: 54,
        borderRadius: 14,
        backgroundColor: '#F1C40F',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    continueButtonDisabled: {
        backgroundColor: '#E5E5E5',
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    otpRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 14,
        width: '100%',
    },
    otpBox: {
        flex: 1,
        aspectRatio: 1,
        maxWidth: 56,
        borderRadius: 14,
        borderWidth: 1.2,
        borderColor: '#E1BC30',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    otpBoxFilled: {
        backgroundColor: '#F1C40F',
        borderColor: '#F1C40F',
    },
    otpBoxActive: {
        backgroundColor: '#FFFFFF',
        borderColor: '#F1C40F',
    },
    otpBoxMuted: {
        backgroundColor: '#EFEFEF',
        borderColor: '#DCDCDC',
    },
    otpText: {
        fontSize: 30,
        fontWeight: '700',
    },
    otpTextFilled: {
        color: '#FFFFFF',
    },
    otpTextActive: {
        color: '#EBCB6F',
    },
    otpTextMuted: {
        color: '#D0D0D0',
    },
    resendText: {
        fontSize: 14,
        color: '#222222',
        marginBottom: 20,
    },
    resendHighlight: {
        color: '#E1B100',
        fontWeight: '700',
    },
    errorText: {
        color: '#B42318',
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 18,
    },
    hiddenOtpInput: {
        position: 'absolute',
        opacity: 0,
        width: 1,
        height: 1,
    },
});
