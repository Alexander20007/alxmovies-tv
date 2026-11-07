-- ============================================================
-- FIX: "senha incorreta" ao entrar numa sala privada que você JÁ
-- entrou (1ª tentativa falhava, 2ª funcionava)
-- ------------------------------------------------------------
-- A lista valida a senha e grava você em watch_room_members; depois
-- a página da sala chama join_watch_room de novo, sem senha. A função
-- não olhava a membership e recusava. Agora quem já é membro (ou o
-- anfitrião) passa direto. Rode UMA vez no SQL Editor do Supabase.
-- ============================================================
create or replace function join_watch_room(
  p_room_id uuid,
  p_password text,
  p_display_name text
) returns watch_rooms_public
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room watch_rooms;
  v_already boolean;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_room from watch_rooms where id = p_room_id and is_active = true;
  if not found then
    raise exception 'sala não encontrada ou encerrada';
  end if;

  select exists (
    select 1 from watch_room_members where room_id = p_room_id and user_id = auth.uid()
  ) into v_already;

  if v_room.is_private and v_room.password_hash is not null
     and v_room.host_user_id <> auth.uid()
     and not v_already then
    if p_password is null or crypt(p_password, v_room.password_hash) <> v_room.password_hash then
      raise exception 'senha incorreta';
    end if;
  end if;

  insert into watch_room_members (room_id, user_id, display_name)
  values (p_room_id, auth.uid(), coalesce(p_display_name, 'Convidado'))
  on conflict (room_id, user_id) do update set display_name = excluded.display_name;

  return (select r from watch_rooms_public r where r.id = p_room_id);
end;
$$;

grant execute on function join_watch_room to authenticated;
