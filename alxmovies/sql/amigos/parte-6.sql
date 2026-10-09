-- ============================================================
-- AMIGOS — PARTE 6 DE 7: Mensagens e notificações
-- Rode as partes NA ORDEM (1 a 7), uma de cada vez, no SQL Editor.
-- Esta parte é curta de propósito, pra caber na hora de colar.
-- ============================================================

-- ------------------------------------------------------------
-- MENSAGENS
-- ------------------------------------------------------------

create or replace function public.social_send_message(
  p_profile_id uuid,
  p_friendship_id uuid,
  p_body text,
  p_kind text default 'text',
  p_payload jsonb default null
) returns public.friend_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.friendships;
  v_other uuid;
  v_msg public.friend_messages;
begin
  perform public.social_check_owner(p_profile_id);

  select * into v_f
  from public.friendships
  where id = p_friendship_id
    and status = 'accepted'
    and (requester_id = p_profile_id or addressee_id = p_profile_id);
  if not found then
    raise exception 'conversa indisponível';
  end if;

  v_other := case when v_f.requester_id = p_profile_id then v_f.addressee_id else v_f.requester_id end;

  if exists (select 1 from public.profile_social where profile_id = p_profile_id and not friends_enabled) then
    raise exception 'as amizades estão desativadas neste perfil';
  end if;
  if exists (select 1 from public.profile_social where profile_id = v_other and not friends_enabled) then
    raise exception 'esse amigo não pode receber mensagens agora';
  end if;

  if p_kind not in ('text', 'title', 'room') then
    raise exception 'tipo de mensagem inválido';
  end if;
  if char_length(coalesce(p_body, '')) > 1000 then
    raise exception 'mensagem muito longa (máximo 1000 caracteres)';
  end if;
  if p_kind = 'text' and char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'mensagem vazia';
  end if;

  if p_kind = 'title' then
    if p_payload is null
       or coalesce(p_payload ->> 'media_id', '') !~ '^[0-9]{1,9}$'
       or coalesce(p_payload ->> 'media_type', '') not in ('movie', 'tv') then
      raise exception 'indicação inválida';
    end if;
  elsif p_kind = 'room' then
    if p_payload is null
       or coalesce(p_payload ->> 'room_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'convite inválido';
    end if;
    if not exists (
      select 1 from public.watch_rooms
      where id = (p_payload ->> 'room_id')::uuid and host_user_id = auth.uid() and is_active
    ) then
      raise exception 'só dá pra convidar pra uma sala sua que ainda está ativa';
    end if;
  end if;

  -- Freio simples contra spam: no máximo 30 mensagens por minuto.
  if (
    select count(*) from public.friend_messages
    where sender_id = p_profile_id and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'calma! muitas mensagens em pouco tempo';
  end if;

  insert into public.friend_messages (friendship_id, sender_id, kind, body, payload)
  values (p_friendship_id, p_profile_id, p_kind, coalesce(btrim(p_body), ''), p_payload)
  returning * into v_msg;

  return v_msg;
end;
$$;

create or replace function public.social_mark_read(p_profile_id uuid, p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  update public.friend_messages m
     set read_at = now()
   where m.friendship_id = p_friendship_id
     and m.sender_id <> p_profile_id
     and m.read_at is null
     and exists (
       select 1 from public.friendships f
       where f.id = m.friendship_id
         and f.status = 'accepted'
         and (f.requester_id = p_profile_id or f.addressee_id = p_profile_id)
     );
end;
$$;

create or replace function public.social_unread_total(p_profile_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.friend_messages m
  join public.friendships f on f.id = m.friendship_id
  where public.social_check_owner(p_profile_id)
    and f.status = 'accepted'
    and (f.requester_id = p_profile_id or f.addressee_id = p_profile_id)
    and m.sender_id <> p_profile_id
    and m.read_at is null;
$$;

-- ------------------------------------------------------------
-- NOTIFICAÇÕES SOCIAIS (alimentam o sino do header)
-- ------------------------------------------------------------

-- Pedidos ainda pendentes + "aceitou seu pedido" ainda não vistos.
create or replace function public.social_get_notifications(p_profile_id uuid)
returns table (
  id uuid,
  kind text,
  friendship_id uuid,
  from_id uuid,
  from_name text,
  from_avatar text,
  from_color text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.friendship_id, p.id, p.name, p.avatar, p.color_theme, n.created_at
  from public.social_notifications n
  join public.profiles p on p.id = n.from_profile_id
  join public.friendships f on f.id = n.friendship_id
  where public.social_check_owner(p_profile_id)
    and n.profile_id = p_profile_id
    and n.created_at > now() - interval '30 days'
    and (
      (n.kind = 'friend_request' and f.status = 'pending')
      or (n.kind = 'friend_accepted' and f.status = 'accepted' and n.read_at is null)
    )
  order by n.created_at desc
  limit 30;
$$;

create or replace function public.social_mark_notifications_read(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  update public.social_notifications
     set read_at = now()
   where profile_id = p_profile_id and kind = 'friend_accepted' and read_at is null;
end;
$$;
