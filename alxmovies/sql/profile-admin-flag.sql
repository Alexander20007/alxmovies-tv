-- Adiciona o controle de "perfil responsável" — só perfis marcados
-- assim enxergam e conseguem abrir o Painel da Conta (Segurança,
-- Assinatura, dados da conta etc.), mesmo sabendo a senha da conta.
-- Rode isso uma vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Perfil responsável: só quem tem isso marcado vê/acessa o Painel da Conta no menu.';
