-- =====================================================================
-- Nota fiscal do recebimento: o PDF da nota emitida fica guardado junto
-- do lançamento, no mesmo espaço privado dos comprovantes (bucket proofs).
-- =====================================================================

alter table public.financial_transactions
  add column if not exists invoice_url text;
