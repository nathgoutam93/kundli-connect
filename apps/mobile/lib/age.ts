/** Kundali Konnect is for adults only. The database enforces the same limit (see the age gate migration). */
export const MINIMUM_AGE = 18;

/** The latest birth date (local calendar day) of someone who is at least `MINIMUM_AGE` on `today`. */
export function latestAdultBirthDate(today = new Date()) {
  const year = today.getFullYear() - MINIMUM_AGE;
  const month = today.getMonth();
  // Someone born on 29 February turns 18 on 1 March in non-leap years.
  const day = Math.min(today.getDate(), new Date(year, month + 1, 0).getDate());
  return new Date(year, month, day);
}

/**
 * Age in whole years on `today` from a birth date stored as DD-MM-YYYY (the app's format) or
 * YYYY-MM-DD (the database's). Same rule as the server's `age()` for other people's cards.
 * Returns 0 for a missing or invalid date.
 */
export function ageFromBirthDate(value: string, today = new Date()) {
  const parts = value.match(/^(\d{2})-(\d{2})-(\d{4})$/) ?? value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return 0;
  const [year, month, day] = parts[1].length === 4
    ? [Number(parts[1]), Number(parts[2]), Number(parts[3])]
    : [Number(parts[3]), Number(parts[2]), Number(parts[1])];
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || birth > today) return 0;

  const hadBirthdayThisYear =
    today.getMonth() > month - 1 || (today.getMonth() === month - 1 && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthdayThisYear ? 0 : 1);
}

/** Whether someone born on this local calendar day is at least `MINIMUM_AGE` on `today`. */
export function isAdultBirthDate(year: number, month: number, day: number, today = new Date()) {
  const birthDate = new Date(year, month - 1, day);
  return birthDate.getTime() <= latestAdultBirthDate(today).getTime();
}
