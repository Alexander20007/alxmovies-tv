-- ============================================================
-- FIX: "infinite recursion detected in policy for relation
-- watch_room_members"
-- ------------------------------------------------------------
-- A política antiga de SELECT em watch_room_members checava se você
-- é membro consultando a própria tabela watch_room_members dentro
-- da política dela mesma — isso faz o Postgres reavaliar a política
-- recursivamente pra sempre. Como a política de mensagens também
-- consulta watch_room_members, o chat inteiro quebrava.
--
-- A troca: cada usuário só precisa enxergar a PRÓPRIA linha de
-- membership (não a lista toda — a lista de quem está na sala já
-- vem do Realtime Presence, não do banco). Isso resolve a recursão
-- e continua funcionando exatamente igual pro chat, porque o
-- "sou membro desta sala?" continua batendo certo.
-- ============================================================

drop policy if exists "membro ve membros da sala" on watch_room_members;

create policy "usuario ve sua propria membership" on watch_room_members
  for select using (user_id = auth.uid());
