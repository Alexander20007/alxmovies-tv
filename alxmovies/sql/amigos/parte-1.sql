-- ============================================================
-- AMIGOS — PARTE 1 DE 7: Estrutura (limpeza + tabelas)
-- Rode as partes NA ORDEM (1 a 7), uma de cada vez, no SQL Editor.
-- Esta parte é curta de propósito, pra caber na hora de colar.
-- ============================================================

-- ------------------------------------------------------------
-- PASSO 0 — CONFERÊNCIA E LIMPEZA (roda antes de criar qualquer coisa)
-- ------------------------------------------------------------
-- 1) Se já existir uma tabela com o mesmo nome mas outro formato (sobra
--    de uma tentativa antiga de sistema de amigos), o "create table if
--    not exists" abaixo pularia a criação e as funções quebrariam no
--    meio. Aqui o script PARA logo, dizendo qual tabela e o que fazer.
do $$
declare
  spec jsonb := '{
    "profile_social":       ["profile_id","friend_code","friends_enabled","show_watching","accept_requests"],
    "friendships":          ["requester_id","addressee_id","status","blocked_by"],
    "friend_messages":      ["friendship_id","sender_id","kind","body","payload","read_at"],
    "friend_activity":      ["profile_id","media_id","media_type","title","poster_path","season","episode","updated_at"],
    "social_notifications": ["profile_id","kind","from_profile_id","friendship_id","read_at"]
  }';
  t text;
  missing text;
begin
  for t in select jsonb_object_keys(spec) loop
    if to_regclass('public.' || t) is not null then
      select string_agg(c, ', ') into missing
      from jsonb_array_elements_text(spec -> t) as e(c)
      where not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = c
      );
      if missing is not null then
        raise exception 'A tabela public.% já existe com outro formato (faltam as colunas: %). Renomeie a antiga com:  alter table public.% rename to %_antiga;  e rode este script de novo.', t, missing, t, t;
      end if;
    end if;
  end loop;
end
$$;

-- 2) Apaga versões antigas das funções social_* (qualquer assinatura).
--    Sem isso, uma função antiga com o mesmo nome mas outro tipo de
--    retorno faz o "create or replace" falhar, ou cria uma segunda
--    versão e o Supabase não sabe qual chamar. Elas são recriadas abaixo.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'social\_%'
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end
$$;

-- ------------------------------------------------------------
-- TABELAS
-- ------------------------------------------------------------

create table if not exists public.profile_social (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  friend_code text not null unique,
  friends_enabled boolean not null default true,
  show_watching boolean not null default false, -- opt-in: ninguém vê nada até a pessoa ligar
  accept_requests boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  blocked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- Um par de perfis só pode ter UMA linha, não importa quem pediu primeiro.
create unique index if not exists friendships_pair_uniq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

create table if not exists public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'title', 'room')),
  body text not null default '' check (char_length(body) <= 1000),
  payload jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (kind <> 'text' or char_length(btrim(body)) > 0)
);
create index if not exists friend_messages_chat_idx on public.friend_messages (friendship_id, created_at desc);
create index if not exists friend_messages_unread_idx on public.friend_messages (friendship_id) where read_at is null;

create table if not exists public.friend_activity (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  media_id int not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  season int,
  episode int,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade, -- quem recebe
  kind text not null check (kind in ('friend_request', 'friend_accepted')),
  from_profile_id uuid references public.profiles(id) on delete cascade,
  friendship_id uuid references public.friendships(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists social_notifications_profile_idx
  on public.social_notifications (profile_id, created_at desc);
