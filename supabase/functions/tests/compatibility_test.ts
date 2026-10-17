import { calculateCompatibility, type ProfileBirthDetails } from '../_shared/compatibility.ts';

const first: ProfileBirthDetails = { id:'a',display_name:null,gender:'Non - Binary',date_of_birth:'1996-03-14',time_of_birth:'06:42:00',birth_latitude:26.8467,birth_longitude:80.9462,birth_timezone:'Asia/Kolkata' };
const second: ProfileBirthDetails = { ...first,id:'b',date_of_birth:'1988-11-02',time_of_birth:'23:15:00',birth_latitude:19.076,birth_longitude:72.8777 };

Deno.test('either participant gets the same compatibility calculation and role assignment', () => {
  for (const [a,b] of [[first,second],[{ ...first,gender:'Male' },{ ...second,gender:'Female' }],[{ ...first,gender:'Female' },{ ...second,gender:'Male' }]]) {
    const forward = calculateCompatibility([a,b]);
    const reverse = calculateCompatibility([b,a]);
    if (forward.overallScore !== reverse.overallScore || JSON.stringify(forward.breakdown)!==JSON.stringify(reverse.breakdown)) throw new Error('Requester changed score');
  }
});
Deno.test('missing birth inputs fail before any report can be committed', () => {
  let failed=false;
  try { calculateCompatibility([{ ...first,birth_timezone:null },second]); } catch { failed=true; }
  if (!failed) throw new Error('Incomplete birth inputs accepted');
});
