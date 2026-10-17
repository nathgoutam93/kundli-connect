import { EVERYONE, isIncludedByEveryone, togglePreference } from '@/lib/gender-preferences';

describe('togglePreference', () => {
  it('makes Everyone exclusive and lets it be cleared', () => {
    expect(togglePreference(['Male', 'Female'], EVERYONE)).toEqual([EVERYONE]);
    expect(togglePreference([EVERYONE], EVERYONE)).toEqual([]);
  });

  it('replaces Everyone when a specific gender is picked', () => {
    expect(togglePreference([EVERYONE], 'Female')).toEqual(['Female']);
  });

  it('adds and removes specific genders', () => {
    expect(togglePreference(['Male'], 'Female')).toEqual(['Male', 'Female']);
    expect(togglePreference(['Male', 'Female'], 'Male')).toEqual(['Female']);
  });

  it('saves ticking every specific gender as Everyone', () => {
    expect(togglePreference(['Male', 'Female'], 'Non - Binary People')).toEqual([EVERYONE]);
  });
});

describe('isIncludedByEveryone', () => {
  it('marks specific genders as included only while Everyone is selected', () => {
    expect(isIncludedByEveryone([EVERYONE], 'Male')).toBe(true);
    expect(isIncludedByEveryone([EVERYONE], EVERYONE)).toBe(false);
    expect(isIncludedByEveryone(['Male'], 'Female')).toBe(false);
  });
});
