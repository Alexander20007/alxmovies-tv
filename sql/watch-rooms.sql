-- ============================================================
-- SALAS DE ASSISTIR JUNTO (WATCH PARTY)
-- ============================================================
-- Rode este arquivo inteiro no SQL Editor do Supabase.
--
-- Arquitetura:
--   - watch_rooms: uma linha por sala (dono, filme, estado atual)
--   - watch_room_members: quem já entrou na sala (controla quem pode
--     ler/mandar mensagem — é a "prova" de que a pessoa acertou a
--     senha, se a sala for privada)
--   - watch_room_messages: chat da sala (persistido, via Realtime
--     Postgres Changes)
--   - Sincronia de play/pause/avançar NÃO passa pela tabela a cada
--     segundo (seria caro e lento). Ela vai por Realtime Broadcast
--     (canal "room:<id>", evento "control"), e só grava no banco
--     (is_playing/position_seconds) nos momentos importantes — troca
--     de estado e um "heartbeat" a cada ~10s — pra quem entra atrasado
--     já pegar o estado certo.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABELAS
-- ------------------------------------------------------------

create table if not exists watch_rooms (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_profile_id uuid,
  host_name text not null,
  title text not null check (char_length(title) between 1 and 60),

  tmdb_id int not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  season int,
  episode int,
  movie_title text not null,
  poster_path text,

  is_private boolean not null default false,
  password_hash text, -- null se pública. Nunca exposta ao client (fica só na tabela base).

  is_playing boolean not null default false,
  position_seconds numeric not null default 0,
  state_updated_at timestamptz not null default now(),

  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists watch_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references watch_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists watch_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references watch_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists idx_watch_rooms_active on watch_rooms (is_active, created_at desc);
create index if not exists idx_watch_room_members_room on watch_room_members (room_id);
create index if not exists idx_watch_room_messages_room on watch_room_messages (room_id, created_at);

-- ------------------------------------------------------------
-- VIEW PÚBLICA (lista de salas sem o password_hash)
-- ------------------------------------------------------------

create or replace view watch_rooms_public as
select
  id, host_user_id, host_profile_id, host_name, title,
  tmdb_id, media_type, season, episode, movie_title, poster_path,
  is_private, (password_hash is not null) as has_password,
  is_playing, position_seconds, state_updated_at,
  is_active, created_at
from watch_rooms
where is_active = true;

grant select on watch_rooms_public to authenticated;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table watch_rooms enable row level security;
alter table watch_room_members enable row level security;
alter table watch_room_messages enable row level security;

-- A tabela base só é legível diretamente pelo próprio dono (todo mundo
-- mais usa a view watch_rooms_public, ou as RPCs abaixo).
drop policy if exists "host le sua sala" on watch_rooms;
create policy "host le sua sala" on watch_rooms
  for select using (auth.uid() = host_user_id);

drop policy if exists "host cria sala" on watch_rooms;
create policy "host cria sala" on watch_rooms
  for insert with check (auth.uid() = host_user_id);

drop policy if exists "host atualiza sua sala" on watch_rooms;
create policy "host atualiza sua sala" on watch_rooms
  for update using (auth.uid() = host_user_id);

drop policy if exists "host apaga sua sala" on watch_rooms;
create policy "host apaga sua sala" on watch_rooms
  for delete using (auth.uid() = host_user_id);

-- Cada usuário só enxerga a PRÓPRIA linha de membership (a lista de
-- quem está na sala vem do Realtime Presence, não do banco). Uma
-- política que consultasse watch_room_members dentro dela mesma
-- causaria recursão infinita no Postgres.
drop policy if exists "membro ve membros da sala" on watch_room_members;
create policy "usuario ve sua propria membership" on watch_room_members
  for select using (user_id = auth.uid());

-- Mensagens: só lê/escreve quem já é membro confirmado da sala
-- (ou seja, já passou pela checagem de senha em join_watch_room).
drop policy if exists "membro le mensagens" on watch_room_messages;
create policy "membro le mensagens" on watch_room_messages
  for select using (
    exists (
      select 1 from watch_room_members m
      where m.room_id = watch_room_messages.room_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "membro envia mensagem" on watch_room_messages;
create policy "membro envia mensagem" on watch_room_messages
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from watch_room_members m
      where m.room_id = watch_room_messages.room_id and m.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- RPCs (rodam com privilégio elevado — SECURITY DEFINER — pra poder
-- checar senha e liberar acesso sem expor o hash nem furar o RLS
-- de propósito errado)
-- ------------------------------------------------------------

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
  p_host_name text
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
    is_private, password_hash
  ) values (
    auth.uid(), p_host_profile_id, p_host_name, p_title,
    p_tmdb_id, p_media_type, p_season, p_episode, p_movie_title, p_poster_path,
    p_is_private,
    case when p_is_private and p_password is not null and length(p_password) > 0
      then crypt(p_password, gen_salt('bf'))
      else null
    end
  )
  returning * into v_room;

  insert into watch_room_members (room_id, user_id, display_name)
  values (v_room.id, auth.uid(), p_host_name)
  on conflict (room_id, user_id) do nothing;

  return (select r from watch_rooms_public r where r.id = v_room.id);
end;
$$;

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

create or replace function update_watch_room_state(
  p_room_id uuid,
  p_is_playing boolean,
  p_position_seconds numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update watch_rooms
  set is_playing = p_is_playing,
      position_seconds = p_position_seconds,
      state_updated_at = now()
  where id = p_room_id and host_user_id = auth.uid();

  if not found then
    raise exception 'só o anfitrião pode controlar a sala';
  end if;
end;
$$;

create or replace function close_watch_room(p_room_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update watch_rooms set is_active = false
  where id = p_room_id and host_user_id = auth.uid();

  if not found then
    raise exception 'só o anfitrião pode encerrar a sala';
  end if;
end;
$$;

grant execute on function create_watch_room to authenticated;
grant execute on function join_watch_room to authenticated;
grant execute on function update_watch_room_state to authenticated;
grant execute on function close_watch_room to authenticated;

-- ------------------------------------------------------------
-- REALTIME (chat via Postgres Changes)
-- ------------------------------------------------------------
alter publication supabase_realtime add table watch_room_messages;

-- ------------------------------------------------------------
-- LIMPEZA AUTOMÁTICA (opcional): encerra salas há mais de 12h sem
-- atualização de estado. Rode manualmente ou agende via pg_cron
-- (mesmo padrão do cleanup-guest-accounts-cron.sql que você já tem).
-- ------------------------------------------------------------
-- update watch_rooms set is_active = false
-- where is_active = true and state_updated_at < now() - interval '12 hours';
