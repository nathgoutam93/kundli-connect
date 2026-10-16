import tzlookup from '@photostructure/tz-lookup';

/**
 * Birth timezone helpers. The birthplace's coordinates give an IANA zone ("Asia/Kolkata"),
 * which is what we store; the server works out the exact UTC offset for the moment of birth
 * (see supabase/functions/_shared/timezone.ts). Here we only need it to show a preview.
 */

/** IANA zone for a coordinate, or null when it can't be told (e.g. open sea gives "Etc/GMT-5"). */
export function zoneForCoordinate(latitude: number, longitude: number): string | null {
  try {
    const zone = tzlookup(latitude, longitude);
    return zone && !zone.startsWith('Etc/') ? zone : null;
  } catch {
    return null;
  }
}

/** Offset of `timeZone` from UTC in minutes at the instant `utcMs`; null if the engine can't tell. */
function offsetMinutesAt(timeZone: string, utcMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour') % 24, part('minute'), part('second'));
    return Number.isFinite(wallClockAsUtc) ? Math.round((wallClockAsUtc - utcMs) / 60_000) : null;
  } catch {
    return null;
  }
}

/**
 * UTC offset in hours for a local wall-clock time in a zone.
 * `date` accepts the profile's DD-MM-YYYY or YYYY-MM-DD; `time` is HH:MM[:SS].
 */
export function offsetForLocalTime(timeZone: string, date: string, time: string): number | null {
  const iso = /^\d{2}-\d{2}-\d{4}$/.test(date) ? date.split('-').reverse().join('-') : date;
  const [year, month, day] = iso.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    return null;
  }
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = offsetMinutesAt(timeZone, wallClock);
  if (firstGuess === null) {
    return null;
  }
  const offset = offsetMinutesAt(timeZone, wallClock - firstGuess * 60_000);
  return offset === null ? null : offset / 60;
}

/** 5.5 → "UTC+05:30", -3.5 → "UTC−03:30". */
export function formatUtcOffset(hours: number) {
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `UTC${hours < 0 ? '−' : '+'}${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

/** True for the older "5.5"-style stored value (also used for manual overrides). */
export function isNumericOffset(value: string) {
  return /^[+-]?\d{1,2}(\.\d+)?$/.test(value.trim());
}

/** Every quarter-hour offset from UTC−12:00 to UTC+14:00, for the manual picker. */
export const MANUAL_OFFSETS = Array.from({ length: (14 + 12) * 4 + 1 }, (_, index) => -12 + index / 4);
