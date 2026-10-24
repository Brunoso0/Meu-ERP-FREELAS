-- =====================================================================
-- 018: login com biometria (WebAuthn / passkey do aparelho).
--
-- Cada aparelho em que a biometria é ativada guarda aqui a chave pública
-- da credencial. No login, a função `webauthn` confere a assinatura feita
-- pela digital/rosto do aparelho com essa chave e só então abre a sessão.
-- A chave privada nunca sai do aparelho.
--
-- Os desafios (números aleatórios de uso único) vivem 5 minutos e só a
-- função (service role) lê e grava; o app não tem acesso a eles.
-- =====================================================================

create table if not exists public.webauthn_credentials (
  id text primary key check (length(id) <= 1024),
  user_id uuid not null references auth.users (id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device text check (length(device) <= 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists webauthn_credentials_user_idx on public.webauthn_credentials (user_id);

alter table public.webauthn_credentials enable row level security;

-- o app só lista e remove as próprias; cadastrar passa pela função, que confere a credencial
drop policy if exists "webauthn_credentials_select_own" on public.webauthn_credentials;
create policy "webauthn_credentials_select_own" on public.webauthn_credentials
  for select using (auth.uid() = user_id);
drop policy if exists "webauthn_credentials_delete_own" on public.webauthn_credentials;
create policy "webauthn_credentials_delete_own" on public.webauthn_credentials
  for delete using (auth.uid() = user_id);

create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null,
  kind text not null check (kind in ('register', 'login')),
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.webauthn_challenges enable row level security;
-- sem políticas: só a service role (função) enxerga
