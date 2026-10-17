import { profilePatch } from './profile-patch';
import { validateProfileText } from './profile-validation';

test('text limits agree with database character counts, including emoji', () => {
  expect(() => validateProfileText({ name:'😀'.repeat(80),bio:'x'.repeat(500) })).not.toThrow();
  expect(() => profilePatch({ name:'😀'.repeat(81) })).toThrow('80 characters');
  expect(() => profilePatch({ bio:'x'.repeat(501) })).toThrow('500 characters');
  expect(() => profilePatch({ email:'not an email' })).toThrow('valid contact email');
});
test('a contact email patch never carries verified identity fields', () => {
  expect(profilePatch({ email:'owner@example.com',verifiedEmail:'forged@example.com' })).toEqual({ email:'owner@example.com' });
});
