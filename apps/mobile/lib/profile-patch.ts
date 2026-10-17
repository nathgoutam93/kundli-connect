import type { UserProfile } from '@/constants/mock-data';
import { validateProfileText } from '@/lib/profile-validation';

/** Compare with the form's saved baseline, so a cache refresh cannot turn stale fields into edits. */
export function changedProfileFields(initial: Partial<UserProfile>, draft: Partial<UserProfile>, normalized: Partial<UserProfile>) {
  return Object.fromEntries(Object.entries(normalized).filter(([key]) =>
    JSON.stringify(initial[key as keyof UserProfile]) !== JSON.stringify(draft[key as keyof UserProfile]))) as Partial<UserProfile>;
}

const fields = {
  name: 'display_name', email: 'email', gender: 'gender', genderPreferences: 'gender_preferences',
  height: 'height', dateOfBirth: 'date_of_birth', timeOfBirth: 'time_of_birth',
  birthPlace: 'birth_place', birthLatitude: 'birth_latitude', birthLongitude: 'birth_longitude',
  birthTimezone: 'birth_timezone', location: 'location', bio: 'bio',
  familyPlans: 'family_plans', familyPlansVisibleOnProfile: 'family_plans_visible_on_profile',
  workplace: 'workplace', workplaceVisibleOnProfile: 'workplace_visible_on_profile',
  jobRole: 'job_role', jobRoleVisibleOnProfile: 'job_role_visible_on_profile',
  school: 'school', schoolVisibleOnProfile: 'school_visible_on_profile',
  educationLevel: 'education_level', educationLevelVisibleOnProfile: 'education_level_visible_on_profile',
  religiousBeliefs: 'religious_beliefs', drinking: 'drinking',
  drinkingVisibleOnProfile: 'drinking_visible_on_profile', smoking: 'smoking',
  smokingVisibleOnProfile: 'smoking_visible_on_profile',
} satisfies Partial<Record<keyof UserProfile, string>>;

/** Omitted values are never sent. An explicit empty string clears only that field. */
export function profilePatch(updates: Partial<UserProfile>) {
  validateProfileText(updates);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const value = updates[key];
    if (value === undefined) continue;
    if (key === 'dateOfBirth') {
      const date = String(value);
      const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);
      if (date && !match && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid birth date.');
      patch[fields[key]] = date ? (match ? `${match[3]}-${match[2]}-${match[1]}` : date) : null;
    } else if (key === 'birthLatitude' || key === 'birthLongitude') {
      const text = String(value).trim();
      const number = Number(text);
      const bound = key === 'birthLatitude' ? 90 : 180;
      if (text && (!Number.isFinite(number) || Math.abs(number) > bound)) throw new Error('Choose a valid birthplace.');
      patch[fields[key]] = text ? number : null;
    } else {
      patch[fields[key]] = value === '' ? null : value;
    }
  }
  return patch;
}
