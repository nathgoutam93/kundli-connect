begin;
-- Include only the requesting person's stored report; never synthesize a compatibility score.
create or replace view public.profile_cards
with (security_invoker = false) as
select
  p.id,
  p.display_name,
  p.gender,
  p.gender_preferences,
  p.height,
  case
    when p.date_of_birth is null then null
    else extract(year from age(current_date, p.date_of_birth))::integer
  end as age,
  p.location,
  p.bio,
  case when p.family_plans_visible_on_profile then p.family_plans end as family_plans,
  p.family_plans_visible_on_profile,
  case when p.workplace_visible_on_profile then p.workplace end as workplace,
  p.workplace_visible_on_profile,
  case when p.job_role_visible_on_profile then p.job_role end as job_role,
  p.job_role_visible_on_profile,
  case when p.school_visible_on_profile then p.school end as school,
  p.school_visible_on_profile,
  case when p.education_level_visible_on_profile then p.education_level end as education_level,
  p.education_level_visible_on_profile,
  p.religious_beliefs,
  case when p.drinking_visible_on_profile then p.drinking end as drinking,
  p.drinking_visible_on_profile,
  case when p.smoking_visible_on_profile then p.smoking end as smoking,
  p.smoking_visible_on_profile,
  p.onboarding_completed,
  p.is_discoverable,
  p.created_at,
  coalesce(
    (
      select array_agg(pp.storage_path order by pp.sort_order)
      from public.profile_photos pp
      where pp.user_id = p.id
    ),
    '{}'::text[]
  ) as photo_paths,
  (select ms.compatibility_report from public.match_scores ms
    where ms.user_a_id = least(p.id, (select auth.uid()))
      and ms.user_b_id = greatest(p.id, (select auth.uid()))) as compatibility_report
from public.profiles p
where (select auth.uid()) is not null
  and (
    p.id = (select auth.uid())
    or (
      p.suspended_at is null
      and not public.is_blocked_with(p.id)
      and (
        (p.onboarding_completed and p.is_discoverable)
        or exists (
          select 1
          from public.likes l
          where (l.from_user_id = (select auth.uid()) and l.to_user_id = p.id)
             or (l.to_user_id = (select auth.uid()) and l.from_user_id = p.id)
        )
      )
    )
  );

revoke all on public.profile_cards from public, anon;
grant select on public.profile_cards to authenticated;


create or replace function public.get_effective_subscription()
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce((select jsonb_build_object(
    'planId',plan_id,
    'status',case when status = 'active' and renewal_date > now() then 'active' when status = 'free' then 'free' else 'expired' end,
    'renewalDate',renewal_date, 'restoredAt',restored_at,
    'remainingMs',case when status = 'active' and renewal_date > now()
      then floor(extract(epoch from (renewal_date-now()))*1000) else 0 end
  ) from public.user_subscriptions where user_id = (select auth.uid())), '{"status":"free","remainingMs":0}'::jsonb);
$$;
revoke all on function public.get_effective_subscription() from public, anon;
grant execute on function public.get_effective_subscription() to authenticated;

update public.subscription_plans plans set features = coalesce((
  select jsonb_agg(feature) from jsonb_array_elements(plans.features) items(feature)
  where feature #>> '{}' not in ('Priority likes inbox','Advanced compatibility reports','Profile boost every week')
), '[]'::jsonb) where jsonb_typeof(features) = 'array';
update public.subscription_plans set features = jsonb_build_array('Likes and compatibility scores included',credit_bonus::text || ' bonus credits')
where id in ('plus-monthly','premium-quarterly');
commit;
