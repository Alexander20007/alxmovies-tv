-- ============================================================
-- AMIGOS — PARTE 7 DE 7: Permissões, tempo real e conferência final
-- Rode as partes NA ORDEM (1 a 7), uma de cada vez, no SQL Editor.
-- Esta parte é curta de propósito, pra caber na hora de colar.
-- ============================================================

-- ------------------------------------------------------------
-- PERMISSÕES: só usuário logado executa as funções
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'social\_%' or p.proname in ('my_profile_ids', 'is_friendship_member'))
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;

-- ------------------------------------------------------------
-- REALTIME (mensagens, notificações e mudanças de amizade ao vivo)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['friend_messages', 'social_notifications', 'friendships']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- ------------------------------------------------------------
-- FINAL — recarrega o cache da API e mostra o que foi instalado
-- ------------------------------------------------------------
-- Se algum dia o site disser que uma função "não foi encontrada",
-- rode só esta parte (a linha do notify + o select) pra conferir.
notify pgrst, 'reload schema';

select tipo, nome, situacao
from (
  select 'tabela' as tipo, t as nome,
         case when to_regclass('public.' || t) is not null then 'ok' else 'FALTA' end as situacao
  from unnest(array['profile_social','friendships','friend_messages','friend_activity','social_notifications']) as t
  union all
  select 'função', f,
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = f
         ) then 'ok' else 'FALTA' end
  from unnest(array[
    'my_profile_ids','is_friendship_member','social_check_owner','social_ensure_settings',
    'social_update_settings','social_regenerate_code','social_send_request','social_respond_request',
    'social_remove_friend','social_block','social_unblock','social_list','social_set_watching',
    'social_clear_watching','social_send_message','social_mark_read','social_unread_total',
    'social_get_notifications','social_mark_notifications_read'
  ]) as f
) x
order by (situacao = 'ok'), tipo, nome;

-- ------------------------------------------------------------
-- LIMPEZA (opcional): registros de "assistindo" velhos não aparecem
-- pra ninguém depois de 24h, mas dá pra apagar de vez agendando via
-- pg_cron (mesmo padrão do cleanup-guest-accounts-cron.sql):
--
--   delete from public.friend_activity where updated_at < now() - interval '2 days';
-- ------------------------------------------------------------
