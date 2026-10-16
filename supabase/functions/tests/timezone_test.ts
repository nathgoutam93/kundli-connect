import { resolveUtcOffset } from "../_shared/timezone.ts";
import { HttpError } from "../_shared/http.ts";

function expectOffset(zone: string, date: string, time: string, expected: number) {
  const actual = resolveUtcOffset(zone, date, time);
  if (actual !== expected) throw new Error(`${zone} ${date} ${time}: expected ${expected}, got ${actual}`);
}

Deno.test("India: today's offset and the 1942-45 war-time offset", () => {
  expectOffset("Asia/Kolkata", "1998-03-14", "06:42:00", 5.5);
  expectOffset("Asia/Kolkata", "1943-06-01", "10:00", 6.5);
});

Deno.test("daylight saving is taken from the birth date, not today", () => {
  expectOffset("America/New_York", "1990-07-04", "12:00", -4);
  expectOffset("America/New_York", "1990-01-15", "12:00", -5);
  expectOffset("Europe/London", "2001-06-21", "08:30", 1);
  expectOffset("Asia/Kathmandu", "2000-05-05", "09:15", 5.75);
});

Deno.test("legacy numeric offsets pass through; bad values are rejected", () => {
  expectOffset("5.5", "1990-01-01", "00:00", 5.5);
  expectOffset("-3.5", "1990-01-01", "00:00", -3.5);
  for (const bad of ["Mars/Olympus", "99", ""]) {
    try {
      resolveUtcOffset(bad, "1990-01-01", "00:00");
      throw new Error(`accepted ${bad}`);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 400) throw error;
    }
  }
});
