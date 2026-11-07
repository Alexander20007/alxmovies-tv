-- ============================================================
-- AMIGOS, MENSAGENS E "ASSISTINDO AGORA"
-- ============================================================
-- Rode este arquivo inteiro no SQL Editor do Supabase (pode rodar de
-- novo sem problema — tudo usa "if not exists" / "create or replace").
--
-- Arquitetura (a mesma ideia das Salas: nada de tabela aberta, tudo
-- passa por funções SECURITY DEFINER que conferem quem está chamando):
--
--   - A amizade é entre PERFIS (não entre contas), porque cada perfil
--     já tem nome, foto, favoritos e histórico próprios.
--   - profile_social   : configurações sociais de cada perfil
--                        (código de amigo, "mostrar o que assisto",
--                        "aceitar pedidos", "amizades ativadas").
--   - friendships      : pedido/amizade/bloqueio entre dois perfis.
--   - friend_messages  : mensagens (texto, indicação de filme, convite
--                        de sala). Só quem participa lê (RLS) — é isso
--                        que deixa o Realtime entregar só pro destino.
--   - friend_activity  : o que o perfil está assistindo AGORA. Só é
--                        gravado se o perfil ligou "mostrar o que
--                        assisto", e só amigos aceitos enxergam.
--   - social_notifications : pedido de amizade recebido / aceito.
--                        Alimenta o sino do header (que já existia).
--
-- Perfis infantis (is_kids) começam com amizades DESLIGADAS — o
-- responsável liga, perfil por perfil, no Painel da Conta.
-- Contas de convidado não usam amizades (a conta some em 24h).
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

-- ------------------------------------------------------------
-- FUNÇÕES AUXILIARES
-- ------------------------------------------------------------

-- Perfis do usuário logado. SECURITY DEFINER pra não depender da
-- política de leitura da tabela profiles (e evitar recursão de RLS).
create or replace function public.my_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid();
$$;

-- O usuário logado participa desta amizade (já aceita)?
create or replace function public.is_friendship_member(p_friendship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.id = p_friendship_id
      and f.status = 'accepted'
      and (
        f.requester_id in (select public.my_profile_ids())
        or f.addressee_id in (select public.my_profile_ids())
      )
  );
$$;

-- Garante: logado, não é convidado e o perfil é mesmo dele.
-- Devolve true (ou levanta exceção) pra poder ser usada em WHERE.
create or replace function public.social_check_owner(p_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'contas de convidado não usam amizades';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_profile_id and user_id = auth.uid()
  ) then
    raise exception 'perfil inválido';
  end if;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- RLS (leitura só pra quem participa — serve ao Realtime; qualquer
-- escrita passa pelas funções abaixo, não direto na tabela)
-- ------------------------------------------------------------

alter table public.profile_social enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_messages enable row level security;
alter table public.friend_activity enable row level security;
alter table public.social_notifications enable row level security;

-- profile_social e friend_activity: sem política = ninguém lê direto
-- (só as funções SECURITY DEFINER, que aplicam as regras de privacidade).

drop policy if exists "participante ve a amizade" on public.friendships;
create policy "participante ve a amizade" on public.friendships
  for select using (
    requester_id in (select public.my_profile_ids())
    or addressee_id in (select public.my_profile_ids())
  );

drop policy if exists "participante le mensagens" on public.friend_messages;
create policy "participante le mensagens" on public.friend_messages
  for select using (public.is_friendship_member(friendship_id));

drop policy if exists "dono ve suas notificacoes" on public.social_notifications;
create policy "dono ve suas notificacoes" on public.social_notifications
  for select using (profile_id in (select public.my_profile_ids()));

-- ------------------------------------------------------------
-- TRIGGER: gera as notificações (pedido recebido / pedido aceito)
-- ------------------------------------------------------------

create or replace function public.friendships_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      insert into public.social_notifications (profile_id, kind, from_profile_id, friendship_id)
      values (new.addressee_id, 'friend_request', new.requester_id, new.id);
    end if;

  elsif tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then
      update public.social_notifications
         set read_at = coalesce(read_at, now())
       where friendship_id = new.id and kind = 'friend_request';

      insert into public.social_notifications (profile_id, kind, from_profile_id, friendship_id)
      values (new.requester_id, 'friend_accepted', new.addressee_id, new.id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_friendships_notify on public.friendships;
create trigger trg_friendships_notify
  after insert or update on public.friendships
  for each row execute function public.friendships_notify();

-- ------------------------------------------------------------
-- CONFIGURAÇÕES SOCIAIS DO PERFIL
-- ------------------------------------------------------------

-- Cria sob demanda (na primeira vez que o perfil usa o recurso) e
-- devolve sempre a mesma linha. Perfil infantil nasce com amizades
-- desligadas.
create or replace function public.social_ensure_settings(p_profile_id uuid)
returns public.profile_social
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profile_social;
  v_kids boolean;
  v_code text;
begin
  perform public.social_check_owner(p_profile_id);

  select * into v from public.profile_social where profile_id = p_profile_id;
  if found then
    return v;
  end if;

  select coalesce(is_kids, false) into v_kids from public.profiles where id = p_profile_id;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profile_social where friend_code = v_code);
  end loop;

  insert into public.profile_social (profile_id, friend_code, friends_enabled)
  values (p_profile_id, v_code, not v_kids)
  on conflict (profile_id) do nothing;

  select * into v from public.profile_social where profile_id = p_profile_id;
  return v;
end;
$$;

-- Atualiza só o que foi enviado (null = não mexe).
create or replace function public.social_update_settings(
  p_profile_id uuid,
  p_show_watching boolean default null,
  p_friends_enabled boolean default null,
  p_accept_requests boolean default null
) returns public.profile_social
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profile_social;
begin
  perform public.social_ensure_settings(p_profile_id);

  update public.profile_social
     set show_watching = coalesce(p_show_watching, show_watching),
         friends_enabled = coalesce(p_friends_enabled, friends_enabled),
         accept_requests = coalesce(p_accept_requests, accept_requests),
         updated_at = now()
   where profile_id = p_profile_id
   returning * into v;

  -- Desligou o compartilhamento (ou as amizades): some na hora, sem
  -- esperar o tempo de expiração.
  if not v.show_watching or not v.friends_enabled then
    delete from public.friend_activity where profile_id = p_profile_id;
  end if;

  return v;
end;
$$;

-- Troca o código de amigo (útil se ele foi parar onde não devia).
create or replace function public.social_regenerate_code(p_profile_id uuid)
returns public.profile_social
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profile_social;
  v_code text;
begin
  perform public.social_ensure_settings(p_profile_id);

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profile_social where friend_code = v_code);
  end loop;

  update public.profile_social
     set friend_code = v_code, updated_at = now()
   where profile_id = p_profile_id
   returning * into v;
  return v;
end;
$$;

-- ------------------------------------------------------------
-- PEDIDOS, AMIGOS E BLOQUEIO
-- ------------------------------------------------------------

-- Pede amizade pelo CÓDIGO (não existe busca por nome — assim ninguém
-- consegue "listar" perfis do site). Se a outra pessoa já tinha te
-- pedido, a amizade é aceita na hora. Devolve o id da amizade.
create or replace function public.social_send_request(p_from_profile_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profile_social;
  v_target public.profile_social;
  v_code text;
  v_existing public.friendships;
  v_id uuid;
begin
  perform public.social_check_owner(p_from_profile_id);
  v_me := public.social_ensure_settings(p_from_profile_id);

  if not v_me.friends_enabled then
    raise exception 'as amizades estão desativadas neste perfil';
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_code) < 4 then
    raise exception 'digite o código de amigo completo';
  end if;

  select * into v_target from public.profile_social where friend_code = v_code;
  if not found then
    raise exception 'código não encontrado';
  end if;

  if v_target.profile_id = p_from_profile_id then
    raise exception 'esse é o seu próprio código';
  end if;

  if exists (
    select 1
    from public.profiles a, public.profiles b
    where a.id = p_from_profile_id and b.id = v_target.profile_id and a.user_id = b.user_id
  ) then
    raise exception 'esse perfil é da sua própria conta';
  end if;

  select * into v_existing
  from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(p_from_profile_id, v_target.profile_id)
    and greatest(f.requester_id, f.addressee_id) = greatest(p_from_profile_id, v_target.profile_id);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'vocês já são amigos';
    elsif v_existing.status = 'blocked' then
      -- não revela quem bloqueou quem
      raise exception 'não foi possível enviar o pedido para esse código';
    elsif v_existing.requester_id = p_from_profile_id then
      raise exception 'você já enviou um pedido pra essa pessoa';
    else
      -- ela já tinha te pedido: aceita na hora
      update public.friendships
         set status = 'accepted', responded_at = now()
       where id = v_existing.id;
      return v_existing.id;
    end if;
  end if;

  if not v_target.friends_enabled or not v_target.accept_requests then
    raise exception 'não foi possível enviar o pedido para esse código';
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (p_from_profile_id, v_target.profile_id)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.social_respond_request(
  p_profile_id uuid,
  p_friendship_id uuid,
  p_accept boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  if p_accept then
    update public.friendships
       set status = 'accepted', responded_at = now()
     where id = p_friendship_id and addressee_id = p_profile_id and status = 'pending';
  else
    delete from public.friendships
     where id = p_friendship_id and addressee_id = p_profile_id and status = 'pending';
  end if;

  if not found then
    raise exception 'esse pedido não existe mais';
  end if;
end;
$$;

-- Desfaz amizade OU cancela um pedido que você enviou.
create or replace function public.social_remove_friend(p_profile_id uuid, p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  delete from public.friendships
   where id = p_friendship_id
     and status in ('pending', 'accepted')
     and (requester_id = p_profile_id or addressee_id = p_profile_id);
end;
$$;

create or replace function public.social_block(p_profile_id uuid, p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  update public.friendships
     set status = 'blocked', blocked_by = p_profile_id, responded_at = now()
   where id = p_friendship_id
     and status in ('pending', 'accepted')
     and (requester_id = p_profile_id or addressee_id = p_profile_id);

  if not found then
    raise exception 'não foi possível bloquear';
  end if;

  delete from public.social_notifications where friendship_id = p_friendship_id;
end;
$$;

create or replace function public.social_unblock(p_profile_id uuid, p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  delete from public.friendships
   where id = p_friendship_id and status = 'blocked' and blocked_by = p_profile_id;
end;
$$;

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

-- ------------------------------------------------------------
-- PERMISSÕES: só usuário logado executa as funções
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'social\_%' or p.proname in ('my_profile_ids', 'is_friendship_member'))
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;

-- ------------------------------------------------------------
-- REALTIME (mensagens, notificações e mudanças de amizade ao vivo)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['friend_messages', 'social_notifications', 'friendships']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- ------------------------------------------------------------
-- FINAL — recarrega o cache da API e mostra o que foi instalado
-- ------------------------------------------------------------
-- Se algum dia o site disser que uma função "não foi encontrada",
-- rode só esta parte (a linha do notify + o select) pra conferir.
notify pgrst, 'reload schema';

select tipo, nome, situacao
from (
  select 'tabela' as tipo, t as nome,
         case when to_regclass('public.' || t) is not null then 'ok' else 'FALTA' end as situacao
  from unnest(array['profile_social','friendships','friend_messages','friend_activity','social_notifications']) as t
  union all
  select 'função', f,
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = f
         ) then 'ok' else 'FALTA' end
  from unnest(array[
    'my_profile_ids','is_friendship_member','social_check_owner','social_ensure_settings',
    'social_update_settings','social_regenerate_code','social_send_request','social_respond_request',
    'social_remove_friend','social_block','social_unblock','social_list','social_set_watching',
    'social_clear_watching','social_send_message','social_mark_read','social_unread_total',
    'social_get_notifications','social_mark_notifications_read'
  ]) as f
) x
order by (situacao = 'ok'), tipo, nome;

-- ------------------------------------------------------------
-- LIMPEZA (opcional): registros de "assistindo" velhos não aparecem
-- pra ninguém depois de 24h, mas dá pra apagar de vez agendando via
-- pg_cron (mesmo padrão do cleanup-guest-accounts-cron.sql):
--
--   delete from public.friend_activity where updated_at < now() - interval '2 days';
-- ------------------------------------------------------------
