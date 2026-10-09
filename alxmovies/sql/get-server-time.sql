-- ============================================================
-- HORÁRIO DO SERVIDOR (pro controle parental não confiar no
-- relógio do aparelho, que a criança pode simplesmente mudar)
-- ------------------------------------------------------------
-- now() do Postgres é o horário real do servidor do Supabase —
-- ninguém no navegador tem como alterar isso.
-- ============================================================

create or replace function get_server_time() returns timestamptz
language sql
security invoker
stable
as $$
  select now();
$$;

grant execute on function get_server_time to authenticated, anon;
