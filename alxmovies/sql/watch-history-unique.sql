-- ============================================================
-- ALXmovies - Adicionar trava de duplicidade em watch_history
-- (necessária para o upsert de progresso funcionar por perfil)
-- Rode no Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

ALTER TABLE watch_history
  ADD CONSTRAINT watch_history_profile_id_media_id_media_type_key
  UNIQUE (profile_id, media_id, media_type);

-- Verificação
SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'watch_history'::regclass AND contype = 'u';
