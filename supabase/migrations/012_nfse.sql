-- =====================================================================
-- 012: nota fiscal de serviço (NFS-e) pelo Asaas, a partir de um
-- recebimento pago (orçamento integral, entrada ou saldo, ou qualquer
-- lançamento de entrada).
--
-- O perfil guarda o catálogo de serviços que o MEI presta (um por CNAE, cada
-- um com o seu código de serviço), e cada lançamento guarda a nota emitida.
-- O PDF autorizado vai para `invoice_url`, o mesmo campo da nota anexada à mão.
-- =====================================================================

alter table public.profiles
  add column if not exists nfse_services jsonb not null default '[]'::jsonb,
  add column if not exists nfse_observations text;

alter table public.profiles drop constraint if exists profiles_nfse_check;
alter table public.profiles
  add constraint profiles_nfse_check
  check (
    jsonb_typeof(nfse_services) = 'array'
    and jsonb_array_length(nfse_services) <= 20
    and (nfse_observations is null or length(nfse_observations) <= 1000)
  );

alter table public.financial_transactions
  add column if not exists nfse_id text,
  add column if not exists nfse_status text,
  add column if not exists nfse_number text,
  add column if not exists nfse_service text,
  add column if not exists nfse_error text,
  add column if not exists nfse_synced_at timestamptz;

create unique index if not exists idx_transactions_nfse on public.financial_transactions (nfse_id) where nfse_id is not null;

alter table public.financial_transactions drop constraint if exists financial_transactions_nfse_check;
alter table public.financial_transactions
  add constraint financial_transactions_nfse_check
  check (nfse_status is null or nfse_status in ('SCHEDULED', 'SYNCHRONIZED', 'AUTHORIZED', 'PROCESSING_CANCELLATION', 'CANCELED', 'CANCELLATION_DENIED', 'ERROR'));

notify pgrst, 'reload schema';
