-- ============================================================
-- PUSH (Firebase) — mensagens e pedidos de amizade com o app FECHADO
-- Rode no Supabase: SQL Editor → cole tudo → Run.
-- ANTES de rodar: troque TROQUE_ESTE_SEGREDO (aparece 1 vez, dentro da função push_notify)
-- por uma senha longa inventada por você. A MESMA senha vai no secret PUSH_SECRET da Edge Function.
-- ============================================================

-- 1) Aparelhos registrados (um token por instalação do app, ligado ao perfil que está em uso)
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_profile_idx on public.push_tokens (profile_id);

-- Ninguém lê/escreve direto: só pelas funções abaixo (e pela Edge Function, que usa a service role)
alter table public.push_tokens enable row level security;

-- 2) O app registra o aparelho (se o token já existia em outra conta/perfil, passa para esta)
create or replace function public.push_register_token(p_token text, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and user_id = auth.uid()) then
    raise exception 'perfil inválido';
  end if;
  insert into public.push_tokens (token, user_id, profile_id, updated_at)
  values (p_token, auth.uid(), p_profile_id, now())
  on conflict (token) do update
    set user_id = excluded.user_id, profile_id = excluded.profile_id, updated_at = now();
end;
$$;

-- 3) Ao sair da conta o app remove o aparelho
create or replace function public.push_unregister_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

grant execute on function public.push_register_token(text, uuid) to authenticated;
grant execute on function public.push_unregister_token(text) to authenticated;

-- 4) Gatilho: mensagem nova / pedido de amizade → chama a Edge Function "push-send"
create extension if not exists pg_net with schema extensions;

create or replace function public.push_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://onqxflwfkexitipylixc.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', 'TROQUE_ESTE_SEGREDO'),
    body := jsonb_build_object('table', TG_TABLE_NAME, 'record', to_jsonb(NEW))
  );
  return NEW;
exception when others then
  return NEW; -- push é "melhor esforço": nunca pode impedir o envio da mensagem
end;
$$;

drop trigger if exists push_on_friend_message on public.friend_messages;
create trigger push_on_friend_message
  after insert on public.friend_messages
  for each row execute function public.push_notify();

drop trigger if exists push_on_social_notification on public.social_notifications;
create trigger push_on_social_notification
  after insert on public.social_notifications
  for each row execute function public.push_notify();
