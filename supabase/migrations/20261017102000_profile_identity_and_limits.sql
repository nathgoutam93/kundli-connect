begin;
-- Existing editable addresses are contact data, never proof of account ownership.
alter table public.profiles drop constraint profiles_email_key;
comment on column public.profiles.email is 'Editable, non-unique contact email for receipts. Not an authentication identity.';
alter table public.profiles add column verified_email text, add column email_verified_at timestamptz;

create function public.enforce_profile_identity_and_limits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Grandfather oversized historical text until reviewed. Unrelated edits remain possible.
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then
    if char_length(coalesce(new.display_name,'')) > 80 then
      raise exception 'Name must be 80 characters or fewer.' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' or new.bio is distinct from old.bio then
    if char_length(coalesce(new.bio,'')) > 500 then
      raise exception 'Bio must be 500 characters or fewer.' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' or new.email is distinct from old.email then
    new.email := nullif(lower(btrim(new.email)), '');
    if new.email is not null and (char_length(new.email) > 254 or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
      raise exception 'Enter a valid contact email.' using errcode = '22023';
    end if;
  end if;
  -- Recompute from Auth even for service writes. Client metadata/JWT claims are not proof.
  new.verified_email := null;
  new.email_verified_at := null;
  select lower(u.email),u.email_confirmed_at into new.verified_email,new.email_verified_at
    from auth.users u where u.id = new.id and u.email_confirmed_at is not null and nullif(u.email,'') is not null;
  return new;
end;
$$;
revoke all on function public.enforce_profile_identity_and_limits() from public,anon,authenticated;
create trigger enforce_profile_identity_and_limits before insert or update on public.profiles
for each row execute function public.enforce_profile_identity_and_limits();

create function public.sync_verified_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    verified_email = case when new.email_confirmed_at is not null then lower(nullif(new.email,'')) end,
    email_verified_at = case when new.email_confirmed_at is not null and nullif(new.email,'') is not null then new.email_confirmed_at end
  where id = new.id;
  return new;
end;
$$;
revoke all on function public.sync_verified_profile_email() from public,anon,authenticated;
create trigger sync_verified_profile_email after insert or update of email,email_confirmed_at on auth.users
for each row execute function public.sync_verified_profile_email();

-- Preserve every contact address and profile text; backfill verified identity only from Auth.
update public.profiles p set verified_email = case when u.email_confirmed_at is not null then lower(nullif(u.email,'')) end,
  email_verified_at = case when u.email_confirmed_at is not null and nullif(u.email,'') is not null then u.email_confirmed_at end
from auth.users u where u.id = p.id;
commit;
