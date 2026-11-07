-- ============================================================
-- AMIGOS — parte 8: buscar pessoas pelo nome + sugestões automáticas
-- Rode no SQL Editor do Supabase (depois das partes 1 a 7). Pode rodar de novo sem problema.
-- ============================================================

-- 1) Quem aparece em buscas/sugestões (cada perfil pode desligar na tela Amigos → Privacidade)
alter table public.profile_social add column if not exists discoverable boolean not null default true;

create or replace function public.social_set_discoverable(p_profile_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_check_owner(p_profile_id);
  perform public.social_ensure_settings(p_profile_id);
  update public.profile_social set discoverable = coalesce(p_value, true), updated_at = now() where profile_id = p_profile_id;
end;
$$;

-- 2) Buscar por nome (p_query com 2+ letras) ou sugestões (p_query vazio).
--    Só aparece quem: aceita pedidos, está "visível" na busca, não é perfil infantil, não é da sua própria conta
--    e ainda não tem nenhuma relação com você (amigo, pedido, bloqueio).
--    Ordem: nome que começa igual → mais amigos em comum → (sugestões) variação diária.
create or replace function public.social_discover(p_profile_id uuid, p_query text default null, p_limit int default 20)
returns table (profile_id uuid, name text, avatar text, color_theme text, mutual_count int)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_q text;
  v_user uuid;
begin
  perform public.social_check_owner(p_profile_id);

  select pr.user_id into v_user from public.profiles pr where pr.id = p_profile_id and coalesce(pr.is_kids, false) = false;
  if v_user is null then return; end if;  -- perfil infantil não usa busca
  if not exists (select 1 from public.profile_social me where me.profile_id = p_profile_id and me.friends_enabled) then return; end if;

  v_q := btrim(coalesce(p_query, ''));
  if v_q <> '' and char_length(v_q) < 2 then return; end if;
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  with mine as (
    select case when f.requester_id = p_profile_id then f.addressee_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and p_profile_id in (f.requester_id, f.addressee_id)
  ), related as (
    select case when f.requester_id = p_profile_id then f.addressee_id else f.requester_id end as oid
    from public.friendships f
    where p_profile_id in (f.requester_id, f.addressee_id)
  ), cand as (
    select p.id as cid, p.name as cname, p.avatar as cavatar, p.color_theme as ccolor,
      (select count(*)::int from public.friendships g
        where g.status = 'accepted' and p.id in (g.requester_id, g.addressee_id)
          and (case when g.requester_id = p.id then g.addressee_id else g.requester_id end) in (select fid from mine)) as cmutual
    from public.profiles p
    join public.profile_social s on s.profile_id = p.id
    where p.id <> p_profile_id
      and p.user_id <> v_user
      and coalesce(p.is_kids, false) = false
      and s.friends_enabled and s.accept_requests and s.discoverable
      and p.id not in (select oid from related)
      and (v_q = '' or p.name ilike '%' || v_q || '%' escape '\')
  )
  select c.cid, c.cname, c.cavatar, c.ccolor, c.cmutual
  from cand c
  order by
    case when v_q <> '' and c.cname ilike v_q || '%' escape '\' then 0 else 1 end,
    c.cmutual desc,
    case when v_q = '' then md5(c.cid::text || current_date::text) else lower(c.cname) end
  limit least(greatest(coalesce(p_limit, 20), 1), 30);
end;
$$;

-- 3) Enviar pedido para alguém encontrado na busca (usa as mesmas regras do pedido por código)
create or replace function public.social_send_request_to(p_from_profile_id uuid, p_to_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  perform public.social_check_owner(p_from_profile_id);
  select s.friend_code into v_code
  from public.profile_social s
  join public.profiles p on p.id = s.profile_id
  where s.profile_id = p_to_profile_id and s.friends_enabled and s.accept_requests and coalesce(p.is_kids, false) = false;
  if v_code is null then
    raise exception 'essa pessoa não está recebendo pedidos';
  end if;
  return public.social_send_request(p_from_profile_id, v_code);
end;
$$;

grant execute on function public.social_set_discoverable(uuid, boolean) to authenticated;
grant execute on function public.social_discover(uuid, text, int) to authenticated;
grant execute on function public.social_send_request_to(uuid, uuid) to authenticated;
