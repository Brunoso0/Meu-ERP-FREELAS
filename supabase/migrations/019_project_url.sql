-- =====================================================================
-- 019: agendamentos sem endereço fixo.
--
-- As migrações 015 e 016 agendaram o pg_cron com o endereço do projeto de
-- produção escrito no SQL. Num projeto de testes, as mensalidades e os
-- lembretes chamariam a produção. Agora o endereço fica num segredo do
-- Vault (`project_url`), gravado pelo deploy de cada ambiente com
-- set_project_url, e os dois jobs leem de lá a cada execução.
--
-- Sem o segredo, os jobs não chamam nada (em vez de chamar o lugar errado).
-- =====================================================================

create or replace function public.set_project_url(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_url !~ '^https?://[^/]+$' then
    raise exception 'Endereço inválido: use só https://<projeto>.supabase.co, sem barra no fim.';
  end if;
  select id into v_id from vault.secrets where name = 'project_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'project_url', 'Endereço do projeto, usado pelos agendamentos do pg_cron');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
end;
$$;

create or replace function public.project_function_url(p_function text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret || '/functions/v1/' || p_function
    from vault.decrypted_secrets
   where name = 'project_url';
$$;

revoke execute on function public.set_project_url(text) from public, anon, authenticated;
revoke execute on function public.project_function_url(text) from public, anon, authenticated;
grant execute on function public.set_project_url(text) to service_role;
grant execute on function public.project_function_url(text) to service_role;

-- todo dia às 9h UTC (6h em Brasília), como na migração 015
select cron.unschedule('billing-mensalidades') where exists (select 1 from cron.job where jobname = 'billing-mensalidades');
select cron.schedule(
  'billing-mensalidades',
  '0 9 * * *',
  $job$
    select net.http_post(
      url := u.url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_cron_token')
      ),
      body := '{"action":"run-recurrences"}'::jsonb
    )
    from (select public.project_function_url('billing') as url) u
    where u.url is not null;
  $job$
);

-- de hora em hora, como na migração 016
select cron.unschedule('lembretes-demandas') where exists (select 1 from cron.job where jobname = 'lembretes-demandas');
select cron.schedule(
  'lembretes-demandas',
  '0 * * * *',
  $job$
    select net.http_post(
      url := u.url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_cron_token')
      ),
      body := '{"action":"run"}'::jsonb
    )
    from (select public.project_function_url('reminders') as url) u
    where u.url is not null;
  $job$
);

notify pgrst, 'reload schema';
