-- Aparelhos confiáveis da verificação em duas etapas.
--
-- O código do app autenticador é pedido no primeiro login de cada aparelho. Quem digita o código
-- pode marcar "confiar neste aparelho": a função de borda `mfa` guarda o hash de um segredo que fica
-- só no aparelho (30 dias). Nos logins seguintes, com a senha correta e o segredo do aparelho, a
-- função marca a sessão como confiável e o banco (mfa_ok) a aceita sem pedir o código de novo.
-- Sem o segredo do aparelho, o código continua obrigatório. Tudo é fechado para o app: só a função
-- de borda lê e grava.

create table public.mfa_trusted_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz not null
);
create index mfa_trusted_devices_user_idx on public.mfa_trusted_devices (user_id, created_at desc);

-- sessões (de login) que já foram aceitas por um aparelho confiável
create table public.mfa_trusted_sessions (
  session_id uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  device_id  uuid not null references public.mfa_trusted_devices (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index mfa_trusted_sessions_user_idx on public.mfa_trusted_sessions (user_id);

alter table public.mfa_trusted_devices enable row level security;
alter table public.mfa_trusted_sessions enable row level security;
revoke all on public.mfa_trusted_devices, public.mfa_trusted_sessions from anon, authenticated;

-- mfa_ok(): sessão confirmada pelo código (aal2), conta sem verificação ativa ou sessão de um aparelho confiável
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
      or exists (
        select 1
        from public.mfa_trusted_sessions s
        where s.user_id = auth.uid()
          and s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
          and s.expires_at > now()
      );
$$;
