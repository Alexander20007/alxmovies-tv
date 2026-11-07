-- ============================================================================
-- ALXmovies — VÁRIOS ADMINS (teste no site) + vantagens
-- Rode DEPOIS de planos-e-anuncios.sql, planos-site-login.sql e avisos.sql. Pode rodar de novo sem problema.
--
-- Como funciona:
--  • DONO = quem está em app_admins (você). Decide tudo.
--  • ADMIN = quem passou no teste do site. Ganha: Premium grátis (sem anúncios, limite maior), selo, painel e pode
--    SUGERIR avisos (o dono aprova). O dono pode liberar "publicar sozinho" para admins de confiança.
-- ============================================================================

-- 1) Equipe de admins
create table if not exists public.app_staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  can_publish boolean not null default false,      -- true = publica avisos sem precisar de aprovação
  granted_via text not null default 'quiz',        -- quiz | owner
  since       timestamptz not null default now()
);
alter table public.app_staff enable row level security;
drop policy if exists app_staff_self on public.app_staff;
create policy app_staff_self on public.app_staff for select using (auth.uid() = user_id);

-- 2) Tentativas do teste (só a função do servidor mexe; ninguém lê direto, para as respostas certas não vazarem)
create table if not exists public.quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  questions   jsonb not null,                      -- inclui a resposta certa
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  finished_at timestamptz,
  score       int,
  passed      boolean
);
create index if not exists quiz_attempts_user on public.quiz_attempts (user_id, created_at desc);
alter table public.quiz_attempts enable row level security;

-- 3) Avisos sugeridos por admins (o dono aprova ou recusa)
create table if not exists public.announcement_proposals (
  id          bigint generated always as identity primary key,
  author      uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  body        text not null check (char_length(body) between 1 and 500),
  url         text check (url is null or (url ~* '^https://' and char_length(url) <= 300)),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.announcement_proposals enable row level security;
drop policy if exists proposals_author on public.announcement_proposals;
create policy proposals_author on public.announcement_proposals for select using (auth.uid() = author);

-- ============================================================================
-- FUNÇÕES
-- ============================================================================
create or replace function public._is_staff(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_staff where user_id = p_uid);
$$;
revoke all on function public._is_staff(uuid) from public, anon, authenticated;

-- Situação da conta: dono, admin ou nada
create or replace function public.my_staff_status()
returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.app_staff;
begin
  if uid is null then return json_build_object('role', null); end if;
  if public.is_app_admin() then return json_build_object('role', 'dono', 'can_publish', true); end if;
  select * into s from public.app_staff where user_id = uid;
  if found then return json_build_object('role', 'admin', 'can_publish', s.can_publish, 'since', s.since, 'via', s.granted_via); end if;
  return json_build_object('role', null);
end $$;

-- Quem pode publicar aviso direto: o dono e os admins liberados por ele
create or replace function public.can_publish_announcements()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_app_admin() or exists (select 1 from public.app_staff where user_id = auth.uid() and can_publish);
$$;

-- send_announcement agora aceita o dono e os admins com "publicar sozinho"
create or replace function public.send_announcement(p_title text, p_body text, p_url text default null, p_days int default 30, p_push boolean default true)
returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if not public.can_publish_announcements() then raise exception 'sem permissão'; end if;
  insert into public.announcements (title, body, url, push, expires_at, created_by)
  values (trim(p_title), trim(p_body), nullif(trim(coalesce(p_url, '')), ''), coalesce(p_push, true),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 90))), auth.uid())
  returning id into new_id;
  return new_id;
end $$;

-- Admin sugere um aviso (máx. 3 pendentes por vez)
create or replace function public.propose_announcement(p_title text, p_body text, p_url text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if auth.uid() is null or not public._is_staff(auth.uid()) then raise exception 'sem permissão'; end if;
  if (select count(*) from public.announcement_proposals where author = auth.uid() and status = 'pending') >= 3 then
    raise exception 'Você já tem 3 sugestões esperando aprovação.';
  end if;
  insert into public.announcement_proposals (author, title, body, url)
  values (auth.uid(), trim(p_title), trim(p_body), nullif(trim(coalesce(p_url, '')), ''))
  returning id into new_id;
  return new_id;
end $$;

-- ---- só o DONO daqui para baixo ----
create or replace function public.list_proposals()
returns table (id bigint, author uuid, author_name text, title text, body text, url text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissão'; end if;
  return query
    select p.id, p.author, coalesce(u.raw_user_meta_data->>'username', 'sem nome'), p.title, p.body, p.url, p.created_at
    from public.announcement_proposals p join auth.users u on u.id = p.author
    where p.status = 'pending' order by p.created_at;
end $$;

create or replace function public.review_proposal(p_id bigint, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare pr public.announcement_proposals;
begin
  if not public.is_app_admin() then raise exception 'sem permissão'; end if;
  select * into pr from public.announcement_proposals where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Sugestão não encontrada.'; end if;
  if p_approve then
    insert into public.announcements (title, body, url, push, created_by) values (pr.title, pr.body, pr.url, true, pr.author);
  end if;
  update public.announcement_proposals set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now() where id = p_id;
end $$;

create or replace function public.staff_list()
returns table (user_id uuid, username text, can_publish boolean, granted_via text, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissão'; end if;
  return query
    select s.user_id, coalesce(u.raw_user_meta_data->>'username', 'sem nome'), s.can_publish, s.granted_via, s.since
    from public.app_staff s join auth.users u on u.id = s.user_id order by s.since desc;
end $$;

create or replace function public.staff_set_publish(p_user uuid, p_can boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissão'; end if;
  update public.app_staff set can_publish = coalesce(p_can, false) where user_id = p_user;
end $$;

create or replace function public.staff_revoke(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissão'; end if;
  delete from public.app_staff where user_id = p_user;
end $$;

grant execute on function public.my_staff_status()                                     to authenticated;
grant execute on function public.can_publish_announcements()                           to authenticated;
grant execute on function public.send_announcement(text, text, text, int, boolean)     to authenticated;
grant execute on function public.propose_announcement(text, text, text)                to authenticated;
grant execute on function public.list_proposals()                                      to authenticated;
grant execute on function public.review_proposal(bigint, boolean)                      to authenticated;
grant execute on function public.staff_list()                                          to authenticated;
grant execute on function public.staff_set_publish(uuid, boolean)                      to authenticated;
grant execute on function public.staff_revoke(uuid)                                    to authenticated;

-- ============================================================================
-- VANTAGEM: admin tem o plano Premium (se o plano dele for menor) — sem anúncios e com limite maior
-- ============================================================================
create or replace function public.get_my_plan()
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  per text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  up  public.user_plans;
  pl  public.plans;
  sp  public.plans;
  cnt public.download_counters;
  staff boolean := false;
begin
  if uid is null then return null; end if;
  select * into up from public.user_plans where user_id = uid;
  if found and (up.expires_at is null or up.expires_at > now()) then
    select * into pl from public.plans where id = up.plan_id;
  end if;
  if pl.id is null then select * into pl from public.plans where id = 'free'; end if;

  staff := public._is_staff(uid) or public.is_app_admin();
  if staff then
    select * into sp from public.plans where id = 'premium';
    if sp.id is not null and sp.rank > pl.rank then pl := sp; up.expires_at := null; end if;
  end if;

  select * into cnt from public.download_counters where user_id = uid and period = per;
  return json_build_object(
    'plan_id', pl.id, 'name', pl.name, 'show_ads', pl.show_ads, 'price_brl', pl.price_brl,
    'limit', pl.downloads_per_month + coalesce(cnt.bonus, 0),
    'used', coalesce(cnt.used, 0),
    'remaining', greatest(pl.downloads_per_month + coalesce(cnt.bonus, 0) - coalesce(cnt.used, 0), 0),
    'expires_at', case when pl.id = 'free' then null else up.expires_at end,
    'bonus_today', case when cnt.bonus_day = current_date then cnt.bonus_today else 0 end,
    'staff', staff
  );
end $$;
