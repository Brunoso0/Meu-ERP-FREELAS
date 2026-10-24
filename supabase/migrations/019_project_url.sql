-- ---------------------------------------------------------------------
-- 019: endereço do projeto no Vault
-- Os agendamentos do pg_cron (015 e 016) tinham o endereço do projeto de
-- produção escrito no SQL. Aqui ele passa a vir do segredo `project_url` do
-- Vault, gravado por ambiente pelo deploy (ver README, "Ambientes").
-- Sem o segredo, o job apenas falha ao chamar a função (nada é enviado).
-- ---------------------------------------------------------------------

select cron.unschedule('billing-mensalidades') where exists (select 1 from cron.job where jobname = 'billing-mensalidades');
select cron.schedule(
  'billing-mensalidades',
  '0 9 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_cron_token')
      ),
      body := '{"action":"run-recurrences"}'::jsonb
    );
  $job$
);

select cron.unschedule('lembretes-demandas') where exists (select 1 from cron.job where jobname = 'lembretes-demandas');
select cron.schedule(
  'lembretes-demandas',
  '0 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_cron_token')
      ),
      body := '{"action":"run"}'::jsonb
    );
  $job$
);
