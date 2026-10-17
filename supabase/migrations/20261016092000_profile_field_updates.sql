-- Revoke the old whole-profile write path, including for older installed clients.
begin;
create or replace function public.update_profile_fields(
  p_updates jsonb, p_expected_updated_at timestamptz, p_complete_onboarding boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_next public.profiles%rowtype;
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_updates) as keys(key) where key <> all(array['email', 'display_name', 'gender', 'gender_preferences', 'height', 'date_of_birth', 'time_of_birth', 'birth_place', 'birth_latitude', 'birth_longitude', 'birth_timezone', 'location', 'bio', 'family_plans', 'family_plans_visible_on_profile', 'workplace', 'workplace_visible_on_profile', 'job_role', 'job_role_visible_on_profile', 'school', 'school_visible_on_profile', 'education_level', 'education_level_visible_on_profile', 'religious_beliefs', 'drinking', 'drinking_visible_on_profile', 'smoking', 'smoking_visible_on_profile'])
  ) then raise exception 'Invalid profile fields.' using errcode = '22023'; end if;
  select * into v_profile from public.profiles where id = v_user for update;
  if not found then raise exception 'Profile not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or p_expected_updated_at <> v_profile.updated_at then
    raise exception 'Your profile changed. Reload it before saving again.' using errcode = '40001';
  end if;
  v_next := jsonb_populate_record(v_profile, p_updates);
  if v_profile.onboarding_completed and row(v_next.date_of_birth, v_next.time_of_birth, v_next.birth_place,
    v_next.birth_latitude, v_next.birth_longitude, v_next.birth_timezone) is distinct from row(v_profile.date_of_birth,
    v_profile.time_of_birth, v_profile.birth_place, v_profile.birth_latitude, v_profile.birth_longitude, v_profile.birth_timezone) then
    raise exception 'Birth details are locked after onboarding.' using errcode = '22023';
  end if;
  if (v_next.date_of_birth is distinct from v_profile.date_of_birth or p_complete_onboarding)
    and (v_next.date_of_birth is null or v_next.date_of_birth > public.latest_adult_birth_date()) then
    raise exception 'You must be 18 or older to use Kundali Konnect.' using errcode = '23514';
  end if;
  update public.profiles set
    email = v_next.email,
    display_name = v_next.display_name,
    gender = v_next.gender,
    gender_preferences = v_next.gender_preferences,
    height = v_next.height,
    date_of_birth = v_next.date_of_birth,
    time_of_birth = v_next.time_of_birth,
    birth_place = v_next.birth_place,
    birth_latitude = v_next.birth_latitude,
    birth_longitude = v_next.birth_longitude,
    birth_timezone = v_next.birth_timezone,
    location = v_next.location,
    bio = v_next.bio,
    family_plans = v_next.family_plans,
    family_plans_visible_on_profile = v_next.family_plans_visible_on_profile,
    workplace = v_next.workplace,
    workplace_visible_on_profile = v_next.workplace_visible_on_profile,
    job_role = v_next.job_role,
    job_role_visible_on_profile = v_next.job_role_visible_on_profile,
    school = v_next.school,
    school_visible_on_profile = v_next.school_visible_on_profile,
    education_level = v_next.education_level,
    education_level_visible_on_profile = v_next.education_level_visible_on_profile,
    religious_beliefs = v_next.religious_beliefs,
    drinking = v_next.drinking,
    drinking_visible_on_profile = v_next.drinking_visible_on_profile,
    smoking = v_next.smoking,
    smoking_visible_on_profile = v_next.smoking_visible_on_profile,
    onboarding_completed = v_profile.onboarding_completed or coalesce(p_complete_onboarding, false),
    updated_at = clock_timestamp()
  where id = v_user;
end;
$$;
revoke all on function public.update_profile_fields(jsonb, timestamptz, boolean) from public, anon;
grant execute on function public.update_profile_fields(jsonb, timestamptz, boolean) to authenticated;
revoke update on public.profiles from authenticated;
commit;
