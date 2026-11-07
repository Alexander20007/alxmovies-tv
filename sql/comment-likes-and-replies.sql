-- Adiciona respostas (thread simples, um nível) e curtidas aos
-- comentários. Rode isso uma vez no SQL Editor do Supabase.

alter table public.comments
  add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, profile_id)
);

alter table public.comment_likes enable row level security;

-- Mesmo padrão dos comentários: curtidas são públicas pra leitura
-- (qualquer um vê quantas tem), mas só o próprio perfil cria/apaga a sua.
drop policy if exists "comment_likes_select_all" on public.comment_likes;
create policy "comment_likes_select_all"
  on public.comment_likes for select
  using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own"
  on public.comment_likes for insert
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own"
  on public.comment_likes for delete
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

comment on column public.comments.parent_comment_id is
  'Se preenchido, este comentário é uma resposta a outro (thread de um nível só).';
comment on table public.comment_likes is
  'Curtidas em comentários — uma linha por perfil que curtiu.';
