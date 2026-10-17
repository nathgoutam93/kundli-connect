import { birthCorrectionSql, normalizeCorrectionBirth, prepareBirthCorrection } from '../_shared/birth-correction.ts';
import { buildKundliPayload } from '../_shared/kundli-payload.ts';

function expect(condition: unknown, message: string) { if (!condition) throw new Error(message); }
function rejects(run: () => unknown, fragment: string) {
  try { run(); } catch(error) { expect(error instanceof Error && error.message.includes(fragment),'Wrong validation error'); return; }
  throw new Error('Expected validation failure');
}
const at = new Date('2026-10-17T00:00:00Z');
const birth = { date_of_birth:'1996-03-14',time_of_birth:'06:42',birth_place:'Lucknow',birth_latitude:26.8467,birth_longitude:80.9462,birth_timezone:'Asia/Kolkata' };
const input = { repairKey:'support-1',evidenceRef:'SUPPORT-123',userId:'d7000000-0000-4000-8000-000000000001',expectedFingerprint:'0'.repeat(64),expectedRevision:4,memberConfirmed:true,placeConfirmed:true,birth };

Deno.test('support preparation uses the ordinary Kundli engine and binds the complete confirmed inputs', () => {
  const artifact = prepareBirthCorrection(input,at);
  expect(artifact.birth.time_of_birth==='06:42:00','Time not normalized');
  const payload = buildKundliPayload(artifact.birth,at);
  expect(JSON.stringify(artifact.chart)===JSON.stringify({ ...payload,input_revision:5,source_inputs:artifact.birth }),'Correction used a different engine');
  expect(artifact.chart.parsed_summary.ascendant==='Pisces' && artifact.chart.parsed_summary.moonSign==='Sagittarius','Known chart changed');
  expect(artifact.chart.chart_houses.D1.length===12 && artifact.chart.chart_houses.D9.length===12,'Incomplete chart');
});
Deno.test('confirmed midnight and a real January 2000 birth are accepted', () => {
  const normalized=normalizeCorrectionBirth({ ...birth,date_of_birth:'2000-01-01',time_of_birth:'00:00' },at);
  expect(normalized.time_of_birth==='00:00:00','Midnight replaced');
});
Deno.test('confirmation, account, fingerprint and revision are required before preparing a chart', () => {
  rejects(()=>prepareBirthCorrection({ ...input,memberConfirmed:false },at),'confirmation');
  rejects(()=>prepareBirthCorrection({ ...input,placeConfirmed:false },at),'confirmation');
  rejects(()=>prepareBirthCorrection({ ...input,userId:'wrong' },at),'Invalid user');
  rejects(()=>prepareBirthCorrection({ ...input,expectedFingerprint:'wrong' },at),'fingerprint');
  rejects(()=>prepareBirthCorrection({ ...input,expectedRevision:0.5 },at),'revision');
});
Deno.test('calendar normalization, underage dates and impossible times cannot become locked inputs', () => {
  rejects(()=>normalizeCorrectionBirth({ ...birth,date_of_birth:'2000-02-30' },at),'invalid');
  rejects(()=>normalizeCorrectionBirth({ ...birth,date_of_birth:'2010-01-01' },at),'adult');
  rejects(()=>normalizeCorrectionBirth({ ...birth,time_of_birth:'24:00:00' },at),'invalid');
  rejects(()=>normalizeCorrectionBirth({ ...birth,time_of_birth:'' },at),'Missing');
});
Deno.test('coordinates, timezone, field allowlist and place are validated', () => {
  rejects(()=>normalizeCorrectionBirth({ ...birth,birth_latitude:NaN },at),'coordinates');
  rejects(()=>normalizeCorrectionBirth({ ...birth,birth_longitude:181 },at),'coordinates');
  rejects(()=>normalizeCorrectionBirth({ ...birth,birth_latitude:19.1234567 },at),'six decimal');
  rejects(()=>normalizeCorrectionBirth({ ...birth,birth_timezone:'No/Such_Zone' },at),'timezone');
  rejects(()=>normalizeCorrectionBirth({ ...birth,bio:'Unexpected' },at),'Unexpected');
  rejects(()=>normalizeCorrectionBirth({ ...birth,birth_place:' ' },at),'Missing');
});
Deno.test('DST gaps and folds require member clarification rather than an arbitrary locked instant', () => {
  const ny={ ...birth,birth_timezone:'America/New_York',birth_latitude:40.7128,birth_longitude:-74.006 };
  rejects(()=>normalizeCorrectionBirth({ ...ny,date_of_birth:'1990-04-01',time_of_birth:'02:30' },at),'does not exist');
  rejects(()=>normalizeCorrectionBirth({ ...ny,date_of_birth:'1990-10-28',time_of_birth:'01:30' },at),'ambiguous');
  const explicit=normalizeCorrectionBirth({ ...ny,date_of_birth:'1990-10-28',time_of_birth:'01:30',birth_timezone:'-4' },at);
  expect(explicit.birth_timezone==='-4','Explicit offset changed');
  rejects(()=>normalizeCorrectionBirth({ ...birth,date_of_birth:'1990-03-04',time_of_birth:'01:45',birth_timezone:'Australia/Lord_Howe' },at),'ambiguous');
});
Deno.test('generated SQL defaults to read only, quotes user text and contains no automatic apply', () => {
  const artifact=prepareBirthCorrection({ ...input,birth:{ ...birth,birth_place:"St. John's \\ '); DROP TABLE public.profiles; --" } },at);
  const sql=birthCorrectionSql(artifact);
  expect(sql.includes('begin transaction isolation level repeatable read read only;'),'Missing read-only preview');
  expect(sql.includes('\\set apply false'),'Apply became default');
  expect(sql.includes("John''s"),'Apostrophe not escaped');
  expect(sql.includes('set local standard_conforming_strings = on;'),'Backslash behavior is unspecified');
});
