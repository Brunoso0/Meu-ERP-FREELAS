-- =====================================================================
-- 013: regime tributário da nota fiscal e as alíquotas usadas por último.
--
-- `nfse_regime`: 'mei' (SIMEI: ISS no DAS, sem retenções), 'simples'
-- (ME/EPP no Simples Nacional: ISS na nota) ou 'normal' (Lucro Presumido ou
-- Real: ISS e retenções federais na nota).
-- `nfse_taxes`: { iss, retainIss, pis, cofins, csll, inss, ir } em %, para o
-- gerador já abrir com os valores da última nota.
-- =====================================================================

alter table public.profiles
  add column if not exists nfse_regime text not null default 'mei',
  add column if not exists nfse_taxes jsonb not null default '{}'::jsonb;

alter table public.profiles drop constraint if exists profiles_nfse_regime_check;
alter table public.profiles
  add constraint profiles_nfse_regime_check
  check (nfse_regime in ('mei', 'simples', 'normal') and jsonb_typeof(nfse_taxes) = 'object');

notify pgrst, 'reload schema';
