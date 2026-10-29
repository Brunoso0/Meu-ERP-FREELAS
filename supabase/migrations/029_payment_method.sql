-- =====================================================================
-- 029: forma de pagamento do plano.
--
-- O Krono NUNCA guarda número, validade ou CVV de cartão: quem digita o cartão
-- é a página do Asaas, que o guarda e cobra todo mês. Aqui fica só a forma que
-- a pessoa escolheu e, quando é cartão, a bandeira e os 4 últimos dígitos
-- (que o Asaas informa no aviso de pagamento) para mostrar na tela.
-- Só o servidor grava essas colunas (o app não tem permissão de update nelas).
-- =====================================================================

alter table public.workspaces
  add column if not exists billing_method text check (billing_method is null or billing_method in ('PIX', 'BOLETO', 'CREDIT_CARD')),
  add column if not exists card_brand text check (card_brand is null or length(card_brand) <= 30),
  add column if not exists card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
