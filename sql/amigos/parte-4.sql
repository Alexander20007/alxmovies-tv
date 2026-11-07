-- ============================================================
-- AMIGOS — PARTE 4 DE 7: Pedidos, amizades e bloqueio
-- Rode as partes NA ORDEM (1 a 7), uma de cada vez, no SQL Editor.
-- Esta parte é curta de propósito, pra caber na hora de colar.
-- ============================================================

-- ------------------------------------------------------------
-- PEDIDOS, AMIGOS E BLOQUEIO
-- ------------------------------------------------------------

-- Pede amizade pelo CÓDIGO (não existe busca por nome — assim ninguém
-- consegue "listar" perfis do site). Se a outra pessoa já tinha te
-- pedido, a amizade é aceita na hora. Devolve o id da amizade.
create or replace function public.social_send_request(p_from_profile_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profile_social;
  v_target public.profile_social;
  v_code text;
  v_existing public.friendships;
  v_id uuid;
begin
  perform public.social_check_owner(p_from_profile_id);
  v_me := public.social_ensure_settings(p_from_profile_id);

  if not v_me.friends_enabled then
    raise exception 'as amizades estão desativadas neste perfil';
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_code) < 4 then
    raise exception 'digite o código de amigo completo';
  end if;

  select * into v_target from public.profile_social where friend_code = v_code;
  if not found then
    raise exception 'código não encontrado';
  end if;

  if v_target.profile_id = p_from_profile_id then
    raise exception 'esse é o seu próprio código';
  end if;

  if exists (
    select 1
    from public.profiles a, public.profiles b
    where a.id = p_from_profile_id and b.id = v_target.profile_id and a.user_id = b.user_id
  ) then
    raise exception 'esse perfil é da sua própria conta';
  end if;

  select * into v_existing
  from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(p_from_profile_id, v_target.profile_id)
    and greatest(f.requester_id, f.addressee_id) = greatest(p_from_profile_id, v_target.profile_id);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'vocês já são amigos';
    elsif v_existing.status = 'blocked' then
      -- não revela quem bloqueou quem
      raise exception 'não foi possível enviar o pedido para esse código';
    elsif v_existing.requester_id = p_from_profile_id then
      raise exception 'você já enviou um pedido pra essa pessoa';
    else
      -- ela já tinha te pedido: aceita na hora
      update public.friendships
         set status = 'accepted', responded_at = now()
       where id = v_existing.id;
      return v_existing.id;
    end if;
  end if;

  if not v_target.friends_enabled or not v_target.accept_requests then
    raise exception 'não foi possível enviar o pedido para esse código';
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (p_from_profile_id, v_target.profile_id)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.social_respond_request(
  p_profile_id uuid,
  p_friendship_id uuid,
  p_accept boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  if p_accept then
    update public.friendships
       set status = 'accepted', responded_at = now()
     where id = p_friendship_id and addressee_id = p_profile_id and status = 'pending';
  else
    delete from public.friendships
     where id = p_friendship_id and addressee_id = p_profile_id and status = 'pending';
  end if;

  if not found then
    raise exception 'esse pedido não existe mais';
  end if;
end;
$$;

-- Desfaz amizade OU cancela um pedido que você enviou.
create or replace function public.social_remove_friend(p_profile_id uuid, p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  delete from public.friendships
   where id = p_friendship_id
     and status in ('pending', 'accepted')
     and (requester_id = p_profile_id or addressee_id = p_profile_id);
end;
$$;

create or replace function public.social_block(p_profile_id uuid, p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  update public.friendships
     set status = 'blocked', blocked_by = p_profile_id, responded_at = now()
   where id = p_friendship_id
     and status in ('pending', 'accepted')
     and (requester_id = p_profile_id or addressee_id = p_profile_id);

  if not found then
    raise exception 'não foi possível bloquear';
  end if;

  delete from public.social_notifications where friendship_id = p_friendship_id;
end;
$$;

create or replace function public.social_unblock(p_profile_id uuid, p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);

  delete from public.friendships
   where id = p_friendship_id and status = 'blocked' and blocked_by = p_profile_id;
end;
$$;
