-- Birth details are fixed once onboarding is complete, and Kundlis store their chart layout.
--
-- 1. Birth date, time and place drive the Kundli and every match score, and onboarding tells
--    people they can't be changed later. Direct API updates now keep the stored values once
--    `onboarding_completed` is true, and onboarding can't be reset to unlock them. The service
--    role (support tooling, Edge Functions) is unaffected.
-- 2. `kundlis.chart_houses` holds the house-by-house chart (sign and planets per house) for each
--    divisional chart, so the app can draw the chart itself instead of relying on an image.

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The phone number comes from the verified sign-in, never from the request body.
    new.phone := nullif(coalesce(v_claims ->> 'phone', current_setting('request.jwt.claim.phone', true)), '');
    new.verification_status := 'unverified';
    new.kundli_generation_status := 'pending';
    new.is_discoverable := true;
    new.created_at := now();
  else
    new.id := old.id;
    new.phone := old.phone;
    new.verification_status := old.verification_status;
    new.kundli_generation_status := old.kundli_generation_status;
    new.is_discoverable := old.is_discoverable;
    new.created_at := old.created_at;

    if old.onboarding_completed then
      new.onboarding_completed := true;
      new.date_of_birth := old.date_of_birth;
      new.time_of_birth := old.time_of_birth;
      new.birth_place := old.birth_place;
      new.birth_latitude := old.birth_latitude;
      new.birth_longitude := old.birth_longitude;
      new.birth_timezone := old.birth_timezone;
    end if;
  end if;

  return new;
end;
$$;

alter table public.kundlis
  add column if not exists chart_houses jsonb not null default '{}'::jsonb;

comment on column public.kundlis.chart_houses is
  'Per divisional chart (e.g. D1, D9): 12 houses in order from the ascendant, each {house, sign, signName, planets: [{name, abbr, degree}]}.';
