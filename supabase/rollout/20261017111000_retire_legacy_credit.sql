-- Run once, after inventorying hosted Edge Functions, jobs and supported clients for
-- spend_credit(text) calls. This is separate from automatic migrations so the database
-- rollout cannot silently break a still-deployed legacy caller. See the batch 5 rollout doc.
begin;
-- DROP uses RESTRICT (the default): dependencies fail the whole transaction. Never CASCADE.
do $$ begin
  if to_regprocedure('public.spend_credit(text)') is not null then
    revoke all on function public.spend_credit(text) from public,anon,authenticated,service_role;
    drop function public.spend_credit(text) restrict;
  end if;
end $$;
-- The supported, service-only credit path must still exist after retiring the shim.
do $$ begin
  assert to_regprocedure('public.spend_user_credit(uuid,text)') is not null,
    'Supported credit function is missing';
  assert to_regprocedure('public.spend_credit(text)') is null, 'Legacy function still exists';
end $$;
commit;
