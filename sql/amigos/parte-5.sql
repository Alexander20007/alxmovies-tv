-- ============================================================
-- AMIGOS — PARTE 5 DE 7: Lista de amigos e "assistindo agora"
-- Rode as partes NA ORDEM (1 a 7), uma de cada vez, no SQL Editor.
-- Esta parte é curta de propósito, pra caber na hora de colar.
-- ============================================================

-- ------------------------------------------------------------
-- LISTA DE AMIGOS (+ pedidos, bloqueados, última mensagem, não lidas
-- e o que cada amigo está assistindo — respeitando a privacidade)
-- ------------------------------------------------------------

create or replace function public.social_list(p_profile_id uuid)
returns table (
  friendship_id uuid,
  status text,
  direction text,            -- friend | incoming | outgoing | blocked
  friend_id uuid,
  friend_name text,
  friend_avatar text,
  friend_color text,
  watching_title text,
  watching_media_id int,
  watching_media_type text,
  watching_poster text,
  watching_season int,
  watching_episode int,
  watching_at timestamptz,
  last_message text,
  last_message_kind text,
  last_message_at timestamptz,
  last_message_mine boolean,
  unread_count int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.status,
    case
      when f.status = 'accepted' then 'friend'
      when f.status = 'pending' and f.addressee_id = p_profile_id then 'incoming'
      when f.status = 'pending' then 'outgoing'
      else 'blocked'
    end,
    o.id,
    o.name,
    o.avatar,
    o.color_theme,
    a.title,
    a.media_id,
    a.media_type,
    a.poster_path,
    a.season,
    a.episode,
    a.updated_at,
    lm.body,
    lm.kind,
    lm.created_at,
    (lm.sender_id = p_profile_id),
    coalesce(u.cnt, 0)::int,
    f.created_at
  from public.friendships f
  join public.profiles o
    on o.id = case when f.requester_id = p_profile_id then f.addressee_id else f.requester_id end
  left join public.profile_social ps on ps.profile_id = o.id
  -- Só enxerga a atividade se: já são amigos, o amigo LIGOU o
  -- compartilhamento, e o registro é recente (até 24h).
  left join public.friend_activity a
    on a.profile_id = o.id
   and f.status = 'accepted'
   and coalesce(ps.show_watching, false)
   and coalesce(ps.friends_enabled, false)
   and a.updated_at > now() - interval '24 hours'
  left join lateral (
    select m.body, m.kind, m.created_at, m.sender_id
    from public.friend_messages m
    where m.friendship_id = f.id
    order by m.created_at desc
    limit 1
  ) lm on f.status = 'accepted'
  left join lateral (
    select count(*) as cnt
    from public.friend_messages m
    where m.friendship_id = f.id and m.sender_id <> p_profile_id and m.read_at is null
  ) u on f.status = 'accepted'
  where public.social_check_owner(p_profile_id)
    and (f.requester_id = p_profile_id or f.addressee_id = p_profile_id)
    and (f.status <> 'blocked' or f.blocked_by = p_profile_id);
$$;

-- ------------------------------------------------------------
-- "ASSISTINDO AGORA"
-- ------------------------------------------------------------

-- Chamada pelo player a cada ~45s. Se o perfil não ligou o
-- compartilhamento, não grava NADA.
create or replace function public.social_set_watching(
  p_profile_id uuid,
  p_media_id int,
  p_media_type text,
  p_title text,
  p_poster_path text,
  p_season int,
  p_episode int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  if p_media_type not in ('movie', 'tv') then
    raise exception 'tipo inválido';
  end if;

  if not exists (
    select 1 from public.profile_social
    where profile_id = p_profile_id and show_watching and friends_enabled
  ) then
    return;
  end if;

  insert into public.friend_activity
    (profile_id, media_id, media_type, title, poster_path, season, episode, updated_at)
  values
    (p_profile_id, p_media_id, p_media_type, left(p_title, 200), p_poster_path, p_season, p_episode, now())
  on conflict (profile_id) do update
    set media_id = excluded.media_id,
        media_type = excluded.media_type,
        title = excluded.title,
        poster_path = excluded.poster_path,
        season = excluded.season,
        episode = excluded.episode,
        updated_at = now();
end;
$$;

create or replace function public.social_clear_watching(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);
  delete from public.friend_activity where profile_id = p_profile_id;
end;
$$;
