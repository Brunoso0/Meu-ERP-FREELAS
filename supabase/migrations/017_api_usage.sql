-- =====================================================================
-- 017: contador de chamadas a APIs pagas, por mês.
--
-- A busca de leads usa a Places API do Google, que tem uma cota gratuita
-- mensal (1.000 chamadas no Text Search Enterprise). A função `find-leads`
-- soma aqui cada chamada feita, avisa quando o mês se aproxima da cota e
-- para de buscar quando ela acaba, para nunca gerar cobrança.
--
-- O mês segue o horário do Pacífico, como o faturamento do Google.
-- =====================================================================

create table if not exists public.api_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  api text not null check (length(api) <= 40),
  month date not null,
  calls integer not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, api, month)
);

alter table public.api_usage enable row level security;
drop policy if exists "api_usage_select_own" on public.api_usage;
create policy "api_usage_select_own" on public.api_usage
  for select using (auth.uid() = user_id);

-- só soma (de 1 em 1 a até 5 por vez); ninguém zera o contador pelo app
create or replace function public.api_usage_add(p_api text, p_calls integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if p_calls < 1 or p_calls > 5 then
    raise exception 'invalid_calls';
  end if;
  insert into public.api_usage (user_id, api, month, calls)
  values (auth.uid(), p_api, date_trunc('month', now() at time zone 'America/Los_Angeles')::date, p_calls)
  on conflict (user_id, api, month)
    do update set calls = public.api_usage.calls + excluded.calls, updated_at = now()
  returning calls into total;
  return total;
end;
$$;

revoke all on function public.api_usage_add(text, integer) from public, anon;
grant execute on function public.api_usage_add(text, integer) to authenticated;
