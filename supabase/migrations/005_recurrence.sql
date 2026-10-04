-- =====================================================================
-- Recorrência: lançamentos mensais (mensalidades) e contratos com
-- mensalidade. Cada parcela é um lançamento próprio no financeiro; as
-- parcelas de uma mesma série compartilham o `recurrence_id`.
-- =====================================================================

alter table public.contracts
  add column if not exists monthly_amount numeric(12, 2),
  add column if not exists term_months integer,
  add column if not exists first_due_date date;

alter table public.contracts drop constraint if exists contracts_recurrence_check;
alter table public.contracts
  add constraint contracts_recurrence_check
  check (
    (monthly_amount is null or monthly_amount > 0)
    and (term_months is null or term_months between 1 and 120)
  );

alter table public.financial_transactions
  add column if not exists recurrence_id uuid,
  add column if not exists installment integer,
  add column if not exists installments integer,
  add column if not exists contract_id uuid references public.contracts (id) on delete set null;

alter table public.financial_transactions drop constraint if exists transactions_installment_check;
alter table public.financial_transactions
  add constraint transactions_installment_check
  check (
    (installment is null and installments is null)
    or (installment between 1 and installments and installments <= 120)
  );

create index if not exists idx_transactions_recurrence on public.financial_transactions (recurrence_id);
create index if not exists idx_transactions_contract on public.financial_transactions (contract_id);
