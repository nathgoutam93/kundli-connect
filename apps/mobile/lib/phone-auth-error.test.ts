import { phoneAuthError } from './phone-auth-error';

test('wrong codes, throttling, invalid phones and network failures have distinct safe messages', () => {
  expect(phoneAuthError({ code: 'otp_expired' }, true)).toMatch(/incorrect or has expired/);
  expect(phoneAuthError({ status: 429 }, true)).toMatch(/Too many attempts/);
  expect(phoneAuthError({ code: 'over_sms_send_rate_limit' })).toMatch(/Too many attempts/);
  expect(phoneAuthError({ code: 'phone_number_invalid' })).toMatch(/country code/);
  expect(phoneAuthError(new Error('private backend detail'))).toMatch(/connection/);
  expect(phoneAuthError(new Error('private backend detail'))).not.toMatch(/private backend/);
});
