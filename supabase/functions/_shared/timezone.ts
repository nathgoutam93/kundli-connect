import { HttpError } from "./http.ts";

/**
 * Birth timezones are stored either as an IANA name detected from the birthplace
 * (e.g. "Asia/Kolkata", the current format) or as a fixed UTC offset in hours ("5.5", older
 * profiles and manual overrides). Astrology needs the offset that applied at the moment of
 * birth, which for an IANA zone depends on the date: daylight saving, and historical changes
 * such as India's UTC+6:30 "war time" in 1942-45.
 */

const NUMERIC_OFFSET = /^[+-]?\d{1,2}(\.\d+)?$/;

/** Offset of `timeZone` from UTC, in minutes, at the instant `utcMs`. */
function offsetMinutesAt(timeZone: string, utcMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour") % 24,
    part("minute"),
    part("second"),
  );
  return Math.round((wallClockAsUtc - utcMs) / 60_000);
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * UTC offset in hours for a local wall-clock time in an IANA zone.
 * `date` is YYYY-MM-DD and `time` is HH:MM or HH:MM:SS, as stored on the profile.
 */
export function offsetForLocalTime(timeZone: string, date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  // First guess uses the offset at the wall-clock instant; the second pass corrects it when the
  // birth time is near a DST change.
  const firstGuess = offsetMinutesAt(timeZone, wallClock);
  const offset = offsetMinutesAt(timeZone, wallClock - firstGuess * 60_000);
  return offset / 60;
}

/** The UTC offset (hours) in force at this birth, used to convert the birth time to UTC. */
export function resolveUtcOffset(birthTimezone: string, date: string, time: string) {
  const value = birthTimezone.trim();

  if (NUMERIC_OFFSET.test(value)) {
    const hours = Number(value);
    if (hours < -12 || hours > 14) throw new HttpError(400, "Birth timezone offset is out of range");
    return hours;
  }

  if (!isValidTimeZone(value)) throw new HttpError(400, "Unknown birth timezone");
  return offsetForLocalTime(value, date, time);
}
