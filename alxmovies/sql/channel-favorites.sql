-- Guarda as categorias de canal favoritas de cada perfil — antes
-- ficava só no localStorage do navegador (por isso sumia ao trocar
-- de aparelho/navegador); agora fica no próprio perfil, sincronizado
-- pelo Supabase como qualquer outro dado de perfil.
-- Rode isso uma vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists favorite_channel_categories jsonb not null default '[]'::jsonb;

comment on column public.profiles.favorite_channel_categories is
  'Lista de nomes de categoria de canal (ex: ["GLOBO","ESPN"]) que esse perfil marcou como favoritas — testadas com prioridade na fileira de canais ao vivo.';
