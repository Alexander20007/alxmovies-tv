-- ============================================================
-- FILA DE FILMES + TRANSFERIR ANFITRIÃO
-- ------------------------------------------------------------
-- Rode depois dos outros arquivos de sql/watch-rooms*.sql.
-- ============================================================

-- ---------- Fila ----------

create table if not exists watch_room_queue (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references watch_rooms(id) on delete cascade,
  tmdb_id int not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  season int,
  episode int,
  movie_title text not null,
  poster_path text,
  added_by_user_id uuid not null references auth.users(id) on delete cascade,
  added_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_watch_room_queue_room on watch_room_queue (room_id, created_at);

alter table watch_room_queue enable row level security;

-- Mesma regra de sempre: só quem já é membro confirmado da sala
-- (passou pela checagem de senha) enxerga/mexe na fila dela.
drop policy if exists "membro ve a fila" on watch_room_queue;
create policy "membro ve a fila" on watch_room_queue
  for select using (
    exists (select 1 from watch_room_members m where m.room_id = watch_room_queue.room_id and m.user_id = auth.uid())
  );

drop policy if exists "membro adiciona na fila" on watch_room_queue;
create policy "membro adiciona na fila" on watch_room_queue
  for insert with check (
    auth.uid() = added_by_user_id
    and exists (select 1 from watch_room_members m where m.room_id = watch_room_queue.room_id and m.user_id = auth.uid())
  );

-- Quem adicionou pode tirar da fila, e o anfitrião pode tirar
-- qualquer item (inclusive quando toca o próximo da fila).
drop policy if exists "remover da fila" on watch_room_queue;
create policy "remover da fila" on watch_room_queue
  for delete using (
    auth.uid() = added_by_user_id
    or exists (select 1 from watch_rooms r where r.id = watch_room_queue.room_id and r.host_user_id = auth.uid())
  );

alter publication supabase_realtime add table watch_room_queue;

-- Toca agora o item indicado da fila: atualiza a sala pro novo
-- conteúdo e remove o item. Só o anfitrião pode.
create or replace function play_from_queue(p_queue_id uuid) returns watch_rooms_public
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item watch_room_queue;
  v_room watch_rooms;
begin
  select * into v_item from watch_room_queue where id = p_queue_id;
  if not found then
    raise exception 'item não encontrado na fila';
  end if;

  update watch_rooms
  set tmdb_id = v_item.tmdb_id,
      media_type = v_item.media_type,
      season = v_item.season,
      episode = v_item.episode,
      movie_title = v_item.movie_title,
      poster_path = v_item.poster_path,
      position_seconds = 0,
      is_playing = true,
      season_limit = null,
      state_updated_at = now()
  where id = v_item.room_id and host_user_id = auth.uid()
  returning * into v_room;

  if not found then
    raise exception 'só o anfitrião pode tocar um item da fila';
  end if;

  delete from watch_room_queue where id = p_queue_id;

  return (select r from watch_rooms_public r where r.id = v_room.id);
end;
$$;

grant execute on function play_from_queue to authenticated;

-- ---------- Transferir anfitrião ----------

create or replace function transfer_room_host(p_room_id uuid, p_new_host_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_host_name text;
begin
  select display_name into v_new_host_name
  from watch_room_members
  where room_id = p_room_id and user_id = p_new_host_user_id;

  if v_new_host_name is null then
    raise exception 'essa pessoa não está na sala';
  end if;

  update watch_rooms
  set host_user_id = p_new_host_user_id,
      host_name = v_new_host_name
  where id = p_room_id and host_user_id = auth.uid();

  if not found then
    raise exception 'só o anfitrião atual pode transferir o controle';
  end if;
end;
$$;

grant execute on function transfer_room_host to authenticated;
