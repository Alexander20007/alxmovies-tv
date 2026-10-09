-- Adiciona campos usados pelas novas telas de perfil e pelo filtro de
-- conteúdo por idade:
--   age             -> idade informada na criação do perfil
--   color_theme     -> cor de fundo do avatar quando não há foto (ex: "#e50914")
--   maturity_rating -> classificação indicativa do perfil: "L","10","12","14","16","18"
--                      (a coluna já existe na maioria dos projetos; o ALTER
--                      abaixo só entra em ação se ela ainda não existir)
-- Rode isso uma vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists age smallint,
  add column if not exists color_theme text,
  add column if not exists maturity_rating text default '16';

comment on column public.profiles.age is 'Idade informada na criação do perfil (opcional)';
comment on column public.profiles.color_theme is 'Cor de fundo do avatar quando o perfil não tem foto';
comment on column public.profiles.maturity_rating is 'Classificação indicativa do perfil: L, 10, 12, 14, 16 ou 18 — usada pelo filtro de conteúdo por idade';
