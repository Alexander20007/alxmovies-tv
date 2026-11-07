-- ============================================================
-- Agenda a limpeza automática de contas de convidado vencidas
-- (rodar no SQL Editor do Supabase, DEPOIS de fazer o deploy da
-- função supabase/functions/cleanup-guest-accounts)
-- ============================================================

-- 1) Habilite as extensões pg_cron e pg_net em Database > Extensions
--    (só precisa fazer isso uma vez; se já estiverem "Enabled", pule)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Cancela o agendamento antigo (que faltava o header Authorization
--    — por isso a limpeza nunca rodou de verdade até agora) e cria de
--    novo, já corrigido.
--
--    O Supabase exige um header "Authorization" válido em TODA chamada
--    de Edge Function, antes até de rodar o código da própria função —
--    isso é separado da nossa checagem de "x-cron-secret" (que só é
--    conferida DEPOIS que o Supabase libera a passagem). A versão
--    anterior deste arquivo não mandava esse header, então toda
--    chamada era barrada com 401 direto na plataforma — só que isso
--    aparecia como "succeeded" no pg_cron, porque o pg_cron só confirma
--    que CONSEGUIU enviar a requisição, não que ela teve sucesso do
--    outro lado. O valor abaixo é a chave pública (ANON_KEY) do
--    projeto — ela é feita pra ser pública, não é segredo nenhum.
select cron.unschedule('cleanup-guest-accounts-hourly');

select cron.schedule(
  'cleanup-guest-accounts-hourly',
  '0 * * * *', -- todo início de hora
  $$
  select net.http_post(
    url := 'https://onqxflwfkexitipylixc.supabase.co/functions/v1/cleanup-guest-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_P6xFktXhhIjgC4hVxD6FxA_EbPl-clT',
      'x-cron-secret', '939438770933097106alexlaura'
    )
  );
  $$
);

-- Pra conferir os agendamentos ativos:
-- select * from cron.job;

-- Pra remover esse agendamento no futuro, se precisar:
-- select cron.unschedule('cleanup-guest-accounts-hourly');

-- ============================================================
-- Garante que, ao apagar a conta do convidado, os dados dela
-- (perfis, favoritos, avaliações, histórico) somem juntos, em vez
-- de ficarem órfãos no banco.
-- Isso só é necessário se a constraint de profiles.user_id ainda
-- não tiver ON DELETE CASCADE. Rode uma vez; se a constraint já
-- existir com outro nome, ajuste o nome abaixo (consulte com:
--   select conname from pg_constraint where conrelid = 'profiles'::regclass;
-- ============================================================
alter table public.profiles
  drop constraint if exists profiles_user_id_fkey;

alter table public.profiles
  add constraint profiles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
