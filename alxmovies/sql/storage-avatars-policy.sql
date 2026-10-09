-- ============================================================
-- ALXmovies - Permissões de upload no bucket "avatars"
-- Rode no Supabase Dashboard -> SQL Editor -> New query
-- (Pré-requisito: o bucket "avatars" já precisa existir e estar
--  marcado como público em Storage -> avatars -> Configuration)
-- ============================================================

-- Permite que qualquer usuário autenticado envie arquivos pro bucket "avatars"
CREATE POLICY "Usuários autenticados podem enviar avatares"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Permite substituir (upsert) um arquivo já existente
CREATE POLICY "Usuários autenticados podem atualizar avatares"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

-- Permite excluir (opcional, útil se quiser trocar de foto no futuro)
CREATE POLICY "Usuários autenticados podem excluir avatares"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');

-- Leitura pública (necessário mesmo com bucket "público" em alguns casos)
CREATE POLICY "Avatares são públicos para leitura"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
