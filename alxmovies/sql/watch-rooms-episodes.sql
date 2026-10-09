-- ============================================================
-- SALAS — MARATONA DE EPISÓDIOS
-- ------------------------------------------------------------
-- Rode depois de sql/watch-rooms.sql.
-- Adiciona:
--   - watch_rooms.season_limit: até qual temporada a sala vai
--     avançar sozinha (NULL = sem limite definido → cada avanço de
--     episódio pede confirmação do anfitrião)
--   - advance_room_episode(): o anfitrião chama isso pra trocar de
--     episódio (manual ou automático), reseta a posição e já marca
--     tocando
-- ============================================================

alter table watch_rooms add column if not exists season_limit int;

-- Recria a view incluindo a nova coluna (mantém as colunas antigas
-- intactas, só acrescenta season_limit no fim).
create or replace view watch_rooms_public as
select
  id, host_user_id, host_profile_id, host_name, title,
  tmdb_id, media_type, season, episode, movie_title, poster_path,
  is_private, (password_hash is not null) as has_password,
  is_playing, position_seconds, state_updated_at,
  is_active, created_at, season_limit
from watch_rooms
where is_active = true;

grant select on watch_rooms_public to authenticated;

-- A assinatura da função muda (novo parâmetro), então troca a função
-- inteira em vez de só dar CREATE OR REPLACE (que criaria uma
-- segunda função sobrecarregada e ambígua).
drop function if exists create_watch_room(text, boolean, text, int, text, int, int, text, text, uuid, text);

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
set search_path = public
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

create or replace function advance_room_episode(
  p_room_id uuid,
  p_season int,
  p_episode int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update watch_rooms
  set season = p_season,
      episode = p_episode,
      position_seconds = 0,
      is_playing = true,
      state_updated_at = now()
  where id = p_room_id and host_user_id = auth.uid() and media_type = 'tv';

  if not found then
    raise exception 'só o anfitrião pode avançar o episódio';
  end if;
end;
$$;

grant execute on function advance_room_episode to authenticated;
