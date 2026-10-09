-- Canais favoritos por CANAL INDIVIDUAL (não mais por categoria).
-- Substitui a abordagem anterior (profiles.favorite_channel_categories,
-- de sql/channel-favorites.sql) — aquela coluna pode continuar existindo
-- sem problema, só não é mais lida pelo código; se quiser, pode até
-- apagar ela depois (não é obrigatório).
--
-- Rode isso uma vez no SQL Editor do Supabase.

create table if not exists public.channel_favorites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel_name text not null,
  channel_group text,
  channel_logo text,
  channel_stream text not null,
  added_at timestamptz not null default now(),
  unique (profile_id, channel_stream)
);

alter table public.channel_favorites enable row level security;

drop policy if exists "channel_favorites_select_own" on public.channel_favorites;
create policy "channel_favorites_select_own"
  on public.channel_favorites for select
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "channel_favorites_insert_own" on public.channel_favorites;
create policy "channel_favorites_insert_own"
  on public.channel_favorites for insert
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "channel_favorites_delete_own" on public.channel_favorites;
create policy "channel_favorites_delete_own"
  on public.channel_favorites for delete
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

comment on table public.channel_favorites is
  'Canais individuais marcados como favoritos por cada perfil — testados com prioridade na fileira de canais ao vivo.';
