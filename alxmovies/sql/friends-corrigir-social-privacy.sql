-- ============================================================
-- CORREÇÃO: "relation public.social_privacy does not exist"
-- ============================================================
-- Esse erro ao criar perfil NÃO vem do sistema de amigos novo: a tabela
-- "social_privacy" não existe em nenhum arquivo do site. É uma SOBRA no
-- banco (quase sempre um trigger de uma tentativa antiga) que, a cada
-- perfil criado, tenta gravar numa tabela que não existe e derruba a
-- criação.
--
-- O que este script faz (e só faz se a tabela realmente não existe):
--   1) acha os triggers cujo código mexe em "social_privacy",
--      remove o trigger e a função dele;
--   2) mostra no final se ainda sobrou algo apontando pra ela.
--
-- Pode rodar quantas vezes quiser. Rode ESTE primeiro, depois o
-- friends-system.sql.
-- ============================================================

do $$
declare
  t record;
begin
  -- Se a tabela existir de verdade, não mexe em nada.
  if to_regclass('public.social_privacy') is not null then
    raise notice 'A tabela social_privacy existe — nada foi removido.';
    return;
  end if;

  for t in
    select tg.tgname as trigger_name,
           c.relname as table_name,
           p.oid as fn_oid
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal
      and n.nspname = 'public'
      and p.prosrc ilike '%social_privacy%'
  loop
    execute format('drop trigger if exists %I on public.%I', t.trigger_name, t.table_name);

    begin
      execute format('drop function %s', t.fn_oid::regprocedure);
    exception when others then
      -- a função é usada por outra coisa: deixa ela, o trigger já saiu
      null;
    end;
  end loop;
end
$$;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- CONFERÊNCIA: ainda sobrou alguma coisa apontando pra social_privacy?
-- Resultado VAZIO ("No rows returned") = tudo limpo.
-- Se aparecer alguma linha, copie e me mande.
-- ------------------------------------------------------------
select 'trigger' as tipo, c.relname || '.' || tg.tgname as nome
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_proc p on p.oid = tg.tgfoid
where not tg.tgisinternal and p.prosrc ilike '%social_privacy%'

union all
select 'função', p.oid::regprocedure::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema') and p.prosrc ilike '%social_privacy%'

union all
select 'política (RLS)', schemaname || '.' || tablename || ' → ' || policyname
from pg_policies
where coalesce(qual, '') || coalesce(with_check, '') ilike '%social_privacy%'

union all
select 'view', schemaname || '.' || viewname
from pg_views
where definition ilike '%social_privacy%';
