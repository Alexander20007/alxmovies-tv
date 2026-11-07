-- ============================================================
-- ALXmovies - Políticas granulares para favorites e watch_history
-- Rode no Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- FAVORITES ---------------------------------------------------
DROP POLICY IF EXISTS "Usuários gerenciam favoritos dos seus perfis" ON favorites;

CREATE POLICY "Usuários leem favoritos dos seus perfis"
    ON favorites FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = favorites.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Usuários criam favoritos dos seus perfis"
    ON favorites FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = favorites.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Usuários excluem favoritos dos seus perfis"
    ON favorites FOR DELETE
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = favorites.profile_id AND p.user_id = auth.uid()));


-- WATCH_HISTORY -------------------------------------------------
DROP POLICY IF EXISTS "Usuários gerenciam histórico dos seus perfis" ON watch_history;

CREATE POLICY "Usuários leem histórico dos seus perfis"
    ON watch_history FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = watch_history.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Usuários criam histórico dos seus perfis"
    ON watch_history FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = watch_history.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Usuários atualizam histórico dos seus perfis"
    ON watch_history FOR UPDATE
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = watch_history.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Usuários excluem histórico dos seus perfis"
    ON watch_history FOR DELETE
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = watch_history.profile_id AND p.user_id = auth.uid()));

-- Verificação: lista todas as políticas ativas nessas tabelas
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('favorites', 'watch_history')
ORDER BY tablename, cmd;
