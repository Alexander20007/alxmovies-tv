-- ============================================================
-- AMIGOS — PARTE 2 DE 7: Funções auxiliares, segurança e gatilho
-- Rode as partes NA ORDEM (1 a 7), uma de cada vez, no SQL Editor.
-- Esta parte é curta de propósito, pra caber na hora de colar.
-- ============================================================

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
