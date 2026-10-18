-- =====================================================================
-- 011: cobrança por gateway (Asaas, e outros no futuro).
--
-- O perfil escolhe a forma de cobrança:
--   simple = chave Pix e QR Code fixo (como antes)
--   asaas  = cobrança no Asaas, com vencimento, multa, juros e baixa automática
--
-- A chave de API do gateway fica cifrada no Vault do Supabase. Só a Edge
-- Function `billing` (com a service role) consegue ler: o navegador manda a
-- chave uma vez, ao conectar, e nunca mais a recebe de volta.
-- =====================================================================

create extension if not exists supabase_vault with schema vault;

-- ---------- perfil: forma de cobrança e regras padrão ----------
alter table public.profiles
  add column if not exists billing_provider text not null default 'simple',
  add column if not exists billing_fine_pct numeric(5, 2) not null default 2,
  add column if not exists billing_interest_pct numeric(5, 2) not null default 1,
  add column if not exists billing_discount_pct numeric(5, 2) not null default 0,
  add column if not exists billing_discount_days integer not null default 0,
  add column if not exists billing_types text not null default 'UNDEFINED',
  add column if not exists billing_notify boolean not null default true;

alter table public.profiles drop constraint if exists profiles_billing_check;
alter table public.profiles
  add constraint profiles_billing_check
  check (
    billing_provider in ('simple', 'asaas')
    and billing_fine_pct between 0 and 10
    and billing_interest_pct between 0 and 10
    and billing_discount_pct between 0 and 50
    and billing_discount_days between 0 and 60
    and billing_types in ('UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD')
  );

-- ---------- lançamentos: a cobrança criada no gateway ----------
alter table public.financial_transactions
  add column if not exists gateway text,
  add column if not exists gateway_env text,
  add column if not exists gateway_charge_id text,
  add column if not exists gateway_status text,
  add column if not exists gateway_invoice_url text,
  add column if not exists gateway_bank_slip_url text,
  add column if not exists gateway_pix_payload text,
  add column if not exists gateway_pix_image text,
  add column if not exists gateway_net_value numeric(12, 2),
  add column if not exists gateway_synced_at timestamptz;

create unique index if not exists idx_transactions_gateway_charge
  on public.financial_transactions (gateway, gateway_charge_id) where gateway_charge_id is not null;

alter table public.financial_transactions drop constraint if exists financial_transactions_gateway_check;
alter table public.financial_transactions
  add constraint financial_transactions_gateway_check
  check (
    (gateway is null or gateway in ('asaas'))
    and (gateway_env is null or gateway_env in ('sandbox', 'production'))
    and (gateway_pix_image is null or length(gateway_pix_image) <= 60000)
  );

-- ---------- conexão com o gateway (só a Edge Function acessa) ----------
create table if not exists public.billing_integrations (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('asaas')),
  environment text not null check (environment in ('sandbox', 'production')),
  api_key_secret_id uuid not null,
  webhook_id text,
  -- hash do token que o gateway manda no webhook; o token em si não é guardado
  webhook_token_hash text,
  account_name text,
  account_email text,
  connected_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.billing_integrations enable row level security;
revoke all on public.billing_integrations from anon, authenticated;

-- clientes já cadastrados no gateway (um id por ambiente)
create table if not exists public.gateway_customers (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  provider text not null,
  environment text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, provider, environment)
);
alter table public.gateway_customers enable row level security;
revoke all on public.gateway_customers from anon, authenticated;

-- ---------- chave de API no Vault ----------
create or replace function public.billing_save_api_key(p_user uuid, p_provider text, p_environment text, p_key text, p_account_name text, p_account_email text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  select api_key_secret_id into v_secret from public.billing_integrations where user_id = p_user and provider = p_provider;
  if v_secret is null then
    v_secret := vault.create_secret(p_key, 'billing:' || p_provider || ':' || p_user, 'Chave de API do gateway de cobrança');
  else
    perform vault.update_secret(v_secret, p_key);
  end if;
  insert into public.billing_integrations (user_id, provider, environment, api_key_secret_id, account_name, account_email, connected_at)
  values (p_user, p_provider, p_environment, v_secret, p_account_name, p_account_email, now())
  on conflict (user_id, provider) do update
    set environment = excluded.environment,
        api_key_secret_id = excluded.api_key_secret_id,
        account_name = excluded.account_name,
        account_email = excluded.account_email,
        webhook_id = null,
        webhook_token_hash = null,
        connected_at = now();
end;
$$;

create or replace function public.billing_read_api_key(p_user uuid, p_provider text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select s.decrypted_secret
  from public.billing_integrations b
  join vault.decrypted_secrets s on s.id = b.api_key_secret_id
  where b.user_id = p_user and b.provider = p_provider;
$$;

create or replace function public.billing_forget(p_user uuid, p_provider text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  delete from public.billing_integrations where user_id = p_user and provider = p_provider returning api_key_secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

revoke all on function public.billing_save_api_key(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_read_api_key(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_forget(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_save_api_key(uuid, text, text, text, text, text) to service_role;
grant execute on function public.billing_read_api_key(uuid, text) to service_role;
grant execute on function public.billing_forget(uuid, text) to service_role;

-- ---------- o que o app pode saber da conexão (sem a chave) ----------
create or replace function public.get_billing_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', provider,
    'environment', environment,
    'account_name', account_name,
    'account_email', account_email,
    'webhook', webhook_id is not null,
    'connected_at', connected_at
  )), '[]'::jsonb)
  from public.billing_integrations
  where user_id = auth.uid();
$$;

revoke all on function public.get_billing_status() from public, anon;
grant execute on function public.get_billing_status() to authenticated;

notify pgrst, 'reload schema';
