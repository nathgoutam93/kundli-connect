begin;

update storage.buckets set public = false, file_size_limit = 2097152 where id = 'profile-photos';

create table public.photo_uploads (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  replace_path text,
  status text not null default 'pending' check (status in ('pending', 'committed', 'cancelled')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);
create index photo_uploads_pending_idx on public.photo_uploads(user_id, expires_at) where status = 'pending';
alter table public.photo_uploads enable row level security;
revoke all on public.photo_uploads from public, anon, authenticated;

create table public.photo_cleanup_queue (
  storage_path text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.photo_cleanup_queue enable row level security;
revoke all on public.photo_cleanup_queue from public, anon, authenticated;

-- Use the same safe projection as the app. The view reads photo references, not Storage,
-- so this does not introduce recursive object policies.
create or replace function public.can_read_profile_photo(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.profile_photos pp join public.profile_cards c on c.id = pp.user_id
    where pp.storage_path = p_path
  );
$$;
revoke all on function public.can_read_profile_photo(text) from public, anon;
grant execute on function public.can_read_profile_photo(text) to authenticated;

create or replace function public.can_upload_profile_photo(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.photo_uploads
    where storage_path = p_path and user_id = auth.uid() and status = 'pending' and expires_at > now());
$$;
revoke all on function public.can_upload_profile_photo(text) from public, anon;
grant execute on function public.can_upload_profile_photo(text) to authenticated;

create or replace function public.can_delete_profile_photo_object(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.photo_cleanup_queue where storage_path = p_path and user_id = auth.uid())
    and not exists (select 1 from public.profile_photos where storage_path = p_path);
$$;
revoke all on function public.can_delete_profile_photo_object(text) from public, anon;
grant execute on function public.can_delete_profile_photo_object(text) to authenticated;

drop policy if exists "Users can read own profile photo objects" on storage.objects;
drop policy if exists "Users can upload own profile photo objects" on storage.objects;
drop policy if exists "Users can update own profile photo objects" on storage.objects;
drop policy if exists "Users can delete own profile photo objects" on storage.objects;
create policy "Authorized profile photo reads" on storage.objects for select to authenticated
using (bucket_id = 'profile-photos' and auth.uid()::text = (storage.foldername(name))[1] and (
  public.can_read_profile_photo(name)
  or public.can_upload_profile_photo(name)
  or public.can_delete_profile_photo_object(name)
));
create policy "Reserved profile photo uploads" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-photos' and auth.uid()::text = (storage.foldername(name))[1]
  and public.can_upload_profile_photo(name));
-- Registered files are immutable; replacing a photo uses a fresh reserved path.
create policy "Retired profile photo deletion" on storage.objects for delete to authenticated
using (bucket_id = 'profile-photos' and auth.uid()::text = (storage.foldername(name))[1]
  and public.can_delete_profile_photo_object(name));

revoke insert, update, delete on public.profile_photos from authenticated;

create or replace function public.reserve_profile_photo(p_upload_id uuid, p_replace_path text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_upload public.photo_uploads%rowtype; v_count integer;
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if p_upload_id is null then raise exception 'Missing upload ID.' using errcode = '22023'; end if;
  perform 1 from public.profiles where id = v_user for update;
  if not found then raise exception 'Profile not found.' using errcode = 'P0002'; end if;
  select * into v_upload from public.photo_uploads where id = p_upload_id;
  if found then
    if v_upload.user_id <> v_user or v_upload.replace_path is distinct from p_replace_path then
      raise exception 'Upload unavailable.' using errcode = 'P0002';
    end if;
    if v_upload.status = 'committed' and not exists (select 1 from public.profile_photos where user_id = v_user and storage_path = v_upload.storage_path) then
      raise exception 'This photo has changed. Reload your profile.' using errcode = '22023';
    end if;
    return to_jsonb(v_upload);
  end if;
  if p_replace_path is not null then
    if not exists (select 1 from public.profile_photos where user_id = v_user and storage_path = p_replace_path) then
      raise exception 'The photo has changed. Reload before replacing it.' using errcode = '22023';
    end if;
    if exists (select 1 from public.photo_uploads where user_id = v_user and replace_path is not null and status = 'pending' and expires_at > now()) then
      raise exception 'Another replacement is in progress. Try again shortly.' using errcode = '22023';
    end if;
  else
    select (select count(*) from public.profile_photos where user_id = v_user)
      + (select count(*) from public.photo_uploads where user_id = v_user and replace_path is null and status = 'pending' and expires_at > now()) into v_count;
    if v_count >= 6 then raise exception 'You can keep up to 6 profile photos.' using errcode = '22023'; end if;
  end if;
  perform public.consume_action_limit(v_user, 'photo', 3600, 30);
  insert into public.photo_uploads(id,user_id,storage_path,replace_path)
    values (p_upload_id,v_user,v_user::text || '/' || p_upload_id::text || '.jpg',p_replace_path)
    returning * into v_upload;
  return to_jsonb(v_upload);
end;
$$;
revoke all on function public.reserve_profile_photo(uuid,text) from public, anon;
grant execute on function public.reserve_profile_photo(uuid,text) to authenticated;

create or replace function public.commit_profile_photo(p_upload_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_upload public.photo_uploads%rowtype; v_size bigint; v_order integer;
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  perform 1 from public.profiles where id = v_user for update;
  select * into v_upload from public.photo_uploads where id = p_upload_id and user_id = v_user for update;
  if not found then raise exception 'Upload unavailable.' using errcode = 'P0002'; end if;
  if v_upload.status = 'committed' then
    if not exists (select 1 from public.profile_photos where user_id = v_user and storage_path = v_upload.storage_path) then
      raise exception 'This photo has changed. Reload your profile.' using errcode = '22023';
    end if;
    return v_upload.storage_path;
  end if;
  if v_upload.status <> 'pending' or v_upload.expires_at <= now() then
    raise exception 'Upload expired. Select the photo again.' using errcode = '22023';
  end if;
  select (metadata->>'size')::bigint into v_size from storage.objects
    where bucket_id = 'profile-photos' and name = v_upload.storage_path and metadata->>'mimetype' = 'image/jpeg';
  if coalesce(v_size,0) < 1 or v_size > 2097152 then
    raise exception 'The uploaded photo is missing or too large.' using errcode = '22023';
  end if;
  if v_upload.replace_path is not null then
    update public.profile_photos set storage_path = v_upload.storage_path
      where user_id = v_user and storage_path = v_upload.replace_path;
    if not found then raise exception 'The photo has changed. Reload before replacing it.' using errcode = '22023'; end if;
    insert into public.photo_cleanup_queue(storage_path,user_id) values (v_upload.replace_path,v_user) on conflict do nothing;
  else
    if (select count(*) from public.profile_photos where user_id = v_user) >= 6 then
      raise exception 'You can keep up to 6 profile photos.' using errcode = '22023';
    end if;
    select coalesce(max(sort_order),-1)+1 into v_order from public.profile_photos where user_id = v_user;
    insert into public.profile_photos(id,user_id,storage_path,sort_order) values (p_upload_id,v_user,v_upload.storage_path,v_order);
  end if;
  update public.photo_uploads set status = 'committed' where id = p_upload_id;
  return v_upload.storage_path;
end;
$$;
revoke all on function public.commit_profile_photo(uuid) from public, anon;
grant execute on function public.commit_profile_photo(uuid) to authenticated;

create or replace function public.cancel_profile_photo(p_upload_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_upload public.photo_uploads%rowtype;
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  perform 1 from public.profiles where id = v_user for update;
  select * into v_upload from public.photo_uploads where id = p_upload_id and user_id = v_user for update;
  if not found or v_upload.status = 'committed' then return false; end if;
  update public.photo_uploads set status = 'cancelled' where id = p_upload_id;
  insert into public.photo_cleanup_queue(storage_path,user_id) values (v_upload.storage_path,v_user) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.cancel_profile_photo(uuid) from public, anon;
grant execute on function public.cancel_profile_photo(uuid) to authenticated;

create or replace function public.remove_profile_photo(p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_complete boolean;
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  select onboarding_completed into v_complete from public.profiles where id = v_user for update;
  if not exists (select 1 from public.profile_photos where user_id = v_user and storage_path = p_path) then return; end if;
  if v_complete and (select count(*) from public.profile_photos where user_id = v_user) <= 4 then
    raise exception 'Please keep at least 4 profile photos. You can replace a photo instead.' using errcode = '22023';
  end if;
  delete from public.profile_photos where user_id = v_user and storage_path = p_path;
  insert into public.photo_cleanup_queue(storage_path,user_id) values (p_path,v_user) on conflict do nothing;
end;
$$;
revoke all on function public.remove_profile_photo(text) from public, anon;
grant execute on function public.remove_profile_photo(text) to authenticated;

create or replace function public.reorder_profile_photos(p_storage_paths text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  perform 1 from public.profiles where id = v_user for update;
  if p_storage_paths is null
    or cardinality(p_storage_paths) <> (select count(*) from public.profile_photos where user_id = v_user)
    or cardinality(p_storage_paths) <> (select count(distinct path) from unnest(p_storage_paths) paths(path))
    or exists (select 1 from unnest(p_storage_paths) paths(path)
      where not exists (select 1 from public.profile_photos where user_id = v_user and storage_path = path)) then
    raise exception 'Photos changed. Reload before reordering.' using errcode = '22023';
  end if;
  update public.profile_photos pp set sort_order = ordered.position - 1
    from unnest(p_storage_paths) with ordinality ordered(path,position)
    where pp.user_id = v_user and pp.storage_path = ordered.path;
end;
$$;

create or replace function public.require_onboarding_photos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.onboarding_completed and not old.onboarding_completed
    and (select count(*) from public.profile_photos where user_id = new.id) not between 4 and 6 then
    raise exception 'Add 4 to 6 photos before finishing setup.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.require_onboarding_photos() from public, anon, authenticated;
create trigger profiles_require_onboarding_photos before update of onboarding_completed on public.profiles
for each row execute function public.require_onboarding_photos();

-- A scheduled worker deletes via Storage's API. Never delete storage.objects rows in SQL.
create or replace function public.get_photo_cleanup(p_limit integer default 100)
returns table(storage_path text) language plpgsql security definer set search_path = public as $$
declare expired public.photo_uploads%rowtype;
begin
  for expired in select * from public.photo_uploads where status = 'pending' and expires_at <= now()
    order by expires_at limit least(greatest(p_limit,1),100) for update skip locked loop
    update public.photo_uploads set status = 'cancelled' where id = expired.id;
    insert into public.photo_cleanup_queue(storage_path,user_id) values (expired.storage_path,expired.user_id) on conflict do nothing;
  end loop;
  return query select q.storage_path from public.photo_cleanup_queue q
    where not exists (select 1 from public.profile_photos pp where pp.storage_path = q.storage_path)
    order by q.created_at limit least(greatest(p_limit,1),100);
end;
$$;
revoke all on function public.get_photo_cleanup(integer) from public, anon, authenticated;
grant execute on function public.get_photo_cleanup(integer) to service_role;

create or replace function public.acknowledge_photo_cleanup(p_paths text[])
returns void language sql security definer set search_path = public as $$
  delete from public.photo_cleanup_queue q where q.storage_path = any(p_paths)
    and not exists (select 1 from public.profile_photos pp where pp.storage_path = q.storage_path);
$$;
revoke all on function public.acknowledge_photo_cleanup(text[]) from public, anon, authenticated;
grant execute on function public.acknowledge_photo_cleanup(text[]) to service_role;
commit;
