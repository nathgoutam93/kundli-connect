import { formatUtcOffset, isNumericOffset, MANUAL_OFFSETS, offsetForLocalTime, zoneForCoordinate } from '@/lib/timezone';

describe('zoneForCoordinate', () => {
  it('finds the zone for a birthplace', () => {
    expect(zoneForCoordinate(26.8467, 80.9462)).toBe('Asia/Kolkata'); // Lucknow
    expect(zoneForCoordinate(27.7172, 85.324)).toBe('Asia/Kathmandu');
    expect(zoneForCoordinate(40.7128, -74.006)).toBe('America/New_York');
  });

  it('returns null where no civil zone applies (open sea)', () => {
    expect(zoneForCoordinate(0, -30)).toBeNull(); // mid-Atlantic
  });
});

describe('offsetForLocalTime', () => {
  it('uses the offset in force at the birth date', () => {
    expect(offsetForLocalTime('Asia/Kolkata', '14-03-1998', '06:42:00')).toBe(5.5);
    expect(offsetForLocalTime('Asia/Kolkata', '01-06-1943', '10:00')).toBe(6.5);
    expect(offsetForLocalTime('America/New_York', '1990-07-04', '12:00')).toBe(-4);
    expect(offsetForLocalTime('America/New_York', '1990-01-15', '12:00')).toBe(-5);
  });

  it('returns null for incomplete input', () => {
    expect(offsetForLocalTime('Asia/Kolkata', '', '')).toBeNull();
  });
});

describe('formatting and manual offsets', () => {
  it('formats offsets', () => {
    expect(formatUtcOffset(5.5)).toBe('UTC+05:30');
    expect(formatUtcOffset(5.75)).toBe('UTC+05:45');
    expect(formatUtcOffset(-3.5)).toBe('UTC−03:30');
    expect(formatUtcOffset(0)).toBe('UTC+00:00');
  });

  it('tells stored numeric offsets from zone names', () => {
    expect(isNumericOffset('5.5')).toBe(true);
    expect(isNumericOffset('-10')).toBe(true);
    expect(isNumericOffset('Asia/Kolkata')).toBe(false);
  });

  it('offers every quarter hour from −12 to +14', () => {
    expect(MANUAL_OFFSETS[0]).toBe(-12);
    expect(MANUAL_OFFSETS[MANUAL_OFFSETS.length - 1]).toBe(14);
    expect(MANUAL_OFFSETS).toContain(5.5);
    expect(MANUAL_OFFSETS).toContain(5.75);
  });
});
