-- Performance follow-ups from the code review (no behaviour change).
--
-- 1. profile_cards checks blocks inline instead of calling is_blocked_with() once per row.
--    Same rule, same columns; the view keeps its owner-rights (security_invoker = false), which
--    is what lets it read user_blocks without exposing that table to clients.
-- 2. Indexes for the two foreign keys that had none, so account deletion (cascade / set null)
--    doesn't scan the whole table.

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
    where ms.invalidated_at is null and ms.user_a_id = least(p.id, (select auth.uid()))
      and ms.user_b_id = greatest(p.id, (select auth.uid()))) as compatibility_report
from public.profiles p
where (select auth.uid()) is not null
  and (
    p.id = (select auth.uid())
    or (
      p.suspended_at is null
      -- Inline rather than is_blocked_with(): a SECURITY DEFINER function isn't inlined, so it
      -- ran once per candidate row. The view's owner reads user_blocks directly.
      and not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
      )
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

-- user_blocks is keyed (blocker_id, blocked_id) with an index on (blocked_id, blocker_id), so both
-- directions of the inline check are index lookups.

create index if not exists discovery_passes_passed_user_id_idx on public.discovery_passes(passed_user_id);
create index if not exists match_scores_generated_by_idx on public.match_scores(generated_by);
