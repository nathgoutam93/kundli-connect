import { DEFAULT_PROFILE } from '@/constants/mock-data';
import { profilePatch, changedProfileFields } from './profile-patch';

test('a step save cannot clear unrelated profile fields or change server-owned fields', () => {
  expect(profilePatch({ height: '170 cm', id: 'other', kundliStatus: 'generated', photoUris: ['file://photo'] }))
    .toEqual({ height: '170 cm' });
  expect(profilePatch({ religiousBeliefs: 'Hindu', bio: undefined })).toEqual({ religious_beliefs: 'Hindu' });
});

test('a refreshed cache and grandfathered text cannot make untouched form values overwrite saved changes', () => {
  const initial = { name:'Original',bio:'x'.repeat(501),email:'old@example.com' };
  const draft = { ...initial,email:'new@example.com' };
  const changes = changedProfileFields(initial,draft,draft);
  expect(profilePatch(changes)).toEqual({ email:'new@example.com' });
  const refreshed = { ...initial,name:'Changed on another device',bio:'New saved bio' };
  expect({ ...refreshed,...changes }).toMatchObject({ name:'Changed on another device',bio:'New saved bio',email:'new@example.com' });
});

test('explicit clearing preserves false, empty preferences and valid zero coordinates', () => {
  expect(profilePatch({ bio: '', workplaceVisibleOnProfile: false, genderPreferences: [], birthLatitude: '0', birthLongitude: '' }))
    .toEqual({ bio: null, workplace_visible_on_profile: false, gender_preferences: [], birth_latitude: 0, birth_longitude: null });
});

test('birth fields use database representations and reject invalid coordinates', () => {
  expect(profilePatch({ dateOfBirth: '09-02-1995', timeOfBirth: '00:00:00', birthLongitude: '72.8777' }))
    .toEqual({ date_of_birth: '1995-02-09', time_of_birth: '00:00:00', birth_longitude: 72.8777 });
  expect(() => profilePatch({ birthLatitude: 'NaN' })).toThrow();
  expect(() => profilePatch({ birthLongitude: '181' })).toThrow();
  expect(() => profilePatch({ dateOfBirth: 'unknown' })).toThrow();
  expect(profilePatch({ ...DEFAULT_PROFILE, height: '170 cm' })).not.toHaveProperty('id');
});
