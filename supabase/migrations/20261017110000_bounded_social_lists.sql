begin;
create index likes_incoming_cursor_idx on public.likes(to_user_id,created_at desc,id desc) where status = 'pending';
create index likes_sent_cursor_idx on public.likes(from_user_id,created_at desc,id desc);
create index likes_unread_idx on public.likes(to_user_id,from_user_id) where status = 'pending' and read_at is null;
create index messages_chat_cursor_idx on public.messages(chat_id,created_at desc,id desc);
drop index public.messages_chat_id_created_at_idx;
create index profiles_discovery_cursor_idx on public.profiles(created_at desc,id desc) where onboarding_completed and is_discoverable;
drop index public.profiles_discoverable_created_at_idx;
create index user_blocks_cursor_idx on public.user_blocks(blocker_id,created_at desc,blocked_id desc);
create index chats_updated_cursor_idx on public.chats(updated_at desc,id desc);

create function public.get_incoming_likes_page(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null)
returns table(id uuid,from_user_id uuid,opening_message text,created_at timestamptz,compatibility_report jsonb,profile jsonb,read_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select l.id,l.from_user_id,l.opening_message,l.created_at,ms.compatibility_report,to_jsonb(c),l.read_at
  from public.likes l
  join public.profile_cards c on c.id = l.from_user_id
  left join public.match_scores ms on ms.id = l.match_score_id
  where l.to_user_id = (select auth.uid()) and l.status = 'pending'
    and (p_before is null or (l.created_at,l.id) < (p_before,p_before_id))
  order by l.created_at desc,l.id desc limit least(greatest(coalesce(p_limit,30),1),100);
$$;
create or replace function public.get_incoming_likes()
returns table(id uuid,from_user_id uuid,opening_message text,created_at timestamptz,compatibility_report jsonb,profile jsonb,read_at timestamptz)
language sql stable security invoker set search_path = public as $$ select * from public.get_incoming_likes_page(50); $$;

create function public.get_sent_likes_page(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null)
returns table(id uuid,to_user_id uuid,opening_message text,status text,created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select l.id,l.to_user_id,l.opening_message,l.status,l.created_at from public.likes l
  where l.from_user_id = (select auth.uid()) and (p_before is null or (l.created_at,l.id) < (p_before,p_before_id))
  order by l.created_at desc,l.id desc limit least(greatest(coalesce(p_limit,30),1),100);
$$;

create function public.get_blocked_users_page(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null)
returns table(user_id uuid,display_name text,photo_path text,blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.blocked_id,p.display_name,null::text,b.created_at
  from public.user_blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid()) and (p_before is null or (b.created_at,b.blocked_id) < (p_before,p_before_id))
  order by b.created_at desc,b.blocked_id desc limit least(greatest(coalesce(p_limit,30),1),100);
$$;
create or replace function public.get_blocked_users()
returns table(user_id uuid,display_name text,photo_path text,blocked_at timestamptz)
language sql stable security invoker set search_path = public as $$ select * from public.get_blocked_users_page(50); $$;

create function public.get_chat_messages_page(p_chat_id uuid,p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null)
returns setof public.messages language sql stable security invoker set search_path = public as $$
  select m.* from public.messages m where m.chat_id = p_chat_id
    and (p_before is null or (m.created_at,m.id) < (p_before,p_before_id))
  order by m.created_at desc,m.id desc limit least(greatest(coalesce(p_limit,30),1),100);
$$;

create function public.get_social_unread_counts()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('likes',(
    select count(*) from public.likes l join public.profile_cards c on c.id = l.from_user_id
    where l.to_user_id = (select auth.uid()) and l.status = 'pending' and l.read_at is null
  ),'messages',(
    select count(*) from public.messages m join public.chats ch on ch.id = m.chat_id
    join public.chat_participants cp on cp.chat_id = ch.id and cp.user_id = (select auth.uid()) and not cp.hidden
    join public.profile_cards c on c.id = m.sender_id
    where m.sender_id <> (select auth.uid()) and m.status <> 'read'
  ));
$$;

create or replace function public.get_chat_previews_page(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null,p_chat_id uuid default null)
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  hidden boolean,
  participant_id uuid,
  compatibility_report jsonb,
  last_message jsonb,
  unread_count integer,
  participant jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
select
    ch.id,
    ch.created_at,
    ch.updated_at,
    cp.hidden,
    partner.id as participant_id,
    ms.compatibility_report,
    case when lm.id is null then null else jsonb_build_object(
      'id', lm.id,
      'sender_id', lm.sender_id,
      'body', lm.body,
      'status', lm.status,
      'read_at', lm.read_at,
      'created_at', lm.created_at,
      'client_request_id',lm.client_request_id
    ) end as last_message,
    coalesce(unread.total, 0)::integer as unread_count,
    to_jsonb(card) as participant
  from public.chat_participants cp
  join public.chats ch on ch.id = cp.chat_id
  join public.likes l on l.id = ch.like_id
  cross join lateral (
    select case when l.from_user_id = cp.user_id then l.to_user_id else l.from_user_id end as id
  ) partner
  join public.profile_cards card on card.id = partner.id
  left join public.match_scores ms on ms.id = l.match_score_id
  left join lateral (
    select m.id, m.sender_id, m.body, m.status, m.read_at, m.created_at,m.client_request_id
    from public.messages m
    where m.chat_id = ch.id
    order by m.created_at desc,m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as total
    from public.messages m
    where m.chat_id = ch.id
      and m.sender_id <> cp.user_id
      and m.status <> 'read'
  ) unread on true
  where cp.user_id = (select auth.uid())
    and (p_chat_id is null or ch.id = p_chat_id)
    and (p_before is null or (ch.updated_at,ch.id) < (p_before,p_before_id))
  order by ch.updated_at desc,ch.id desc
  limit least(greatest(coalesce(p_limit,30),1),100);
$$;

create or replace function public.get_chat_previews()
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  hidden boolean,
  participant_id uuid,
  compatibility_report jsonb,
  last_message jsonb,
  unread_count integer,
  participant jsonb
)
language sql
stable
security invoker
set search_path = public
as $$ select * from public.get_chat_previews_page(50); $$;

revoke all on function public.get_incoming_likes_page(integer,timestamptz,uuid) from public,anon;
revoke all on function public.get_sent_likes_page(integer,timestamptz,uuid) from public,anon;
revoke all on function public.get_blocked_users_page(integer,timestamptz,uuid) from public,anon;
revoke all on function public.get_chat_previews_page(integer,timestamptz,uuid,uuid) from public,anon;
revoke all on function public.get_chat_messages_page(uuid,integer,timestamptz,uuid) from public,anon;
revoke all on function public.get_social_unread_counts() from public,anon;
grant execute on function public.get_incoming_likes_page(integer,timestamptz,uuid),
  public.get_sent_likes_page(integer,timestamptz,uuid),public.get_blocked_users_page(integer,timestamptz,uuid),
  public.get_chat_previews_page(integer,timestamptz,uuid,uuid),public.get_chat_messages_page(uuid,integer,timestamptz,uuid),
  public.get_social_unread_counts() to authenticated;
commit;
