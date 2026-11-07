-- ============================================================
-- ALXmovies - Comentários públicos + avaliações visíveis
-- Rode no Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- 1. Permitir que qualquer um LEIA as avaliações (liked/loved/disliked),
--    mantendo que só o dono pode criar/editar as suas.
DROP POLICY IF EXISTS "Usuários gerenciam avaliações dos seus perfis" ON ratings;

CREATE POLICY "Avaliações são públicas para leitura"
    ON ratings FOR SELECT
    USING (true);

CREATE POLICY "Usuários criam avaliações dos seus perfis"
    ON ratings FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = ratings.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Usuários atualizam avaliações dos seus perfis"
    ON ratings FOR UPDATE
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = ratings.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Usuários excluem avaliações dos seus perfis"
    ON ratings FOR DELETE
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = ratings.profile_id AND p.user_id = auth.uid()));


-- 2. Tabela de comentários (públicos, um por perfil por título — pode
--    editar o próprio comentário, mas só um comentário ativo por título)
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    media_id INTEGER NOT NULL,
    media_type TEXT NOT NULL, -- movie | tv
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_media ON comments(media_id, media_type, created_at DESC);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comentários são públicos para leitura"
    ON comments FOR SELECT
    USING (true);

CREATE POLICY "Usuários criam comentários dos seus perfis"
    ON comments FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = comments.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Usuários excluem comentários dos seus perfis"
    ON comments FOR DELETE
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = comments.profile_id AND p.user_id = auth.uid()));

-- Verificação
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'comments';
