-- =====================================================================
-- 015: mensalidade no gerador de orçamentos.
--
-- Uma série (`quote_recurrences`) gera, todo mês, um orçamento novo que é a
-- réplica do último da série, com o vencimento do mês seguinte, e o seu
-- lançamento no financeiro (e a cobrança no Asaas, quando é a forma de
-- cobrança). Quem gera é a Edge Function `billing`, chamada uma vez por dia
-- pelo pg_cron; o app também confere ao abrir.
--
-- `quotes.due_date`: vencimento fixo do orçamento (as mensalidades usam);
-- vazio continua sendo emissão + validade.
-- =====================================================================

create table if not exists public.quote_recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  active boolean not null default true,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  lead_days smallint not null default 7 check (lead_days between 0 and 25),
  next_due_date date not null,
  ends_on date,
  last_quote_id uuid references public.quotes (id) on delete set null,
  last_run_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_recurrences_due on public.quote_recurrences (next_due_date) where active;

alter table public.quote_recurrences enable row level security;
drop policy if exists "quote_recurrences_own" on public.quote_recurrences;
create policy "quote_recurrences_own" on public.quote_recurrences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_keep_owner on public.quote_recurrences;
create trigger trg_keep_owner before update on public.quote_recurrences
  for each row execute function public.keep_owner();

alter table public.quotes
  add column if not exists due_date date,
  add column if not exists recurrence_id uuid references public.quote_recurrences (id) on delete set null;

create index if not exists idx_quotes_recurrence on public.quotes (recurrence_id) where recurrence_id is not null;

-- ---------------------------------------------------------------------
-- Agendamento diário. O token fica só no Vault: o pg_cron o lê ao chamar a
-- função, e a função confere com billing_cron_token_ok (só service_role).
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'billing_cron_token') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),'billing_cron_token', 'Token do pg_cron para a função billing (mensalidades)');
  end if;
end $$;

create or replace function public.billing_cron_token_ok(p_token text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'billing_cron_token' and decrypted_secret = p_token);
$$;

revoke execute on function public.billing_cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.billing_cron_token_ok(text) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- todo dia às 9h UTC (6h em Brasília)
select cron.unschedule('billing-mensalidades') where exists (select 1 from cron.job where jobname = 'billing-mensalidades');
select cron.schedule(
  'billing-mensalidades',
  '0 9 * * *',
  $job$
    select net.http_post(
      url := 'https://tszbidtcgsdvnnqguhut.supabase.co/functions/v1/billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_cron_token')
      ),
      body := '{"action":"run-recurrences"}'::jsonb
    );
  $job$
);

notify pgrst, 'reload schema';
