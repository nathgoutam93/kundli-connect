-- Run after maintenance/install.sql and migration 20261017130000. Administrative only.
begin;
do $$ begin
 if to_regclass('maintenance.repair_actions') is null or to_regclass('public.user_data_versions') is null then
   raise exception 'Install the maintenance tools and birth-consistency migration first.';
 end if;
end $$;
create table if not exists maintenance.birth_corrections (
 repair_key text primary key references maintenance.repair_actions(repair_key),
 user_id uuid not null references public.profiles(id) on delete cascade,
 previous_birth jsonb not null,
 corrected_birth jsonb not null,
 previous_kundli jsonb,
 previous_reports jsonb not null,
 artifact_hash text not null
);
alter table maintenance.birth_corrections enable row level security;
revoke all on maintenance.birth_corrections from public,anon,authenticated,service_role;

create or replace function maintenance.birth_inputs(p_user uuid)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('date_of_birth',date_of_birth::text,'time_of_birth',time_of_birth::text,
 'birth_place',birth_place,'birth_latitude',birth_latitude,'birth_longitude',birth_longitude,'birth_timezone',birth_timezone)
 from public.profiles where id=p_user;
$$;

-- General audit rows and preview output contain hashes and provenance, not birth inputs.
create or replace function maintenance.birth_snapshot(p_user uuid)
returns jsonb language sql stable set search_path=pg_catalog,public,maintenance as $$
 select jsonb_build_object('userId',p.id,'birthRevision',p.birth_details_revision,'profileUpdatedAt',p.updated_at,
 'completed',p.onboarding_completed,'suspended',p.suspended_at is not null,
 'birthHash',maintenance.fingerprint(maintenance.birth_inputs(p.id)),
 'kundli',(select jsonb_build_object('id',k.id,'inputRevision',k.input_revision,'hash',maintenance.fingerprint(to_jsonb(k))) from public.kundlis k where k.user_id=p.id),
 'reports',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'hash',maintenance.fingerprint(to_jsonb(m))) order by m.id),'[]')
   from public.match_scores m where m.user_a_id=p.id or m.user_b_id=p.id),
 'insights',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'revision',i.input_revision) order by i.id),'[]') from public.astro_insights i where i.user_id=p.id))
 from public.profiles p where p.id=p_user;
$$;

create or replace function maintenance.correct_birth_details(p_artifact jsonb,p_dry_run boolean default true)
returns jsonb language plpgsql set search_path=pg_catalog,public,maintenance as $$
declare
 key text; evidence text; v_user uuid; expected text; reviewed_revision bigint; new_revision bigint;
 prior maintenance.repair_actions; request jsonb; snapshot jsonb; after_state jsonb; outcome jsonb;
 birth jsonb; chart jsonb; old_birth jsonb; old_chart jsonb; old_reports jsonb;
 birth_date date; birth_time time; place text; latitude double precision; longitude double precision; zone text;
 signature text; local_time timestamp; utc_time timestamptz; delta integer; generated timestamptz;
begin
 if jsonb_typeof(p_artifact) is distinct from 'object' or p_dry_run is null then raise exception 'Provide an artifact and explicit mode.' using errcode='22023'; end if;
 key:=p_artifact->>'repairKey'; evidence:=p_artifact->>'evidenceRef';
 if key is null or key !~ '^[A-Za-z0-9._:-]{1,128}$' or nullif(btrim(evidence),'') is null or char_length(evidence)>1000 then
   raise exception 'Repair key and evidence reference are required.' using errcode='22023'; end if;
 request:=jsonb_build_object('kind','correct_birth_details','artifactHash',maintenance.fingerprint(p_artifact));
 if not p_dry_run then perform pg_advisory_xact_lock(hashtextextended('repair:'||key,0)); end if;
 select * into prior from maintenance.repair_actions where repair_key=key;
 if found then
   if prior.request is distinct from request then raise exception 'Repair key already used for another request.' using errcode='22023'; end if;
   return prior.outcome||jsonb_build_object('alreadyApplied',true,'dryRun',p_dry_run);
 end if;
 if p_artifact->'version' is distinct from '1'::jsonb or p_artifact->>'engine' is distinct from 'local-1'
   or p_artifact->'memberConfirmed' is distinct from 'true'::jsonb or p_artifact->'placeConfirmed' is distinct from 'true'::jsonb then
   raise exception 'Use the current preparer with member-confirmed birth details and map pin.' using errcode='22023'; end if;
 v_user:=(p_artifact->>'userId')::uuid; expected:=p_artifact->>'expectedFingerprint';
 if v_user is null or expected is null or expected !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_artifact->'expectedRevision') is distinct from 'number' then
   raise exception 'Missing reviewed user, fingerprint or revision.' using errcode='22023'; end if;
 if (p_artifact->>'expectedRevision')::numeric<>trunc((p_artifact->>'expectedRevision')::numeric) then raise exception 'Revision must be an integer.' using errcode='22023'; end if;
 reviewed_revision:=(p_artifact->>'expectedRevision')::bigint;
 if reviewed_revision<0 or reviewed_revision>=9007199254740991 then raise exception 'Unsupported revision.' using errcode='22023'; end if;
 if not p_dry_run then
   perform public.lock_birth_inputs(v_user);
   perform 1 from public.profiles where id=v_user for no key update;
 end if;
 snapshot:=maintenance.birth_snapshot(v_user);
 if snapshot is null or expected is distinct from maintenance.fingerprint(snapshot)
    or reviewed_revision is distinct from (snapshot->>'birthRevision')::bigint then
   raise exception 'Inspected data changed. Audit and review again.' using errcode='40001'; end if;
 if snapshot->'completed' is distinct from 'true'::jsonb then raise exception 'Use normal onboarding for incomplete profiles.' using errcode='22023'; end if;
 birth:=p_artifact->'birth'; chart:=p_artifact->'chart';
 if jsonb_typeof(birth) is distinct from 'object' or jsonb_typeof(chart) is distinct from 'object'
   or (select count(*) from jsonb_object_keys(birth))<>6 or exists(select 1 from jsonb_object_keys(birth) k where k<>all(array[
     'date_of_birth','time_of_birth','birth_place','birth_latitude','birth_longitude','birth_timezone'])) then
   raise exception 'Provide exactly the six confirmed birth fields.' using errcode='22023'; end if;
 if jsonb_typeof(birth->'date_of_birth') is distinct from 'string' or jsonb_typeof(birth->'time_of_birth') is distinct from 'string'
   or jsonb_typeof(birth->'birth_place') is distinct from 'string' or jsonb_typeof(birth->'birth_timezone') is distinct from 'string'
   or birth->>'date_of_birth' !~ '^\d{4}-\d{2}-\d{2}$' or birth->>'time_of_birth' !~ '^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$'
   or jsonb_typeof(birth->'birth_latitude') is distinct from 'number' or jsonb_typeof(birth->'birth_longitude') is distinct from 'number' then
   raise exception 'Invalid birth date, time or coordinates.' using errcode='22023'; end if;
 birth_date:=(birth->>'date_of_birth')::date; birth_time:=(birth->>'time_of_birth')::time;
 place:=birth->>'birth_place'; latitude:=(birth->>'birth_latitude')::double precision;
 longitude:=(birth->>'birth_longitude')::double precision; zone:=birth->>'birth_timezone';
 if birth_date is null or not isfinite(birth_date) or birth_date<date '1900-01-01' or birth_date>public.latest_adult_birth_date()
   or birth_time is null or nullif(btrim(place),'') is null or place<>btrim(place) or char_length(place)>300 or place~'[[:cntrl:]]'
   or latitude is null or not(latitude between -90 and 90) or longitude is null or not(longitude between -180 and 180)
   or latitude::numeric<>round(latitude::numeric,6) or longitude::numeric<>round(longitude::numeric,6)
   or nullif(btrim(zone),'') is null or zone<>btrim(zone) then
   raise exception 'Confirm valid adult birth details, place, coordinates and timezone.' using errcode='22023'; end if;
 if zone~'^[+-]?\d{1,2}(\.\d+)?$' then
   if zone::numeric not between -12 and 14 then raise exception 'Invalid UTC offset.' using errcode='22023'; end if;
 else
   if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Unknown IANA timezone.' using errcode='22023'; end if;
   local_time:=birth_date+birth_time; utc_time:=local_time at time zone zone;
   if utc_time at time zone zone<>local_time then raise exception 'Local birth time does not exist. Reconfirm with the member.' using errcode='22023'; end if;
   for delta in select n from generate_series(-180,180,15) n where n<>0 loop
     if (utc_time+make_interval(mins=>delta)) at time zone zone=local_time then
       raise exception 'Ambiguous birth time. Confirm a fixed UTC offset.' using errcode='22023'; end if;
   end loop;
 end if;
 old_birth:=maintenance.birth_inputs(v_user);
 if old_birth=birth then raise exception 'No birth input changed.' using errcode='22023'; end if;
 new_revision:=reviewed_revision+1;
 signature:=concat_ws('|',p_artifact->>'engine',birth_date::text,to_char(birth_time,'HH24:MI:SS'),
   trim_scale(latitude::numeric)::text,trim_scale(longitude::numeric)::text,zone);
 if chart->'source_inputs' is distinct from birth or chart->'input_revision' is distinct from to_jsonb(new_revision)
   or chart->>'input_signature' is distinct from signature
   or jsonb_typeof(chart->'raw_response') is distinct from 'object'
   or jsonb_typeof(chart->'parsed_summary') is distinct from 'object'
   or jsonb_typeof(chart->'chart_raw_responses') is distinct from 'object'
   or jsonb_typeof(chart->'chart_houses'->'D1') is distinct from 'array'
   or jsonb_typeof(chart->'chart_houses'->'D9') is distinct from 'array' then
   raise exception 'Replacement chart does not match confirmed inputs, revision or engine.' using errcode='22023'; end if;
 if jsonb_array_length(chart->'chart_houses'->'D1')<>12 or jsonb_array_length(chart->'chart_houses'->'D9')<>12
   or nullif(chart->'parsed_summary'->>'ascendant','') is null or nullif(chart->'parsed_summary'->>'moonSign','') is null
   or chart->'parsed_summary'->>'generatedAt' is distinct from chart->>'generated_at' then
   raise exception 'Replacement chart is incomplete.' using errcode='22023'; end if;
 generated:=(chart->>'generated_at')::timestamptz;
 if generated is null or not isfinite(generated) or generated>clock_timestamp()+interval '5 minutes'
   or octet_length(p_artifact::text)>1048576 then raise exception 'Invalid correction artifact.' using errcode='22023'; end if;
 outcome:=jsonb_build_object('kind','correct_birth_details','repairKey',key,'userId',v_user,'dryRun',p_dry_run,
   'newRevision',new_revision,'affectedReports',jsonb_array_length(snapshot->'reports'),
   'beforeFingerprint',expected,'chartHash',maintenance.fingerprint(chart));
 if p_dry_run then return outcome; end if;
 select to_jsonb(k) into old_chart from public.kundlis k where k.user_id=v_user;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') into old_reports from public.match_scores m
   where m.user_a_id=v_user or m.user_b_id=v_user;
 update public.profiles set date_of_birth=birth_date,time_of_birth=birth_time,birth_place=place,
   birth_latitude=latitude,birth_longitude=longitude,birth_timezone=zone,updated_at=clock_timestamp() where id=v_user;
 if (select birth_details_revision from public.profiles where id=v_user)<>new_revision then raise exception 'Birth revision failed to advance.'; end if;
 perform public.commit_generated_kundli(v_user,new_revision,chart);
 after_state:=maintenance.birth_snapshot(v_user);
 outcome:=outcome||jsonb_build_object('afterFingerprint',maintenance.fingerprint(after_state));
 insert into maintenance.repair_actions(repair_key,kind,request,evidence_ref,before_state,after_state,outcome)
 values(key,'correct_birth_details',request,evidence,snapshot,after_state,outcome);
 insert into maintenance.birth_corrections(repair_key,user_id,previous_birth,corrected_birth,previous_kundli,previous_reports,artifact_hash)
 values(key,v_user,old_birth,birth,old_chart,old_reports,maintenance.fingerprint(p_artifact));
 return outcome;
end;
$$;
revoke all on all functions in schema maintenance from public,anon,authenticated,service_role;
commit;
