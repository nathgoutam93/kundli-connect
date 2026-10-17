export function phoneAuthError(error: unknown, verifying = false) {
  const detail = error as { code?: string; status?: number } | null;
  if (detail?.status === 429 || ['over_request_rate_limit', 'over_sms_send_rate_limit', 'over_email_send_rate_limit'].includes(detail?.code ?? '')) {
    return 'Too many attempts. Wait a few minutes before trying again.';
  }
  if (verifying && ['otp_expired', 'otp_disabled', 'invalid_credentials', 'validation_failed'].includes(detail?.code ?? '')) {
    return 'That code is incorrect or has expired. Check it or request a new code.';
  }
  if (detail?.code === 'phone_number_invalid' || detail?.code === 'validation_failed') return 'Check your phone number, including the country code.';
  return verifying ? 'Could not verify your code. Check your connection and try again.' : 'Could not send a code. Check your connection and try again.';
}
