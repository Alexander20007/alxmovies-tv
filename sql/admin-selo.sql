-- ============================================================================
-- ALXmovies — SELO DE ADMIN VERIFICADO + NOMES RESERVADOS
-- Rode DEPOIS de admins.sql. Pode rodar de novo sem problema.
--
--  • Quem é admin (app_staff) ou dono (app_admins) aparece como "Admin <primeiro nome> ✔" para todo mundo.
--  • Quem NÃO é admin não pode ter "admin", "moderador", "oficial", "suporte" etc. no nome, nem usar ✔ ✓ ✅ ☑.
--    A regra é do BANCO: vale no app, no site e em qualquer tentativa de burlar.
--  • Avisos publicados por um admin mostram o nome dele para todos.
-- ============================================================================

-- 1) Funções de apoio -------------------------------------------------------
create or replace function public._is_staffer(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_staff  where user_id = p_uid)
      or exists (select 1 from public.app_admins where user_id = p_uid);
$$;
revoke all on function public._is_staffer(uuid) from public, anon, authenticated;

-- tira acento, maiúscula, símbolos e trocas tipo 4dm1n / @dmin antes de comparar
create or replace function public._norm_name(t text)
returns text language sql immutable as $$
  select regexp_replace(
    translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ0134578@$l', 'aaaaaeeeeiiiiooooouuuucnoieastbasi'),
    '[^a-z0-9]', '', 'g');
$$;

create or replace function public.is_reserved_name(t text)
returns boolean language sql immutable as $$
  -- (o l vira i na normalização, por isso "aixmovie" e "oficiai"); letras gregas/cirílicas parecem latinas e são bloqueadas
  select public._norm_name(t) ~ '(admin|moderador|moderator|aixmovie|oficiai|suporte|verificad)'
      or coalesce(t, '') ~ '[✔✓✅☑🗸]'
      or coalesce(t, '') ~ '[\u0370-\u03FF\u0400-\u04FF]';
$$;
grant execute on function public.is_reserved_name(text) to anon, authenticated;

-- 2) Limpeza: quem não é admin e já tem nome reservado ganha um nome neutro -----
update public.profiles p
   set name = 'Usuário ' || substr(p.id::text, 1, 4)
 where public.is_reserved_name(p.name) and not public._is_staffer(p.user_id);

-- 3) Trava no banco: só admin pode usar nome reservado ---------------------------
create or replace function public._guard_name()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text := to_jsonb(new) ->> TG_ARGV[0]; uid uuid := (to_jsonb(new) ->> TG_ARGV[1])::uuid;
begin
  if public.is_reserved_name(nm) and not public._is_staffer(uid) then
    raise exception 'Esse nome é reservado para admins verificados. Escolha outro nome.' using errcode = '23514';
  end if;
  return new;
end $$;

do $$ begin
  drop trigger if exists guard_profile_name on public.profiles;
  create trigger guard_profile_name before insert or update of name on public.profiles
    for each row execute function public._guard_name('name', 'user_id');
exception when undefined_table then null; end $$;

do $$ begin
  drop trigger if exists guard_room_member_name on public.watch_room_members;
  create trigger guard_room_member_name before insert or update of display_name on public.watch_room_members
    for each row execute function public._guard_name('display_name', 'user_id');
  drop trigger if exists guard_room_message_name on public.watch_room_messages;
  create trigger guard_room_message_name before insert on public.watch_room_messages
    for each row execute function public._guard_name('display_name', 'user_id');
  drop trigger if exists guard_room_host_name on public.watch_rooms;
  create trigger guard_room_host_name before insert or update of host_name on public.watch_rooms
    for each row execute function public._guard_name('host_name', 'host_user_id');
exception when undefined_table then null; end $$;

-- admin removido: se o nome dos perfis dele era reservado, vira nome neutro
create or replace function public._staff_revoked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set name = 'Usuário ' || substr(id::text, 1, 4)
   where user_id = old.user_id and public.is_reserved_name(name) and not public._is_staffer(old.user_id);
  return old;
end $$;
drop trigger if exists staff_revoked on public.app_staff;
create trigger staff_revoked after delete on public.app_staff for each row execute function public._staff_revoked();

-- 4) Lista pública de quem tem o selo (o app usa para mostrar o ✔ em comentários, mensagens e salas) ------
create or replace function public.staff_directory()
returns json language sql stable security definer set search_path = public as $$
  with s as (select user_id from public.app_staff union select user_id from public.app_admins)
  select json_build_object(
    'users',    coalesce((select json_agg(user_id) from s), '[]'::json),
    'profiles', coalesce((select json_agg(p.id) from public.profiles p join s on s.user_id = p.user_id where not coalesce(p.is_kids, false)), '[]'::json)
  );
$$;
grant execute on function public.staff_directory() to anon, authenticated;

-- 5) Avisos mostram quem enviou ------------------------------------------------
alter table public.announcements add column if not exists author_id uuid;
alter table public.announcements add column if not exists author_label text;

-- "Admin João": primeiro nome do perfil principal da conta
create or replace function public._staff_label(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select trim('Admin ' || coalesce((
    select split_part(regexp_replace(trim(p.name), '^(admin|administrador)\s+', '', 'i'), ' ', 1)
      from public.profiles p
     where p.user_id = p_uid and not coalesce(p.is_kids, false)
     order by p.is_admin desc nulls last, p.created_at limit 1), ''));
$$;
revoke all on function public._staff_label(uuid) from public, anon, authenticated;

create or replace function public.send_announcement(p_title text, p_body text, p_url text default null, p_days int default 30, p_push boolean default true)
returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if not public.can_publish_announcements() then raise exception 'sem permissão'; end if;
  insert into public.announcements (title, body, url, push, expires_at, created_by, author_id, author_label)
  values (trim(p_title), trim(p_body), nullif(trim(coalesce(p_url, '')), ''), coalesce(p_push, true),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 90))), auth.uid(), auth.uid(), public._staff_label(auth.uid()))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.review_proposal(p_id bigint, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare pr public.announcement_proposals;
begin
  if not public.is_app_admin() then raise exception 'sem permissão'; end if;
  select * into pr from public.announcement_proposals where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Sugestão não encontrada.'; end if;
  if p_approve then
    insert into public.announcements (title, body, url, push, created_by, author_id, author_label)
    values (pr.title, pr.body, pr.url, true, pr.author, pr.author, public._staff_label(pr.author));
  end if;
  update public.announcement_proposals set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now() where id = p_id;
end $$;
