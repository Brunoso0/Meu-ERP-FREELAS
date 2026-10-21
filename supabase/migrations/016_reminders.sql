-- =====================================================================
-- 016: lembrete diário das demandas, por e-mail e por notificação no
-- celular (PWA).
--
-- A Edge Function `reminders` é chamada de hora em hora pelo pg_cron e, no
-- horário escolhido no perfil (Brasília), manda as demandas do dia e as
-- atrasadas: por e-mail (Resend, chave nos segredos da função) e por Web
-- Push para cada aparelho inscrito.
--
-- As chaves VAPID do Web Push são geradas pela própria função na primeira
-- vez e ficam só no Vault (leitura e gravação só pelo service_role).
-- =====================================================================

alter table public.profiles
  add column if not exists reminder_email boolean not null default false,
  add column if not exists reminder_push boolean not null default true,
  add column if not exists reminder_hour smallint not null default 7,
  add column if not exists reminder_last_sent date;

alter table public.profiles drop constraint if exists profiles_reminder_check;
alter table public.profiles
  add constraint profiles_reminder_check check (reminder_hour between 0 and 23);

-- um registro por aparelho (navegador) que aceitou as notificações
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_keep_owner on public.push_subscriptions;
create trigger trg_keep_owner before update on public.push_subscriptions
  for each row execute function public.keep_owner();

-- chaves VAPID no Vault (JSON com as chaves pública e privada em JWK)
create or replace function public.reminders_vapid_read()
returns text
language sql
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'reminders_vapid_keys' limit 1;
$$;

create or replace function public.reminders_vapid_save(p_keys text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from vault.secrets where name = 'reminders_vapid_keys') then
    perform vault.create_secret(p_keys, 'reminders_vapid_keys', 'Chaves VAPID do Web Push (lembretes)');
  end if;
end;
$$;

revoke execute on function public.reminders_vapid_read() from public, anon, authenticated;
revoke execute on function public.reminders_vapid_save(text) from public, anon, authenticated;
grant execute on function public.reminders_vapid_read() to service_role;
grant execute on function public.reminders_vapid_save(text) to service_role;

-- de hora em hora (a função decide quem recebe naquela hora); usa o mesmo
-- token do Vault do agendamento das mensalidades (migração 015)
select cron.unschedule('lembretes-demandas') where exists (select 1 from cron.job where jobname = 'lembretes-demandas');
select cron.schedule(
  'lembretes-demandas',
  '0 * * * *',
  $job$
    select net.http_post(
      url := 'https://tszbidtcgsdvnnqguhut.supabase.co/functions/v1/reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_cron_token')
      ),
      body := '{"action":"run"}'::jsonb
    );
  $job$
);

notify pgrst, 'reload schema';
