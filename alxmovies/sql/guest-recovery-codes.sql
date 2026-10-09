-- Guarda o código de recuperação atual de cada conta de convidado.
-- Só as Edge Functions (guest-generate-code / guest-redeem-code), que
-- usam a service role key, leem e escrevem aqui — a RLS fica travada
-- sem nenhuma policy, então nem o front-end nem qualquer usuário
-- autenticado normal conseguem ler essa tabela diretamente.

create table if not exists public.guest_recovery_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.guest_recovery_codes enable row level security;
revoke all on public.guest_recovery_codes from anon, authenticated;

comment on table public.guest_recovery_codes is
  'Código de recuperação (24h) que permite voltar para o mesmo perfil de convidado em outro navegador/aparelho. Só acessível via service role (Edge Functions).';
