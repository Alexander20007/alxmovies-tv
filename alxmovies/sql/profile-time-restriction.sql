-- Horário permitido de uso por perfil — fora da janela configurada,
-- o perfil fica bloqueado até a janela abrir de novo. Desativado por
-- padrão (não afeta nenhum perfil existente até ser configurado).
-- Rode isso uma vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists time_restriction_enabled boolean not null default false,
  add column if not exists allowed_start_time text, -- formato "HH:MM"
  add column if not exists allowed_end_time text;    -- formato "HH:MM"

comment on column public.profiles.time_restriction_enabled is
  'Se true, o perfil só pode ser usado dentro da janela allowed_start_time–allowed_end_time.';
comment on column public.profiles.allowed_start_time is
  'Horário de início permitido, formato "HH:MM" (hora local do aparelho de quem usa).';
comment on column public.profiles.allowed_end_time is
  'Horário de fim permitido, formato "HH:MM". Se for menor que o de início, a janela vira a madrugada (ex: 18:00–08:00).';
