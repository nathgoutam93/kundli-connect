insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kundli-charts',
  'kundli-charts',
  false,
  10485760,
  array['image/png', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.kundlis
  add column if not exists chart_image_paths jsonb not null default '{}'::jsonb,
  add column if not exists chart_raw_responses jsonb not null default '{}'::jsonb;

create policy "Users can read own kundli chart objects"
on storage.objects for select
using (
  bucket_id = 'kundli-charts'
  and auth.uid()::text = (storage.foldername(name))[1]
);
