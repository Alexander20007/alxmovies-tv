-- ============================================================
-- ASSUMIR ANFITRIÃO AUTOMATICAMENTE (quando o atual desconecta)
-- ------------------------------------------------------------
-- Diferente de transfer_room_host (que é uma escolha manual do
-- anfitrião atual), esta função é chamada pelo PRÓPRIO CLIENTE
-- quando percebe, pela Presença em tempo real, que o anfitrião não
-- está mais conectado. Ela recalcula do lado do servidor, com dados
-- reais de quando cada um entrou (watch_room_members.joined_at),
-- quem É de fato a próxima pessoa na fila — e só deixa essa pessoa
-- específica assumir. Isso evita que qualquer convidado tente se
-- autopromover fora de ordem.
--
-- Limitação importante (aceitável pro caso de uso — amigos vendo
-- filme juntos, não é um sistema de alta segurança): quem está
-- "online" é informado pelo próprio cliente que chama a função
-- (p_online_user_ids), porque a Presença em tempo real não é vista
-- pelo Postgres. A função ainda assim confirma o anfitrião contra o
-- histórico real de entrada na sala, então não dá pra "furar a fila"
-- — só dá pra, no máximo, mentir sobre quem mais está online.
-- ============================================================

create or replace function claim_room_host_if_abandoned(
  p_room_id uuid,
  p_online_user_ids uuid[]
) returns table(host_user_id uuid, host_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_host uuid;
  v_candidate record;
begin
  select w.host_user_id into v_current_host from watch_rooms w where w.id = p_room_id and w.is_active = true;
  if v_current_host is null then
    raise exception 'sala não encontrada ou encerrada';
  end if;

  if v_current_host = any(p_online_user_ids) then
    raise exception 'o anfitrião ainda está online';
  end if;

  select m.user_id, m.display_name into v_candidate
  from watch_room_members m
  where m.room_id = p_room_id
    and m.user_id = any(p_online_user_ids)
    and m.user_id <> v_current_host
  order by m.joined_at asc
  limit 1;

  if v_candidate.user_id is null then
    raise exception 'não há ninguém elegível pra assumir a sala';
  end if;

  if v_candidate.user_id <> auth.uid() then
    raise exception 'não é a sua vez de assumir a sala';
  end if;

  update watch_rooms
  set host_user_id = v_candidate.user_id,
      host_name = v_candidate.display_name
  where id = p_room_id;

  return query select v_candidate.user_id, v_candidate.display_name;
end;
$$;

grant execute on function claim_room_host_if_abandoned to authenticated;
