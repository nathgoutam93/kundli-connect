alter table public.messages
  add column if not exists status text not null default 'sent',
  add column if not exists read_at timestamptz;

alter table public.messages
  drop constraint if exists messages_status_check;

alter table public.messages
  add constraint messages_status_check
  check (status in ('sent', 'read'));

create index if not exists messages_chat_id_status_idx
  on public.messages(chat_id, status);

create or replace function public.send_chat_message(
  p_chat_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := nullif(btrim(p_body), '');
  v_message public.messages%rowtype;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if v_body is null then
    raise exception 'Message body is required';
  end if;

  if not exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.user_id = v_user_id
  ) then
    raise exception 'Chat not found';
  end if;

  insert into public.messages (chat_id, sender_id, body, status)
  values (p_chat_id, v_user_id, v_body, 'sent')
  returning * into v_message;

  update public.chats
  set updated_at = v_message.created_at
  where id = p_chat_id;

  update public.chat_participants
  set last_read_at = v_message.created_at
  where chat_id = p_chat_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'id', v_message.id,
    'createdAt', v_message.created_at,
    'senderId', 'me',
    'text', v_message.body,
    'status', v_message.status
  );
end;
$$;

create or replace function public.mark_chat_read(p_chat_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_read_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.user_id = v_user_id
  ) then
    raise exception 'Chat not found';
  end if;

  update public.chat_participants
  set last_read_at = v_read_at
  where chat_id = p_chat_id
    and user_id = v_user_id;

  update public.messages
  set status = 'read',
      read_at = coalesce(read_at, v_read_at)
  where chat_id = p_chat_id
    and sender_id <> v_user_id
    and status <> 'read';

  return v_read_at;
end;
$$;
