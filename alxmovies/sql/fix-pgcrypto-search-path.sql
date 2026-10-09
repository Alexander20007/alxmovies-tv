-- ============================================================
-- FIX: gen_salt/crypt "does not exist"
-- ------------------------------------------------------------
-- No Supabase, a extensão pgcrypto fica instalada no schema
-- "extensions", não em "public". As funções abaixo tinham
-- search_path = public só, então não achavam gen_salt()/crypt().
-- Este patch recria as duas funções que usam essas funções,
-- incluindo "extensions" no search_path. Rode isso uma vez.
-- ============================================================

create or replace function create_watch_room(
  p_title text,
  p_is_private boolean,
  p_password text,
  p_tmdb_id int,
  p_media_type text,
  p_season int,
  p_episode int,
  p_movie_title text,
  p_poster_path text,
  p_host_profile_id uuid,
  p_host_name text,
  p_season_limit int default null
) returns watch_rooms_public
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room watch_rooms;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  insert into watch_rooms (
    host_user_id, host_profile_id, host_name, title,
    tmdb_id, media_type, season, episode, movie_title, poster_path,
    is_private, password_hash, season_limit
  ) values (
    auth.uid(), p_host_profile_id, p_host_name, p_title,
    p_tmdb_id, p_media_type, p_season, p_episode, p_movie_title, p_poster_path,
    p_is_private,
    case when p_is_private and p_password is not null and length(p_password) > 0
      then crypt(p_password, gen_salt('bf'))
      else null
    end,
    case when p_media_type = 'tv' then p_season_limit else null end
  )
  returning * into v_room;

  insert into watch_room_members (room_id, user_id, display_name)
  values (v_room.id, auth.uid(), p_host_name)
  on conflict (room_id, user_id) do nothing;

  return (select r from watch_rooms_public r where r.id = v_room.id);
end;
$$;

grant execute on function create_watch_room to authenticated;

create or replace function join_watch_room(
  p_room_id uuid,
  p_password text,
  p_display_name text
) returns watch_rooms_public
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room watch_rooms;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_room from watch_rooms where id = p_room_id and is_active = true;
  if not found then
    raise exception 'sala não encontrada ou encerrada';
  end if;

  if v_room.is_private and v_room.password_hash is not null then
    if p_password is null or crypt(p_password, v_room.password_hash) <> v_room.password_hash then
      raise exception 'senha incorreta';
    end if;
  end if;

  insert into watch_room_members (room_id, user_id, display_name)
  values (p_room_id, auth.uid(), coalesce(p_display_name, 'Convidado'))
  on conflict (room_id, user_id) do update set display_name = excluded.display_name;

  return (select r from watch_rooms_public r where r.id = p_room_id);
end;
$$;

grant execute on function join_watch_room to authenticated;
