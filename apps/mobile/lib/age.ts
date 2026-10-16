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

/** Whether someone born on this local calendar day is at least `MINIMUM_AGE` on `today`. */
export function isAdultBirthDate(year: number, month: number, day: number, today = new Date()) {
  const birthDate = new Date(year, month - 1, day);
  return birthDate.getTime() <= latestAdultBirthDate(today).getTime();
}
