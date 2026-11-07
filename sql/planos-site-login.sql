-- ============================================================================
-- ALXmovies — RODA DA SORTE COM LOGIN (prêmio cai direto na conta, sem código)
-- Rode DEPOIS do planos-e-anuncios.sql (que você já rodou). Pode rodar de novo sem problema.
-- ============================================================================

-- A roda antiga (sem login, por código) é desligada
drop function if exists public.wheel_spin(text);

-- Histórico de giros (1 por conta por dia; até 3 por rede por dia, para não travar Wi-Fi compartilhado)
create table if not exists public.wheel_spins (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  spun_on     date not null default (now() at time zone 'America/Sao_Paulo')::date,
  spun_at     timestamptz not null default now(),
  segment     int  not null,
  prize_label text not null,
  ip_hash     text
);
create unique index if not exists wheel_spins_user_day on public.wheel_spins (user_id, spun_on);
create index if not exists wheel_spins_ip_day on public.wheel_spins (ip_hash, spun_on);
alter table public.wheel_spins enable row level security;
drop policy if exists wheel_spins_read on public.wheel_spins;
create policy wheel_spins_read on public.wheel_spins for select using (auth.uid() = user_id);

-- Aplica um prêmio na conta (uso interno; ninguém chama direto)
create or replace function public._grant_prize(p_uid uuid, p_plan text, p_days int, p_bonus int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  per text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  up public.user_plans; newp public.plans; curp public.plans;
begin
  if p_plan is not null and coalesce(p_days, 0) > 0 then
    select * into newp from public.plans where id = p_plan;
    select * into up from public.user_plans where user_id = p_uid;
    if found and (up.expires_at is null or up.expires_at > now()) then
      select * into curp from public.plans where id = up.plan_id;
      if curp.rank >= newp.rank then
        -- já tem plano igual ou melhor: o prêmio vira tempo a mais nele
        update public.user_plans set expires_at = coalesce(expires_at, now()) + make_interval(days => p_days), updated_at = now() where user_id = p_uid;
      else
        update public.user_plans set plan_id = newp.id, expires_at = now() + make_interval(days => p_days), source = 'wheel', updated_at = now() where user_id = p_uid;
      end if;
    else
      insert into public.user_plans (user_id, plan_id, expires_at, source)
        values (p_uid, newp.id, now() + make_interval(days => p_days), 'wheel')
      on conflict (user_id) do update set plan_id = excluded.plan_id, expires_at = excluded.expires_at, source = 'wheel', updated_at = now();
    end if;
  end if;
  if coalesce(p_bonus, 0) > 0 then
    insert into public.download_counters (user_id, period, bonus) values (p_uid, per, p_bonus)
    on conflict (user_id, period) do update set bonus = public.download_counters.bonus + excluded.bonus;
  end if;
end $$;
revoke all on function public._grant_prize(uuid, text, int, int) from public, anon, authenticated;

-- Situação da roda para a conta logada
create or replace function public.wheel_status()
returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); last_spin public.wheel_spins; today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if uid is null then return json_build_object('logged', false); end if;
  select * into last_spin from public.wheel_spins where user_id = uid order by spun_at desc limit 1;
  return json_build_object(
    'logged', true,
    'can_spin', not (found and last_spin.spun_on = today),
    'last_prize', case when found then last_spin.prize_label end,
    'last_segment', case when found then last_spin.segment end,
    'last_at', case when found then last_spin.spun_at end
  );
end $$;

-- RODA DA SORTE: só com login (conta de e-mail, não convidado). 1 giro por dia. O prêmio já entra na conta.
create or replace function public.wheel_spin()
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  ip  text := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  ipk text := md5('alx-wheel:' || ip);
  r numeric := random() * 100;
  seg int; label text; pid text; d int; b int;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'login'); end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then return json_build_object('ok', false, 'error', 'guest'); end if;

  if exists (select 1 from public.wheel_spins where user_id = uid and spun_on = today) then
    return json_build_object('ok', false, 'error', 'already');
  end if;
  if ip <> '' and (select count(*) from public.wheel_spins where ip_hash = ipk and spun_on = today) >= 3 then
    return json_build_object('ok', false, 'error', 'network');
  end if;

  -- Probabilidades (somam 100; edite à vontade). seg = fatia da roda (0..7), mesma ordem da roda no site.
  if    r < 40 then seg := 0; label := 'Não foi dessa vez';   pid := null;       d := null; b := 0;
  elsif r < 62 then seg := 1; label := '+2 downloads';        pid := null;       d := null; b := 2;
  elsif r < 77 then seg := 2; label := '+5 downloads';        pid := null;       d := null; b := 5;
  elsif r < 87 then seg := 3; label := 'Apoiador por 3 dias'; pid := 'apoiador'; d := 3;    b := 0;
  elsif r < 93 then seg := 4; label := 'Apoiador por 7 dias'; pid := 'apoiador'; d := 7;    b := 0;
  elsif r < 97 then seg := 5; label := 'Premium por 3 dias';  pid := 'premium';  d := 3;    b := 0;
  elsif r < 99 then seg := 6; label := 'Premium por 7 dias';  pid := 'premium';  d := 7;    b := 0;
  else              seg := 7; label := 'Família por 7 dias';  pid := 'familia';  d := 7;    b := 0;
  end if;

  insert into public.wheel_spins (user_id, segment, prize_label, ip_hash) values (uid, seg, label, ipk);
  perform public._grant_prize(uid, pid, d, b);
  return json_build_object('ok', true, 'segment', seg, 'prize', label);
end $$;

revoke execute on function public.wheel_spin()   from public, anon;
revoke execute on function public.wheel_status() from public, anon;
grant  execute on function public.wheel_spin()   to authenticated;
grant  execute on function public.wheel_status() to authenticated;
