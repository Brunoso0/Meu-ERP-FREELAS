-- =====================================================================
-- Orçamento com entrada + saldo (ex.: 50% antes e 50% na entrega).
-- O orçamento passa a ter a situação "parcialmente pago" e até dois
-- lançamentos no financeiro (entrada 1/2 e saldo 2/2).
-- =====================================================================

alter table public.quotes
  add column if not exists deposit_pct integer;

alter table public.quotes drop constraint if exists quotes_deposit_pct_check;
alter table public.quotes
  add constraint quotes_deposit_pct_check check (deposit_pct is null or deposit_pct between 1 and 99);

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes
  add constraint quotes_status_check check (status in ('pending', 'partial', 'paid'));

-- um lançamento por parte do orçamento (integral, ou entrada e saldo)
drop index if exists public.idx_transactions_quote;
create unique index if not exists idx_transactions_quote_part
  on public.financial_transactions (quote_id, coalesce(installment, 1))
  where quote_id is not null;
