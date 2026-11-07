-- ============================================================
-- ALXmovies - Favoritos por perfil (não por conta)
-- Rode no Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- Remove a trava antiga (um favorito por CONTA)
ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_user_id_movie_id_movie_type_key;

-- Cria a nova trava (um favorito por PERFIL) — cada perfil da conta
-- pode favoritar o mesmo título independentemente dos outros perfis
ALTER TABLE favorites
  ADD CONSTRAINT favorites_profile_id_media_id_media_type_key
  UNIQUE (profile_id, media_id, media_type);

-- Verificação: mostra as constraints ativas na tabela favorites
SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'favorites'::regclass;


-- ============================================================
-- Verificação nas outras tabelas (ratings, watch_history) —
-- rode isso primeiro pra ver se elas têm o mesmo problema
-- (trava por conta em vez de por perfil)
-- ============================================================
SELECT conrelid::regclass AS tabela, conname, contype
FROM pg_constraint
WHERE conrelid IN ('ratings'::regclass, 'watch_history'::regclass)
  AND contype = 'u';

-- Se aparecer alguma constraint com "user_id" no nome (em vez de
-- "profile_id"), rode os comandos abaixo pra corrigir também.
-- Troque o nome da constraint pelo que apareceu na consulta acima.

-- Exemplo para ratings (ajuste o nome real da constraint):
-- ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_user_id_movie_id_movie_type_key;
-- ALTER TABLE ratings ADD CONSTRAINT ratings_profile_id_media_id_media_type_key
--   UNIQUE (profile_id, media_id, media_type);

-- Exemplo para watch_history (ajuste o nome real da constraint):
-- ALTER TABLE watch_history DROP CONSTRAINT IF EXISTS watch_history_user_id_movie_id_movie_type_key;
-- ALTER TABLE watch_history ADD CONSTRAINT watch_history_profile_id_media_id_media_type_key
--   UNIQUE (profile_id, media_id, media_type);
