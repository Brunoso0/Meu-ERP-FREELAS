-- =====================================================================
-- Orçamentos rápidos com pagamento via Pix (Gerador de Orçamentos)
-- quote_number é uma sequência por usuário (exibida como #ORC-0001).
-- =====================================================================

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_number integer not null,
  client_id uuid references public.clients (id) on delete set null,
  customer_name text,
  title text not null,
  items jsonb not null default '[]'::jsonb,
  notes text,
  total_amount numeric(12, 2) not null default 0,
  validity_days integer not null default 7,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  unique (user_id, quote_number)
);

create or replace function public.set_quote_number()
returns trigger
language plpgsql
as $$
begin
  if new.quote_number is null then
    perform pg_advisory_xact_lock(hashtext('quote:' || new.user_id::text));
    select coalesce(max(quote_number), 0) + 1
      into new.quote_number
      from public.quotes
     where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_quote_number on public.quotes;
create trigger trg_set_quote_number
  before insert on public.quotes
  for each row execute function public.set_quote_number();

create index if not exists idx_quotes_user on public.quotes (user_id);

alter table public.quotes enable row level security;

drop policy if exists "quotes_own" on public.quotes;
create policy "quotes_own" on public.quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
