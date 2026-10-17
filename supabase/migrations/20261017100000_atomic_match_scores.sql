begin;
alter table public.match_scores add column input_signature jsonb;

create function public.valid_match_report(p_report jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
begin
  return jsonb_typeof(p_report->'id') = 'string' and length(p_report->>'id') > 0
    and jsonb_typeof(p_report->'generatedAt') = 'string' and isfinite((p_report->>'generatedAt')::timestamptz)
    and jsonb_typeof(p_report->'overallScore') = 'number'
    and (p_report->>'overallScore')::numeric between 0 and 100
    and trunc((p_report->>'overallScore')::numeric) = (p_report->>'overallScore')::numeric;
exception when others then return false;
end;
$$;
revoke all on function public.valid_match_report(jsonb) from public, anon, authenticated;

-- Shared with block/unmatch/like locks. Hold profile rows while validating a snapshot.
create function public.match_score_inputs(p_user uuid,p_target uuid,p_engine text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.profiles; b public.profiles;
begin
  perform public.lock_user_pair(p_user,p_target);
  perform 1 from public.profiles where id in (p_user,p_target) order by id for share;
  perform public.assert_pair_available(p_user,p_target);
  select * into a from public.profiles where id = least(p_user,p_target);
  select * into b from public.profiles where id = greatest(p_user,p_target);
  if not exists (select 1 from public.profiles where id = p_target and onboarding_completed and is_discoverable)
     and not exists (select 1 from public.likes where status in ('pending','matched') and
       least(from_user_id,to_user_id) = a.id and greatest(from_user_id,to_user_id) = b.id) then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('aRevision',a.birth_details_revision,'bRevision',b.birth_details_revision,
    'aGender',a.gender,'bGender',b.gender,'engine',p_engine);
end;
$$;
revoke all on function public.match_score_inputs(uuid,uuid,text) from public, anon, authenticated;

create function public.prepare_match_score(p_user uuid,p_target uuid,p_engine text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare signature jsonb; existing public.match_scores; profiles jsonb;
begin
  signature := public.match_score_inputs(p_user,p_target,p_engine);
  -- Even cache reads are bounded; subscribers cannot bypass the calculation limit.
  perform public.consume_action_limit(p_user,'match_score',60,10);
  select * into existing from public.match_scores
    where user_a_id = least(p_user,p_target) and user_b_id = greatest(p_user,p_target);
  if existing.input_signature = signature and public.valid_match_report(existing.compatibility_report) then
    return jsonb_build_object('matchScoreId',existing.id,'compatibility',existing.compatibility_report,'cached',true);
  end if;
  select jsonb_agg(jsonb_build_object('id',id,'gender',gender,'date_of_birth',date_of_birth,
    'time_of_birth',time_of_birth,'birth_latitude',birth_latitude,'birth_longitude',birth_longitude,
    'birth_timezone',birth_timezone) order by id) into profiles
  from public.profiles where id in (p_user,p_target);
  return jsonb_build_object('signature',signature,'profiles',profiles,'cached',false);
end;
$$;
revoke all on function public.prepare_match_score(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.prepare_match_score(uuid,uuid,text) to service_role;

create function public.commit_match_score(p_user uuid,p_target uuid,p_engine text,p_signature jsonb,p_report jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare signature jsonb; existing public.match_scores; score_id uuid; allowed boolean; debit uuid;
begin
  signature := public.match_score_inputs(p_user,p_target,p_engine);
  select * into existing from public.match_scores
    where user_a_id = least(p_user,p_target) and user_b_id = greatest(p_user,p_target) for update;
  if existing.input_signature = signature and public.valid_match_report(existing.compatibility_report) then
    return jsonb_build_object('matchScoreId',existing.id,'compatibility',existing.compatibility_report,'cached',true);
  end if;
  if p_signature is distinct from signature then
    raise exception 'Profile details changed. Please try again.' using errcode = '40001';
  end if;
  if public.valid_match_report(p_report) is not true or octet_length(p_report::text) > 262144 then
    raise exception 'Invalid compatibility report.' using errcode = '22023';
  end if;
  -- Refreshing a historical/changed-input report is free. Never bill a pair twice for a refresh.
  if existing.id is null then
    select s.allowed,s.transaction_id into allowed,debit from public.spend_user_credit(p_user,'Generated a compatibility report') s;
    if not allowed then raise exception 'Credits needed' using errcode = 'P0402'; end if;
  end if;
  insert into public.match_scores(user_a_id,user_b_id,generated_by,compatibility_score,compatibility_report,raw_report,generated_at,input_signature)
  values(least(p_user,p_target),greatest(p_user,p_target),p_user,(p_report->>'overallScore')::integer,
    p_report,coalesce(p_report->'raw','{}'),(p_report->>'generatedAt')::timestamptz,signature)
  on conflict(user_a_id,user_b_id) do update set
    generated_by = excluded.generated_by,
    compatibility_score = excluded.compatibility_score, compatibility_report = excluded.compatibility_report,
    raw_report = excluded.raw_report, generated_at = excluded.generated_at, input_signature = excluded.input_signature
  returning id into score_id;
  if debit is not null then
    update public.credit_transactions set metadata = metadata || jsonb_build_object(
      'action','match_score','targetUserId',p_target,'matchScoreId',score_id) where id = debit;
  end if;
  return jsonb_build_object('matchScoreId',score_id,'compatibility',p_report,'cached',false);
end;
$$;
revoke all on function public.commit_match_score(uuid,uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.commit_match_score(uuid,uuid,text,jsonb,jsonb) to service_role;
commit;
