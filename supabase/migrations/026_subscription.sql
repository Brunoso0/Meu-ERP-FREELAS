-- =====================================================================
-- 026: assinatura (cobrança do plano pelo Asaas).
--
-- O app não escreve nada daqui: a função `subscription` (service_role) cria o
-- cliente e a assinatura no Asaas e o webhook dela confirma o pagamento. Este
-- arquivo só guarda o estado e ensina `effective_plan` a lidar com
-- cancelamento (vale até o fim do período pago) e atraso (7 dias de
-- tolerância, depois volta ao Grátis, que só impede criar acima do limite).
-- =====================================================================

alter table public.workspaces
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists pending_plan_id text references public.plans (id),
  add column if not exists past_due_since timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

create unique index if not exists idx_workspaces_asaas_subscription on public.workspaces (asaas_subscription_id) where asaas_subscription_id is not null;

-- histórico dos avisos do Asaas: auditoria e para não processar o mesmo aviso duas vezes
create table if not exists public.subscription_events (
  id text primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_subscription_events_workspace on public.subscription_events (workspace_id, created_at desc);
alter table public.subscription_events enable row level security;
-- sem política: ninguém lê ou escreve pelo app (só o service_role)
revoke all on public.subscription_events from authenticated, anon;

create or replace function public.effective_plan(p_workspace uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when w.subscription_status = 'courtesy' then w.plan_id
           when w.subscription_status = 'trialing' and w.trial_ends_at > now() then 'pro'
           when w.subscription_status = 'active' then w.plan_id
           -- atrasou: 7 dias de tolerância, depois volta ao Grátis
           when w.subscription_status = 'past_due' and (w.past_due_since is null or w.past_due_since + interval '7 days' > now()) then w.plan_id
           -- cancelou: vale até o fim do período já pago
           when w.subscription_status = 'canceled' and w.current_period_end > now() then w.plan_id
           else 'free'
         end
    from public.workspaces w
   where w.id = p_workspace;
$$;

-- a tela de plano também mostra a assinatura
create or replace function public.plan_usage(p_workspace uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workspaces%rowtype;
  v_plan text;
  v_limits jsonb;
  v_month timestamptz := public.plan_month_start();
begin
  if auth.uid() is null or not public.is_member(p_workspace) then
    raise exception 'unauthorized';
  end if;
  select * into w from public.workspaces where id = p_workspace;
  v_plan := public.effective_plan(p_workspace);
  select limits into v_limits from public.plans where id = v_plan;

  return jsonb_build_object(
    'plan', v_plan,
    'chosen_plan', w.plan_id,
    'status', w.subscription_status,
    'trial_ends_at', w.trial_ends_at,
    'current_period_end', w.current_period_end,
    'cancel_at_period_end', w.cancel_at_period_end,
    'past_due_since', w.past_due_since,
    'has_subscription', w.asaas_subscription_id is not null,
    'pending_plan', w.pending_plan_id,
    'extra_members', w.extra_members,
    'limits', v_limits || jsonb_build_object('members', (v_limits ->> 'members')::integer + w.extra_members),
    'usage', jsonb_build_object(
      'members', (select count(*) from public.workspace_members where workspace_id = p_workspace and role <> 'viewer')
               + (select count(*) from public.workspace_invites where workspace_id = p_workspace and accepted_at is null and expires_at > now() and role <> 'viewer'),
      'viewers', (select count(*) from public.workspace_members where workspace_id = p_workspace and role = 'viewer')
               + (select count(*) from public.workspace_invites where workspace_id = p_workspace and accepted_at is null and expires_at > now() and role = 'viewer'),
      'clients', (select count(*) from public.clients where workspace_id = p_workspace and status <> 'inactive'),
      'proposals_month', (select count(*) from public.proposals where workspace_id = p_workspace and created_at >= v_month),
      'quotes_month', (select count(*) from public.quotes where workspace_id = p_workspace and created_at >= v_month),
      'leads_month', coalesce((select calls from public.api_usage where workspace_id = p_workspace and api = 'leads' and month = date_trunc('month', now() at time zone 'America/Bahia')::date), 0),
      'storage_mb', coalesce((select round(sum((o.metadata ->> 'size')::numeric) / 1048576.0, 1)
                                from storage.objects o
                               where o.bucket_id = 'proofs' and (storage.foldername(o.name))[1] = p_workspace::text), 0)
    )
  );
end;
$$;

notify pgrst, 'reload schema';
