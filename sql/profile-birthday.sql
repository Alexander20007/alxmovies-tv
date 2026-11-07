-- Aniversário do perfil, guardado no banco — antes era um nome de
-- perfil e uma data fixos direto no código (só funcionava pra um
-- perfil específico). Agora funciona pra QUALQUER perfil: quando o
-- dia/mês bater com a data de hoje, o site mostra a surpresa sozinho,
-- sem precisar mexer em código nenhum.
-- Rode isso uma vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists birthday date;

comment on column public.profiles.birthday is
  'Aniversário do perfil. Só o dia e o mês importam pra surpresa (o ano cadastrado é ignorado nessa checagem) — pode usar qualquer ano ao preencher.';
