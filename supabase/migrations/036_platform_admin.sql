-- Painel do dono do SaaS (super admin).
--
-- Quem é administrador da plataforma fica numa tabela que o app NÃO consegue ler nem gravar:
-- só o SQL Editor do Supabase (ou o service role) a altera, então ninguém se promove por dentro do app.
-- Toda função do painel confere, no servidor, que (1) a pessoa está na lista e (2) a sessão foi
-- confirmada com o código de duas etapas (aal2). Navegador alterado não passa disso.
-- Ações que mudam dados ficam registradas em admin_audit.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  workspace_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

-- 'none' (não é admin), 'needs_2fa' (é admin, falta confirmar o código nesta sessão) ou 'ok'
create or replace function public.platform_admin_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or not exists (select 1 from public.platform_admins where user_id = auth.uid()) then 'none'
    when coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then 'ok'
    else 'needs_2fa'
  end;
$$;

create or replace function public._require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.platform_admin_status() <> 'ok' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
end;
$$;

-- números gerais
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform public._require_platform_admin();
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'workspaces', (select count(*) from public.workspaces),
    'by_status', (select coalesce(jsonb_object_agg(subscription_status, n), '{}') from (select subscription_status, count(*) n from public.workspaces group by 1) s),
    'by_plan', (select coalesce(jsonb_object_agg(plan_id, n), '{}') from (select plan_id, count(*) n from public.workspaces where subscription_status in ('active', 'past_due') group by 1) s),
    'mrr_cents', (select coalesce(sum(p.price_cents + w.extra_members * p.extra_member_cents), 0)
                    from public.workspaces w join public.plans p on p.id = w.plan_id where w.subscription_status = 'active'),
    'trials_ending_3d', (select count(*) from public.workspaces where subscription_status = 'trialing' and trial_ends_at between now() and now() + interval '3 days'),
    'signups_30d', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]')
                      from (select created_at::date d, count(*) n from auth.users where created_at > now() - interval '30 days' group by 1) s),
    'sources', (select coalesce(jsonb_object_agg(coalesce(acquisition_source, 'não informado'), n), '{}') from (select acquisition_source, count(*) n from public.workspaces group by 1) s),
    'errors_24h', (select coalesce(sum(count), 0) from public.client_errors where last_seen > now() - interval '24 hours'),
    'error_kinds_24h', (select count(*) from public.client_errors where last_seen > now() - interval '24 hours'),
    'recent_payments', (select coalesce(jsonb_agg(e), '[]') from (
        select se.created_at, se.event, se.payload -> 'payment' ->> 'value' as value, w.name as workspace
          from public.subscription_events se left join public.workspaces w on w.id = se.workspace_id
         order by se.created_at desc limit 10) e)
  ) into v;
  return v;
end;
$$;

-- negócios (workspaces), com busca por nome, e-mail da empresa ou e-mail do dono
create or replace function public.admin_workspaces(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v jsonb; v_total bigint;
begin
  perform public._require_platform_admin();
  select count(*) into v_total
    from public.workspaces w
    left join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
    left join auth.users u on u.id = m.user_id
   where v_q is null or w.name ilike '%' || v_q || '%' or w.email ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%';

  select coalesce(jsonb_agg(r order by (r ->> 'created_at') desc), '[]') into v from (
    select jsonb_build_object(
      'id', w.id, 'name', w.name, 'owner_email', u.email, 'plan_id', w.plan_id, 'status', w.subscription_status,
      'created_at', w.created_at, 'trial_ends_at', w.trial_ends_at, 'current_period_end', w.current_period_end,
      'billing_method', w.billing_method, 'past_due_since', w.past_due_since, 'business_type', w.business_type,
      'city', w.address_city, 'state', w.address_state, 'source', w.acquisition_source, 'phone', w.phone,
      'members', (select count(*) from public.workspace_members x where x.workspace_id = w.id),
      'clients', (select count(*) from public.clients c where c.workspace_id = w.id),
      'last_login', u.last_sign_in_at
    ) as r
    from public.workspaces w
    left join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
    left join auth.users u on u.id = m.user_id
    where v_q is null or w.name ilike '%' || v_q || '%' or w.email ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%'
    order by w.created_at desc
    limit greatest(least(coalesce(p_limit, 50), 200), 1) offset greatest(coalesce(p_offset, 0), 0)
  ) s;
  return jsonb_build_object('total', v_total, 'rows', v);
end;
$$;

-- erros registrados pelo app
create or replace function public.admin_errors(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform public._require_platform_admin();
  select coalesce(jsonb_agg(e order by (e ->> 'last_seen') desc), '[]') into v from (
    select jsonb_build_object(
      'id', id, 'kind', kind, 'message', message, 'path', path, 'count', count, 'people', cardinality(user_ids),
      'app_version', app_version, 'first_seen', first_seen, 'last_seen', last_seen, 'workspace_id', workspace_id,
      'context', context, 'breadcrumbs', breadcrumbs, 'stack', stack, 'user_agent', user_agent
    ) as e
    from public.client_errors order by last_seen desc limit greatest(least(coalesce(p_limit, 50), 200), 1)
  ) s;
  return v;
end;
$$;

create or replace function public.admin_delete_error(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_platform_admin();
  delete from public.client_errors where id = p_id;
  insert into public.admin_audit (admin_id, action, detail) values (auth.uid(), 'delete_error', jsonb_build_object('error_id', p_id));
end;
$$;

-- cortesia: libera um plano sem cobrança (parceiros, testes, suporte)
create or replace function public.admin_grant_courtesy(p_workspace uuid, p_plan text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_platform_admin();
  if not exists (select 1 from public.plans where id = p_plan) then raise exception 'Plano inexistente.'; end if;
  update public.workspaces set plan_id = p_plan, subscription_status = 'courtesy', past_due_since = null where id = p_workspace;
  if not found then raise exception 'Negócio não encontrado.'; end if;
  insert into public.admin_audit (admin_id, action, workspace_id, detail)
  values (auth.uid(), 'grant_courtesy', p_workspace, jsonb_build_object('plan', p_plan, 'note', left(p_note, 300)));
end;
$$;

-- prolonga o teste grátis
create or replace function public.admin_extend_trial(p_workspace uuid, p_days integer, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_platform_admin();
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'Informe de 1 a 90 dias.'; end if;
  update public.workspaces
     set subscription_status = 'trialing', plan_id = 'pro',
         trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
   where id = p_workspace and subscription_status in ('trialing', 'none', 'canceled', 'courtesy');
  if not found then raise exception 'Este negócio tem assinatura ativa ou não existe: não dá para prolongar o teste.'; end if;
  insert into public.admin_audit (admin_id, action, workspace_id, detail)
  values (auth.uid(), 'extend_trial', p_workspace, jsonb_build_object('days', p_days, 'note', left(p_note, 300)));
end;
$$;

create or replace function public.admin_audit_list(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform public._require_platform_admin();
  select coalesce(jsonb_agg(a order by (a ->> 'created_at') desc), '[]') into v from (
    select jsonb_build_object('created_at', au.created_at, 'action', au.action, 'admin', u.email, 'workspace', w.name, 'detail', au.detail) as a
      from public.admin_audit au
      left join auth.users u on u.id = au.admin_id
      left join public.workspaces w on w.id = au.workspace_id
     order by au.created_at desc limit greatest(least(coalesce(p_limit, 50), 200), 1)
  ) s;
  return v;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'platform_admin_status()', '_require_platform_admin()', 'admin_overview()', 'admin_workspaces(text, integer, integer)',
    'admin_errors(integer)', 'admin_delete_error(bigint)', 'admin_grant_courtesy(uuid, text, text)',
    'admin_extend_trial(uuid, integer, text)', 'admin_audit_list(integer)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
