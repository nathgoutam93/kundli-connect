create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  email text unique,
  display_name text,
  gender text,
  date_of_birth date,
  time_of_birth time,
  birth_place text,
  location text,
  bio text,
  onboarding_completed boolean not null default false,
  verification_status text not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.kundlis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  raw_response jsonb not null,
  parsed_summary jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.likes (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  opening_message text,
  compatibility_score integer,
  compatibility_report jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id),
  check (status in ('pending', 'matched', 'dismissed'))
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  like_id uuid unique references public.likes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_participants (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  primary key (chat_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now()
);

create index profiles_onboarding_completed_idx on public.profiles(onboarding_completed);
create index profile_photos_user_id_sort_order_idx on public.profile_photos(user_id, sort_order);
create index likes_to_user_id_status_idx on public.likes(to_user_id, status);
create index messages_chat_id_created_at_idx on public.messages(chat_id, created_at);
create index credit_transactions_user_id_created_at_idx on public.credit_transactions(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.profile_photos enable row level security;
alter table public.kundlis enable row level security;
alter table public.likes enable row level security;
alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;
alter table public.messages enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.push_tokens enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can manage own profile photos"
on public.profile_photos for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own profile photo objects"
on storage.objects for select
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can upload own profile photo objects"
on storage.objects for insert
with check (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update own profile photo objects"
on storage.objects for update
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete own profile photo objects"
on storage.objects for delete
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can read own kundli"
on public.kundlis for select
using (auth.uid() = user_id);

create policy "Users can read likes involving them"
on public.likes for select
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "Users can create sent likes"
on public.likes for insert
with check (auth.uid() = from_user_id);

create policy "Users can update received likes"
on public.likes for update
using (auth.uid() = to_user_id);

create policy "Users can read own chat participation"
on public.chat_participants for select
using (auth.uid() = user_id);

create policy "Users can read chats they participate in"
on public.chats for select
using (
  exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = chats.id
      and cp.user_id = auth.uid()
  )
);

create policy "Users can read messages in their chats"
on public.messages for select
using (
  exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = messages.chat_id
      and cp.user_id = auth.uid()
  )
);

create policy "Users can send messages in their chats"
on public.messages for insert
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = messages.chat_id
      and cp.user_id = auth.uid()
  )
);

create policy "Users can read own credit transactions"
on public.credit_transactions for select
using (auth.uid() = user_id);

create policy "Users can manage own push tokens"
on public.push_tokens for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
