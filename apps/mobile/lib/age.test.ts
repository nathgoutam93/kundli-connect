import { ageFromBirthDate, isAdultBirthDate, latestAdultBirthDate } from '@/lib/age';

describe('latestAdultBirthDate', () => {
  it('is the same day 18 years earlier', () => {
    const cutoff = latestAdultBirthDate(new Date(2026, 9, 16));
    expect([cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate()]).toEqual([2008, 9, 16]);
  });

  it('falls back to 28 February when 18 years earlier has no 29 February', () => {
    const cutoff = latestAdultBirthDate(new Date(2028, 1, 29));
    expect([cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate()]).toEqual([2010, 1, 28]);
  });
});

describe('isAdultBirthDate', () => {
  const today = new Date(2026, 9, 16, 9, 30);

  it('accepts someone whose 18th birthday is today', () => {
    expect(isAdultBirthDate(2008, 10, 16, today)).toBe(true);
  });

  it('rejects someone who turns 18 tomorrow', () => {
    expect(isAdultBirthDate(2008, 10, 17, today)).toBe(false);
  });

  it('accepts older people and rejects younger ones', () => {
    expect(isAdultBirthDate(1990, 1, 1, today)).toBe(true);
    expect(isAdultBirthDate(2012, 5, 1, today)).toBe(false);
  });

  it('treats a 29 February birthday as turning 18 on 1 March in non-leap years', () => {
    expect(isAdultBirthDate(2008, 2, 29, new Date(2026, 1, 28))).toBe(false);
    expect(isAdultBirthDate(2008, 2, 29, new Date(2026, 2, 1))).toBe(true);
  });
});

describe('ageFromBirthDate', () => {
  const today = new Date(2026, 9, 16);

  it('reads both the app format (DD-MM-YYYY) and the database format (YYYY-MM-DD)', () => {
    expect(ageFromBirthDate('14-03-1996', today)).toBe(30);
    expect(ageFromBirthDate('1996-03-14', today)).toBe(30);
  });

  it('only counts the year once the birthday has passed', () => {
    expect(ageFromBirthDate('16-10-1998', today)).toBe(28);
    expect(ageFromBirthDate('17-10-1998', today)).toBe(27);
  });

  it('matches the server for 29 February birthdays', () => {
    expect(ageFromBirthDate('29-02-2000', new Date(2026, 1, 28))).toBe(25);
    expect(ageFromBirthDate('29-02-2000', new Date(2026, 2, 1))).toBe(26);
  });

  it('returns 0 for missing, invalid or future dates', () => {
    expect(ageFromBirthDate('', today)).toBe(0);
    expect(ageFromBirthDate('31-02-1999', today)).toBe(0);
    expect(ageFromBirthDate('01-01-2030', today)).toBe(0);
  });
});
