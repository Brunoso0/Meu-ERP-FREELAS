-- Modo administrador: métricas, financeiro, assinantes (com filtro por situação) e planos.
-- Mesmas regras da 036: só administrador da lista, com a sessão confirmada pelo código de duas etapas.

drop function if exists public.admin_workspaces(text, integer, integer);

create or replace function public.admin_workspaces(p_search text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_s text := nullif(btrim(coalesce(p_status, '')), ''); v jsonb; v_total bigint;
begin
  perform public._require_platform_admin();
  select count(*) into v_total
    from public.workspaces w
    left join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
    left join auth.users u on u.id = m.user_id
   where (v_s is null or w.subscription_status = v_s)
     and (v_q is null or w.name ilike '%' || v_q || '%' or w.email ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%');

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
    where (v_s is null or w.subscription_status = v_s)
      and (v_q is null or w.name ilike '%' || v_q || '%' or w.email ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%')
    order by w.created_at desc
    limit greatest(least(coalesce(p_limit, 50), 200), 1) offset greatest(coalesce(p_offset, 0), 0)
  ) s;
  return jsonb_build_object('total', v_total, 'rows', v);
end;
$$;

-- crescimento, ativação e perfil de quem usa
create or replace function public.admin_metrics()
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
    'signups_week', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'n', n) order by w), '[]')
                       from (select date_trunc('week', created_at)::date w, count(*) n from auth.users where created_at > now() - interval '12 weeks' group by 1) s),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'funnel', jsonb_build_object(
      'signups', (select count(*) from public.workspaces),
      'with_client', (select count(distinct workspace_id) from public.clients),
      'with_proposal', (select count(distinct workspace_id) from public.proposals),
      'paying', (select count(*) from public.workspaces where subscription_status in ('active', 'past_due'))),
    'canceled_30d', (select count(*) from public.subscription_events where event = 'SUBSCRIPTION_DELETED' and created_at > now() - interval '30 days'),
    'by_business_type', (select coalesce(jsonb_object_agg(coalesce(business_type, 'não informado'), n), '{}') from (select business_type, count(*) n from public.workspaces group by 1) s),
    'by_team_size', (select coalesce(jsonb_object_agg(coalesce(team_size, 'não informado'), n), '{}') from (select team_size, count(*) n from public.workspaces group by 1) s),
    'by_source', (select coalesce(jsonb_object_agg(coalesce(acquisition_source, 'não informado'), n), '{}') from (select acquisition_source, count(*) n from public.workspaces group by 1) s),
    'by_state', (select coalesce(jsonb_object_agg(st, n), '{}') from (select coalesce(address_state, '--') st, count(*) n from public.workspaces group by 1 order by 2 desc limit 10) s),
    'errors_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]')
                        from (select last_seen::date d, sum(count)::int n from public.client_errors where last_seen > now() - interval '14 days' group by 1) s)
  ) into v;
  return v;
end;
$$;

-- dinheiro: receita recorrente, o que entrou, atrasos e renovações
create or replace function public.admin_finance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform public._require_platform_admin();
  with paid as (
    -- um pagamento pode gerar CONFIRMED e depois RECEIVED: conta uma vez só
    select distinct on (payload -> 'payment' ->> 'id')
           payload -> 'payment' ->> 'id' as pay, (payload -> 'payment' ->> 'value')::numeric as value, created_at, workspace_id, event
      from public.subscription_events
     where event in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') and payload -> 'payment' ->> 'id' is not null
     order by payload -> 'payment' ->> 'id', created_at
  ), active as (
    select w.*, p.price_cents + w.extra_members * p.extra_member_cents as monthly_cents
      from public.workspaces w join public.plans p on p.id = w.plan_id where w.subscription_status = 'active'
  )
  select jsonb_build_object(
    'mrr_cents', (select coalesce(sum(monthly_cents), 0) from active),
    'active_count', (select count(*) from active),
    'by_plan', (select coalesce(jsonb_agg(jsonb_build_object('plan_id', plan_id, 'n', n, 'mrr_cents', m)), '[]')
                  from (select plan_id, count(*) n, sum(monthly_cents) m from active group by 1) s),
    'by_method', (select coalesce(jsonb_object_agg(coalesce(billing_method, 'não informado'), n), '{}') from (select billing_method, count(*) n from active group by 1) s),
    'revenue_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', mth, 'cents', cents) order by mth), '[]')
                           from (select to_char(date_trunc('month', created_at), 'YYYY-MM') mth, round(sum(value) * 100)::bigint cents from paid
                                  where created_at > now() - interval '12 months' group by 1) s),
    'received_30d_cents', (select coalesce(round(sum(value) * 100), 0)::bigint from paid where created_at > now() - interval '30 days'),
    'recent_payments', (select coalesce(jsonb_agg(jsonb_build_object('created_at', created_at, 'value', value, 'event', event, 'workspace', name)), '[]')
                          from (select p.created_at, p.value, p.event, w.name from paid p left join public.workspaces w on w.id = p.workspace_id order by p.created_at desc limit 15) s),
    'past_due', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'since', past_due_since, 'monthly_cents', cents)), '[]')
                   from (select w.id, w.name, w.past_due_since, p.price_cents + w.extra_members * p.extra_member_cents cents
                           from public.workspaces w join public.plans p on p.id = w.plan_id where w.subscription_status = 'past_due' order by w.past_due_since) s),
    'renewals_30d', (select jsonb_build_object('n', count(*), 'cents', coalesce(sum(monthly_cents), 0)) from active where current_period_end between now() and now() + interval '30 days')
  ) into v;
  return v;
end;
$$;

-- planos, com quem usa cada um
create or replace function public.admin_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform public._require_platform_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'price_cents', p.price_cents, 'extra_member_cents', p.extra_member_cents, 'limits', p.limits,
      'workspaces', (select count(*) from public.workspaces w where w.plan_id = p.id),
      'paying', (select count(*) from public.workspaces w where w.plan_id = p.id and w.subscription_status = 'active'),
      'trialing', (select count(*) from public.workspaces w where w.plan_id = p.id and w.subscription_status = 'trialing'),
      'courtesy', (select count(*) from public.workspaces w where w.plan_id = p.id and w.subscription_status = 'courtesy')
    ) order by p.sort), '[]') into v
  from public.plans p;
  return v;
end;
$$;

-- altera preço e limites. Vale para quem assina daqui para frente: assinaturas em andamento mantêm o valor já combinado no Asaas.
create or replace function public.admin_update_plan(p_id text, p_price_cents integer, p_extra_member_cents integer, p_limits jsonb, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  perform public._require_platform_admin();
  if p_price_cents is null or p_price_cents < 0 or p_price_cents > 1000000 then raise exception 'Preço inválido.'; end if;
  if p_extra_member_cents is null or p_extra_member_cents < 0 or p_extra_member_cents > 1000000 then raise exception 'Preço do membro extra inválido.'; end if;
  if p_limits is null or jsonb_typeof(p_limits) <> 'object' then raise exception 'Limites inválidos.'; end if;
  select jsonb_build_object('price_cents', price_cents, 'extra_member_cents', extra_member_cents, 'limits', limits) into v_before from public.plans where id = p_id;
  if v_before is null then raise exception 'Plano inexistente.'; end if;
  update public.plans set price_cents = p_price_cents, extra_member_cents = p_extra_member_cents, limits = p_limits where id = p_id;
  insert into public.admin_audit (admin_id, action, detail)
  values (auth.uid(), 'update_plan', jsonb_build_object('plan', p_id, 'before', v_before,
          'after', jsonb_build_object('price_cents', p_price_cents, 'extra_member_cents', p_extra_member_cents, 'limits', p_limits), 'note', left(p_note, 300)));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_workspaces(text, text, integer, integer)', 'admin_metrics()', 'admin_finance()', 'admin_plans()', 'admin_update_plan(text, integer, integer, jsonb, text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
