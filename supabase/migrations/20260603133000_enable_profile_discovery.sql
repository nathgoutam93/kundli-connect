do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Authenticated users can read completed discovery profiles'
  ) then
    create policy "Authenticated users can read completed discovery profiles"
    on public.profiles for select
    using (
      auth.uid() is not null
      and onboarding_completed = true
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_photos'
      and policyname = 'Authenticated users can read discovery profile photos'
  ) then
    create policy "Authenticated users can read discovery profile photos"
    on public.profile_photos for select
    using (
      auth.uid() is not null
      and exists (
        select 1
        from public.profiles
        where profiles.id = profile_photos.user_id
          and profiles.onboarding_completed = true
      )
    );
  end if;
end
$$;
