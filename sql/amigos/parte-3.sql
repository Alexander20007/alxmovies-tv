-- ============================================================
-- AMIGOS — PARTE 3 DE 7: Configurações do perfil
-- Rode as partes NA ORDEM (1 a 7), uma de cada vez, no SQL Editor.
-- Esta parte é curta de propósito, pra caber na hora de colar.
-- ============================================================

-- ------------------------------------------------------------
-- CONFIGURAÇÕES SOCIAIS DO PERFIL
-- ------------------------------------------------------------

-- Cria sob demanda (na primeira vez que o perfil usa o recurso) e
-- devolve sempre a mesma linha. Perfil infantil nasce com amizades
-- desligadas.
create or replace function public.social_ensure_settings(p_profile_id uuid)
returns public.profile_social
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profile_social;
  v_kids boolean;
  v_code text;
begin
  perform public.social_check_owner(p_profile_id);

  select * into v from public.profile_social where profile_id = p_profile_id;
  if found then
    return v;
  end if;

  select coalesce(is_kids, false) into v_kids from public.profiles where id = p_profile_id;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profile_social where friend_code = v_code);
  end loop;

  insert into public.profile_social (profile_id, friend_code, friends_enabled)
  values (p_profile_id, v_code, not v_kids)
  on conflict (profile_id) do nothing;

  select * into v from public.profile_social where profile_id = p_profile_id;
  return v;
end;
$$;

-- Atualiza só o que foi enviado (null = não mexe).
create or replace function public.social_update_settings(
  p_profile_id uuid,
  p_show_watching boolean default null,
  p_friends_enabled boolean default null,
  p_accept_requests boolean default null
) returns public.profile_social
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profile_social;
begin
  perform public.social_ensure_settings(p_profile_id);

  update public.profile_social
     set show_watching = coalesce(p_show_watching, show_watching),
         friends_enabled = coalesce(p_friends_enabled, friends_enabled),
         accept_requests = coalesce(p_accept_requests, accept_requests),
         updated_at = now()
   where profile_id = p_profile_id
   returning * into v;

  -- Desligou o compartilhamento (ou as amizades): some na hora, sem
  -- esperar o tempo de expiração.
  if not v.show_watching or not v.friends_enabled then
    delete from public.friend_activity where profile_id = p_profile_id;
  end if;

  return v;
end;
$$;

-- Troca o código de amigo (útil se ele foi parar onde não devia).
create or replace function public.social_regenerate_code(p_profile_id uuid)
returns public.profile_social
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profile_social;
  v_code text;
begin
  perform public.social_ensure_settings(p_profile_id);

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profile_social where friend_code = v_code);
  end loop;

  update public.profile_social
     set friend_code = v_code, updated_at = now()
   where profile_id = p_profile_id
   returning * into v;
  return v;
end;
$$;
