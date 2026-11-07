-- ============================================================================
-- ALXmovies — AVISOS DO ADMIN (aparecem nas notificações do app e na barra do celular)
-- Rode UMA vez no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo sem problema.
-- Precisa do sql/push-notifications.sql já instalado (ele tem a função push_notify e o segredo do push).
-- ============================================================================

-- 1) Quem pode enviar avisos: só as contas desta tabela (o DONO do app). Ninguém lê/escreve direto.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;

-- 2) Os avisos
create table if not exists public.announcements (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) between 1 and 80),
  body       text not null check (char_length(body) between 1 and 500),
  url        text check (url is null or (url ~* '^https://' and char_length(url) <= 300)),
  push       boolean not null default true,       -- true = também manda notificação para o celular
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  created_by uuid references auth.users(id)
);
alter table public.announcements enable row level security;
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select using (expires_at > now());
grant select on public.announcements to anon, authenticated;

-- 3) A tela de admin só aparece para quem está em app_admins
create or replace function public.is_app_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.send_announcement(p_title text, p_body text, p_url text default null, p_days int default 30, p_push boolean default true)
returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if not public.is_app_admin() then raise exception 'sem permissão'; end if;
  insert into public.announcements (title, body, url, push, expires_at, created_by)
  values (trim(p_title), trim(p_body), nullif(trim(coalesce(p_url, '')), ''), coalesce(p_push, true),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 90))), auth.uid())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.delete_announcement(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissão'; end if;
  delete from public.announcements where id = p_id;
end $$;

grant execute on function public.is_app_admin()                                   to authenticated;
grant execute on function public.send_announcement(text, text, text, int, boolean) to authenticated;
grant execute on function public.delete_announcement(bigint)                      to authenticated;

-- 4) Aviso novo com push ligado → usa a MESMA função/segredo do push das mensagens (push_notify)
drop trigger if exists push_on_announcement on public.announcements;
create trigger push_on_announcement
  after insert on public.announcements
  for each row when (new.push)
  execute function public.push_notify();

-- 5) VOCÊ vira o admin (troque pelo e-mail da sua conta e rode esta linha):
-- insert into public.app_admins (user_id) select id from auth.users where email = 'SEU-EMAIL@AQUI.com' on conflict do nothing;
