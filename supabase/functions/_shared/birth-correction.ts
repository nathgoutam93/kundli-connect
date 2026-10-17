import { KUNDLI_ENGINE_VERSION } from './astro/kundli.ts';
import { birthInstant } from './astro/ephemeris.ts';
import { buildKundliPayload, type KundliBirthInputs } from './kundli-payload.ts';
import { resolveUtcOffset } from './timezone.ts';

type ConfirmedBirth = KundliBirthInputs & { birth_place: string };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`);
  return value.trim();
}
function wallTime(at: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const get = (kind: string) => parts.find((part) => part.type === kind)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function normalizeCorrectionBirth(value: unknown, today = new Date()): ConfirmedBirth {
  const birth = object(value);
  const keys = ['date_of_birth','time_of_birth','birth_place','birth_latitude','birth_longitude','birth_timezone'];
  if (Object.keys(birth).some((key) => !keys.includes(key))) throw new Error('Unexpected birth field.');
  const date = text(birth.date_of_birth, 'birth date');
  let time = text(birth.time_of_birth, 'birth time');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Use a complete birth date.');
  const instant = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0,10) !== date || date < '1900-01-01') throw new Error('Birth date is invalid or unsupported.');
  const latest = new Date(today.getTime() + 14*60*60*1000);
  // Match latest_adult_birth_date(), including Feb 29 -> Feb 28 when subtracting years.
  const year = latest.getUTCFullYear()-18;
  const month = latest.getUTCMonth();
  const day = Math.min(latest.getUTCDate(), new Date(Date.UTC(year,month+1,0)).getUTCDate());
  if (instant > new Date(Date.UTC(year,month,day))) throw new Error('A correction must retain adult eligibility; escalate underage records separately.');
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) throw new Error('Birth time is invalid.');
  if (time.length === 5) time += ':00';
  const place = text(birth.birth_place, 'confirmed birthplace');
  if (Array.from(place).length > 300 || /[\u0000-\u001f]/.test(place)) throw new Error('Birthplace is invalid.');
  const latitude = birth.birth_latitude;
  const longitude = birth.birth_longitude;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude)>90
    || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude)>180) throw new Error('Confirm valid birthplace coordinates.');
  // Six decimal places exceed map-selection precision and have stable SQL/JS signatures.
  if (Math.abs(latitude*1e6-Math.round(latitude*1e6))>1e-7 || Math.abs(longitude*1e6-Math.round(longitude*1e6))>1e-7) throw new Error('Use coordinates with at most six decimal places.');
  const zone = text(birth.birth_timezone, 'birth timezone');
  const offset = resolveUtcOffset(zone,date,time);
  const utc = birthInstant(date,time,offset);
  if (!/^[+-]?\d{1,2}(\.\d+)?$/.test(zone)) {
    const expected = `${date}T${time}`;
    if (wallTime(utc,zone) !== expected) throw new Error('That local birth time does not exist in the selected timezone. Confirm it with the member.');
    for (let minutes=-180; minutes<=180; minutes+=15) {
      if (minutes === 0) continue;
      if (wallTime(new Date(utc.getTime()+minutes*60000),zone) === expected) throw new Error('That birth time is ambiguous. Confirm the fixed UTC offset with the member.');
    }
  }
  return { date_of_birth:date,time_of_birth:time,birth_place:place,birth_latitude:latitude,birth_longitude:longitude,birth_timezone:zone };
}

export function prepareBirthCorrection(value: unknown, at = new Date()) {
  const input = object(value);
  const key = text(input.repairKey,'repair key');
  const evidence = text(input.evidenceRef,'evidence reference');
  const userId = text(input.userId,'user ID').toLowerCase();
  const fingerprint = text(input.expectedFingerprint,'reviewed fingerprint');
  const revision = input.expectedRevision;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key) || evidence.length>1000) throw new Error('Invalid repair key or evidence reference.');
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(userId) || !/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('Invalid user ID or reviewed fingerprint.');
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision<0 || revision>=Number.MAX_SAFE_INTEGER) throw new Error('Invalid reviewed revision.');
  if (input.memberConfirmed !== true || input.placeConfirmed !== true) throw new Error('Member confirmation of all birth details and the map pin is required.');
  const birth = normalizeCorrectionBirth(input.birth,at);
  const chart = { ...buildKundliPayload(birth,at), input_revision:revision+1, source_inputs:birth };
  return { version:1,repairKey:key,evidenceRef:evidence,userId,expectedFingerprint:fingerprint,expectedRevision:revision,
    memberConfirmed:true,placeConfirmed:true,engine:KUNDLI_ENGINE_VERSION,birth,chart };
}

export function birthCorrectionSql(artifact: ReturnType<typeof prepareBirthCorrection>) {
  const literal = JSON.stringify(artifact).replaceAll("'", "''");
  return `-- Private birth-correction artifact. Default is a read-only dry run.\n\\set ON_ERROR_STOP on\n\\if :{?apply}\n\\else\n  \\set apply false\n\\endif\n\\if :apply\n  begin;\n\\else\n  begin transaction isolation level repeatable read read only;\n\\endif\nset local standard_conforming_strings = on;\nselect maintenance.correct_birth_details('${literal}'::jsonb, not :'apply'::boolean);\ncommit;\n`;
}
