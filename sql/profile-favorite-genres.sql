-- Gêneros favoritos de cada perfil — usados pra priorizar as fileiras
-- de gênero da home (em vez de mostrar sempre as 4 primeiras da lista
-- do TMDB, mostra primeiro as que o perfil marcou como favoritas).
-- Rode isso uma vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists favorite_genres jsonb not null default '[]'::jsonb;

comment on column public.profiles.favorite_genres is
  'IDs de gênero do TMDB (números) que esse perfil marcou como favoritos — priorizados nas fileiras de gênero da home.';
