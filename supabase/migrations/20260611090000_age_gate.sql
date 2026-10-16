-- Age gate: Kundali Konnect is for adults (18+), matching the app's onboarding picker.
--
-- Clients can't save a date of birth that makes them under 18, and can't finish onboarding
-- without an 18+ date of birth. The check only runs when the date of birth is set or changed (or
-- onboarding is being completed), so existing profiles keep saving other fields normally. The
-- service role (dashboard, Edge Functions) is not checked, so support can still correct records.
--
-- To find profiles saved before this migration that are under 18:
--   select id, display_name, date_of_birth from public.profiles
--   where date_of_birth > public.latest_adult_birth_date();

-- The latest date of birth of someone who is 18 today anywhere in the world. "Today" is taken in
-- the earliest time zone (UTC+14) so a user whose 18th birthday has started locally is never
-- refused because the server's clock (UTC) is still on the day before.
create or replace function public.latest_adult_birth_date()
returns date
language sql
stable
set search_path = public
as $$
  select (((now() at time zone 'UTC') + interval '14 hours')::date - interval '18 years')::date;
$$;

grant execute on function public.latest_adult_birth_date() to anon, authenticated, service_role;

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_check_age boolean := false;
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
    new.suspended_at := null;
    new.created_at := now();

    -- An upsert runs this INSERT trigger even when the row exists; the UPDATE trigger that follows
    -- checks it then, so only brand-new rows are checked here.
    if not exists (select 1 from public.profiles where id = new.id) then
      v_check_age := new.date_of_birth is not null or new.onboarding_completed;
    end if;
  else
    new.id := old.id;
    new.phone := old.phone;
    new.verification_status := old.verification_status;
    new.kundli_generation_status := old.kundli_generation_status;
    new.is_discoverable := old.is_discoverable;
    new.suspended_at := old.suspended_at;
    new.created_at := old.created_at;

    if old.onboarding_completed then
      new.onboarding_completed := true;
      new.date_of_birth := old.date_of_birth;
      new.time_of_birth := old.time_of_birth;
      new.birth_place := old.birth_place;
      new.birth_latitude := old.birth_latitude;
      new.birth_longitude := old.birth_longitude;
      new.birth_timezone := old.birth_timezone;
    else
      v_check_age := new.date_of_birth is distinct from old.date_of_birth or new.onboarding_completed;
    end if;
  end if;

  if v_check_age then
    if new.onboarding_completed and new.date_of_birth is null then
      raise exception 'Add your date of birth to finish setting up your profile.' using errcode = '23514';
    end if;
    if new.date_of_birth > public.latest_adult_birth_date() then
      raise exception 'You must be 18 or older to use Kundali Konnect.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
