alter table public.profiles
  add column if not exists birth_latitude double precision,
  add column if not exists birth_longitude double precision,
  add column if not exists birth_timezone text,
  add column if not exists kundli_generation_status text not null default 'pending';

alter table public.profiles
  drop constraint if exists profiles_birth_latitude_range,
  drop constraint if exists profiles_birth_longitude_range,
  drop constraint if exists profiles_kundli_generation_status_check;

alter table public.profiles
  add constraint profiles_birth_latitude_range
    check (birth_latitude is null or (birth_latitude >= -90 and birth_latitude <= 90)),
  add constraint profiles_birth_longitude_range
    check (birth_longitude is null or (birth_longitude >= -180 and birth_longitude <= 180)),
  add constraint profiles_kundli_generation_status_check
    check (kundli_generation_status in ('pending', 'generated', 'failed'));

create index if not exists profiles_kundli_generation_status_idx
  on public.profiles(kundli_generation_status);
