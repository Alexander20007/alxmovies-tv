-- Mostra TODAS as colunas reais de cada tabela do projeto,
-- incluindo se são obrigatórias (NOT NULL) e seus tipos.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'subscriptions', 'favorites', 'watch_history', 'ratings', 'comments')
order by table_name, ordinal_position;
