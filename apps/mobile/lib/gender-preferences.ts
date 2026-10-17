/** Who someone wants to meet. "Everyone" is stored on its own and matches any gender on the server. */
export const EVERYONE = 'Everyone';
export const SPECIFIC_PREFERENCES = ['Male', 'Female', 'Non - Binary People'] as const;
export const PREFERENCE_OPTIONS = [...SPECIFIC_PREFERENCES, EVERYONE];

/**
 * Toggling rules shared by onboarding and Edit profile:
 * - "Everyone" is exclusive (it covers any gender, including options added later);
 * - picking a specific gender replaces "Everyone";
 * - ticking every specific gender is the same choice as "Everyone", so it's saved that way.
 */
export function togglePreference(current: string[], option: string): string[] {
  if (option === EVERYONE) return current.includes(EVERYONE) ? [] : [EVERYONE];

  const next = current.includes(option)
    ? current.filter((item) => item !== option)
    : [...current.filter((item) => item !== EVERYONE), option];

  return SPECIFIC_PREFERENCES.every((item) => next.includes(item)) ? [EVERYONE] : next;
}

/** A specific option shown as included (ticked, faded, not tappable) because "Everyone" is selected. */
export function isIncludedByEveryone(current: string[], option: string) {
  return option !== EVERYONE && current.includes(EVERYONE);
}
