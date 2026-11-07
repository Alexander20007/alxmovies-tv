-- ============================================================
-- ALXmovies - "Marcar como visto" (episódios) salvo no Supabase
-- Rode no Supabase Dashboard -> SQL Editor -> New query
--
-- Como funciona:
--  • FILMES: marcar como visto grava/atualiza a linha em watch_history com progress = 100
--    (a mesma tabela que já alimenta "Já assistidos" e "Assistidos recentemente"). Desmarcar apaga a linha.
--  • SÉRIES: cada episódio visto vira uma linha nesta tabela (episodes_seen). Quando todos os episódios
--    da série estão marcados, o app grava a série em watch_history com progress = 100 (aí ela aparece em "Já assistidos").
--    Se a pessoa desmarcar algum episódio depois, a série volta para progress = 94 (sai de "Já assistidos").
-- ============================================================

create table if not exists public.episodes_seen (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  tv_id           integer not null,
  season_number   integer not null,
  episode_number  integer not null,
  seen_at         timestamptz not null default now(),
  unique (profile_id, tv_id, season_number, episode_number)
);

create index if not exists episodes_seen_profile_tv_idx on public.episodes_seen (profile_id, tv_id);

alter table public.episodes_seen enable row level security;

drop policy if exists "Usuários leem episódios vistos dos seus perfis" on public.episodes_seen;
drop policy if exists "Usuários marcam episódios vistos dos seus perfis" on public.episodes_seen;
drop policy if exists "Usuários atualizam episódios vistos dos seus perfis" on public.episodes_seen;
drop policy if exists "Usuários desmarcam episódios vistos dos seus perfis" on public.episodes_seen;

create policy "Usuários leem episódios vistos dos seus perfis"
  on public.episodes_seen for select
  using (exists (select 1 from public.profiles p where p.id = episodes_seen.profile_id and p.user_id = auth.uid()));

create policy "Usuários marcam episódios vistos dos seus perfis"
  on public.episodes_seen for insert
  with check (exists (select 1 from public.profiles p where p.id = episodes_seen.profile_id and p.user_id = auth.uid()));

create policy "Usuários atualizam episódios vistos dos seus perfis"
  on public.episodes_seen for update
  using (exists (select 1 from public.profiles p where p.id = episodes_seen.profile_id and p.user_id = auth.uid()));

create policy "Usuários desmarcam episódios vistos dos seus perfis"
  on public.episodes_seen for delete
  using (exists (select 1 from public.profiles p where p.id = episodes_seen.profile_id and p.user_id = auth.uid()));

-- Verificação
select tablename, policyname, cmd from pg_policies where tablename = 'episodes_seen' order by cmd;
