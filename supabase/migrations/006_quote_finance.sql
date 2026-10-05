-- =====================================================================
-- Orçamento ligado ao financeiro: cada orçamento tem um lançamento de
-- entrada (pendente ou pago) e uma proposta aprovada vira orçamento.
-- =====================================================================

alter table public.quotes
  add column if not exists proposal_id uuid references public.proposals (id) on delete set null;

alter table public.financial_transactions
  add column if not exists quote_id uuid references public.quotes (id) on delete set null;

-- um lançamento por orçamento, e um orçamento por proposta
create unique index if not exists idx_transactions_quote on public.financial_transactions (quote_id) where quote_id is not null;
create unique index if not exists idx_quotes_proposal on public.quotes (proposal_id) where proposal_id is not null;

-- Orçamentos que já existiam ganham o lançamento. Para os já pagos, a data
-- do pagamento não era registrada: usa o fim da validade, ou hoje se a
-- validade ainda não acabou.
insert into public.financial_transactions
  (user_id, type, category, description, amount, due_date, payment_date, status, client_id, quote_id)
select
  q.user_id,
  'income',
  'Orçamento',
  'Orçamento #ORC-' || lpad(q.quote_number::text, 4, '0') || ' — ' || q.title,
  q.total_amount,
  q.created_at::date + q.validity_days,
  case when q.status = 'paid' then least(current_date, q.created_at::date + q.validity_days) end,
  q.status,
  q.client_id,
  q.id
from public.quotes q
where q.total_amount > 0
  and not exists (select 1 from public.financial_transactions t where t.quote_id = q.id);
