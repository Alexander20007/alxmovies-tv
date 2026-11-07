-- ============================================================================
-- ALXmovies — PLANOS, LIMITE DE DOWNLOAD, BÔNUS POR ANÚNCIO E RODA DA SORTE
-- Rode UMA vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema (usa IF NOT EXISTS / OR REPLACE).
-- Preços ainda não definidos: a coluna price_brl fica vazia (null) até você decidir.
-- ============================================================================

-- ---------- 1) Planos (edite os números quando quiser; o app lê daqui) ----------
create table if not exists public.plans (
  id                  text primary key,            -- free | apoiador | premium | familia
  name                text not null,
  downloads_per_month int  not null,               -- limite de downloads por mês (por CONTA, vale para todos os perfis)
  show_ads            boolean not null default false,
  rank                int  not null,               -- maior = melhor (usado ao resgatar prêmios)
  price_brl           numeric(8,2),                -- null = "em breve"
  perks               text[] not null default '{}'
);

insert into public.plans (id, name, downloads_per_month, show_ads, rank, price_brl, perks) values
  ('free',     'Grátis',    5,   true,  0, null, array['5 downloads por mês','Com anúncios','Assista anúncio para ganhar +1 download']),
  ('apoiador', 'Apoiador',  30,  false, 1, null, array['30 downloads por mês','Sem anúncios','Selo de apoiador']),
  ('premium',  'Premium',   100, false, 2, null, array['100 downloads por mês','Sem anúncios','Prioridade nos novos recursos']),
  ('familia',  'Família',   250, false, 3, null, array['250 downloads por mês (compartilhados entre os perfis)','Sem anúncios','Ideal para toda a casa'])
on conflict (id) do nothing;   -- não sobrescreve se você já ajustou os valores

alter table public.plans enable row level security;
drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select using (true);

-- ---------- 2) Plano de cada conta ----------
create table if not exists public.user_plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan_id    text not null references public.plans(id),
  expires_at timestamptz,                          -- null = não expira
  source     text not null default 'manual',       -- manual | wheel | code | purchase
  updated_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
drop policy if exists user_plans_read on public.user_plans;
create policy user_plans_read on public.user_plans for select using (auth.uid() = user_id);
-- (sem policy de escrita: só as funções abaixo e você, pelo painel, alteram o plano)

-- ---------- 3) Contador de downloads do mês ----------
create table if not exists public.download_counters (
  user_id     uuid not null references auth.users(id) on delete cascade,
  period      text not null,                       -- 'YYYY-MM'
  used        int  not null default 0,
  bonus       int  not null default 0,             -- downloads extras (anúncio premiado / prêmios)
  bonus_day   date,
  bonus_today int  not null default 0,             -- quantos bônus de anúncio já ganhou hoje
  primary key (user_id, period)
);
alter table public.download_counters enable row level security;
drop policy if exists dl_counters_read on public.download_counters;
create policy dl_counters_read on public.download_counters for select using (auth.uid() = user_id);

-- ---------- 4) Códigos de prêmio (gerados pela roda da sorte do site) ----------
create table if not exists public.promo_codes (
  code            text primary key,
  plan_id         text references public.plans(id),
  days            int,                             -- dias do plano (null = só bônus)
  bonus_downloads int not null default 0,
  prize_label     text not null,
  device_hash     text,
  ip_hash         text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  redeemed_by     uuid references auth.users(id),
  redeemed_at     timestamptz
);
alter table public.promo_codes enable row level security;   -- sem policies: ninguém lê direto

create index if not exists promo_codes_device_day on public.promo_codes (device_hash, created_at);
create index if not exists promo_codes_ip_day on public.promo_codes (ip_hash, created_at);

-- ============================================================================
-- FUNÇÕES
-- ============================================================================

-- Plano atual + uso do mês. Plano vencido ou convidado → Grátis.
create or replace function public.get_my_plan()
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  per text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  up  public.user_plans;
  pl  public.plans;
  cnt public.download_counters;
begin
  if uid is null then return null; end if;
  select * into up from public.user_plans where user_id = uid;
  if found and (up.expires_at is null or up.expires_at > now()) then
    select * into pl from public.plans where id = up.plan_id;
  end if;
  if pl.id is null then select * into pl from public.plans where id = 'free'; end if;
  select * into cnt from public.download_counters where user_id = uid and period = per;
  return json_build_object(
    'plan_id', pl.id, 'name', pl.name, 'show_ads', pl.show_ads, 'price_brl', pl.price_brl,
    'limit', pl.downloads_per_month + coalesce(cnt.bonus, 0),
    'used', coalesce(cnt.used, 0),
    'remaining', greatest(pl.downloads_per_month + coalesce(cnt.bonus, 0) - coalesce(cnt.used, 0), 0),
    'expires_at', case when pl.id = 'free' then null else up.expires_at end,
    'bonus_today', case when cnt.bonus_day = current_date then cnt.bonus_today else 0 end
  );
end $$;

-- Gasta 1 download (atômico). ok=false quando o limite acabou.
create or replace function public.use_download()
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  per text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  p json; lim int; n int;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'login'); end if;
  p := public.get_my_plan();
  lim := (p->>'limit')::int;
  insert into public.download_counters (user_id, period) values (uid, per) on conflict do nothing;
  update public.download_counters set used = used + 1
   where user_id = uid and period = per and used < lim
  returning used into n;
  if n is null then
    return json_build_object('ok', false, 'remaining', 0, 'plan_id', p->>'plan_id');
  end if;
  return json_build_object('ok', true, 'remaining', lim - n, 'plan_id', p->>'plan_id');
end $$;

-- +1 download por anúncio premiado assistido (máx. 3 por dia, só no plano Grátis).
create or replace function public.grant_ad_bonus()
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  per text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  p json; c public.download_counters;
begin
  if uid is null then return json_build_object('ok', false); end if;
  p := public.get_my_plan();
  if p->>'plan_id' <> 'free' then return json_build_object('ok', false, 'error', 'not_free'); end if;
  insert into public.download_counters (user_id, period) values (uid, per) on conflict do nothing;
  select * into c from public.download_counters where user_id = uid and period = per for update;
  if c.bonus_day = current_date and c.bonus_today >= 3 then
    return json_build_object('ok', false, 'error', 'daily_cap');
  end if;
  update public.download_counters
     set bonus = bonus + 1,
         bonus_today = case when bonus_day = current_date then bonus_today + 1 else 1 end,
         bonus_day = current_date
   where user_id = uid and period = per;
  return json_build_object('ok', true);
end $$;

-- Resgata um código de prêmio dentro do app.
create or replace function public.redeem_promo_code(p_code text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  per text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  pc public.promo_codes; up public.user_plans; newp public.plans; curp public.plans;
  base timestamptz;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'login'); end if;
  select * into pc from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found then return json_build_object('ok', false, 'error', 'invalid'); end if;
  if pc.redeemed_by is not null then return json_build_object('ok', false, 'error', 'used'); end if;
  if pc.expires_at < now() then return json_build_object('ok', false, 'error', 'expired'); end if;

  if pc.plan_id is not null and coalesce(pc.days, 0) > 0 then
    select * into newp from public.plans where id = pc.plan_id;
    select * into up from public.user_plans where user_id = uid;
    base := now();
    if found and (up.expires_at is null or up.expires_at > now()) then
      select * into curp from public.plans where id = up.plan_id;
      if curp.rank > newp.rank then
        -- já tem plano melhor: o prêmio vira o mesmo tempo a mais no plano atual
        update public.user_plans set expires_at = coalesce(expires_at, now()) + make_interval(days => pc.days), updated_at = now() where user_id = uid;
        newp := curp;
      elsif curp.id = newp.id then
        update public.user_plans set expires_at = coalesce(expires_at, now()) + make_interval(days => pc.days), updated_at = now() where user_id = uid;
      else
        update public.user_plans set plan_id = newp.id, expires_at = now() + make_interval(days => pc.days), source = 'wheel', updated_at = now() where user_id = uid;
      end if;
    else
      insert into public.user_plans (user_id, plan_id, expires_at, source)
        values (uid, newp.id, now() + make_interval(days => pc.days), 'wheel')
      on conflict (user_id) do update set plan_id = excluded.plan_id, expires_at = excluded.expires_at, source = 'wheel', updated_at = now();
    end if;
  end if;

  if pc.bonus_downloads > 0 then
    insert into public.download_counters (user_id, period, bonus) values (uid, per, pc.bonus_downloads)
    on conflict (user_id, period) do update set bonus = public.download_counters.bonus + excluded.bonus;
  end if;

  update public.promo_codes set redeemed_by = uid, redeemed_at = now() where code = pc.code;
  return json_build_object('ok', true, 'prize', pc.prize_label);
end $$;

-- RODA DA SORTE (site, sem login): 1 giro por aparelho e por rede a cada 24 h. Devolve o prêmio e um código.
create or replace function public.wheel_spin(p_device text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  dev text := left(coalesce(p_device, ''), 80);
  ip  text := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  ipk text := md5('alx-wheel:' || ip);
  devk text := md5('alx-wheel-dev:' || dev);
  r numeric := random() * 100;
  seg int; label text; pid text; d int; b int; code text;
begin
  if length(dev) < 8 then return json_build_object('ok', false, 'error', 'device'); end if;
  if exists (select 1 from public.promo_codes
              where created_at > now() - interval '24 hours'
                and (device_hash = devk or (ip <> '' and ip_hash = ipk))) then
    return json_build_object('ok', false, 'error', 'already');
  end if;

  -- Probabilidades (edite à vontade; somam 100). seg = fatia da roda no site (0..7)
  if    r < 40 then seg := 0; label := 'Não foi dessa vez';   pid := null;       d := null; b := 0;
  elsif r < 62 then seg := 1; label := '+2 downloads';        pid := null;       d := null; b := 2;
  elsif r < 77 then seg := 2; label := '+5 downloads';        pid := null;       d := null; b := 5;
  elsif r < 87 then seg := 3; label := 'Apoiador por 3 dias'; pid := 'apoiador'; d := 3;    b := 0;
  elsif r < 93 then seg := 4; label := 'Apoiador por 7 dias'; pid := 'apoiador'; d := 7;    b := 0;
  elsif r < 97 then seg := 5; label := 'Premium por 3 dias';  pid := 'premium';  d := 3;    b := 0;
  elsif r < 99 then seg := 6; label := 'Premium por 7 dias';  pid := 'premium';  d := 7;    b := 0;
  else              seg := 7; label := 'Família por 7 dias';  pid := 'familia';  d := 7;    b := 0;
  end if;

  if seg = 0 then
    -- registra o giro sem código (para valer o limite de 24 h)
    insert into public.promo_codes (code, prize_label, device_hash, ip_hash, expires_at)
      values ('X' || substr(md5(random()::text || clock_timestamp()::text), 1, 12), label, devk, ipk, now());
    return json_build_object('ok', true, 'segment', seg, 'prize', label, 'code', null);
  end if;

  code := 'ALX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 5, 4));
  insert into public.promo_codes (code, plan_id, days, bonus_downloads, prize_label, device_hash, ip_hash)
    values (code, pid, d, b, label, devk, ipk);
  return json_build_object('ok', true, 'segment', seg, 'prize', label, 'code', code);
end $$;

grant execute on function public.get_my_plan()            to authenticated;
grant execute on function public.use_download()           to authenticated;
grant execute on function public.grant_ad_bonus()         to authenticated;
grant execute on function public.redeem_promo_code(text)  to authenticated;
grant execute on function public.wheel_spin(text)         to anon, authenticated;

-- ---------- Dar um plano na mão (exemplo — troque o e-mail/ID e rode quando quiser) ----------
-- insert into public.user_plans (user_id, plan_id, expires_at, source)
-- values ('ID-DA-CONTA', 'premium', now() + interval '30 days', 'manual')
-- on conflict (user_id) do update set plan_id = excluded.plan_id, expires_at = excluded.expires_at, updated_at = now();
