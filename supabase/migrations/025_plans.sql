-- =====================================================================
-- 025: planos, trial e limites.
--
-- Três planos (Grátis, Essencial, Profissional) com limites em JSON. O plano
-- e a assinatura ficam no workspace. Quem se cadastra ganha um workspace no
-- plano Profissional por 14 dias (trial); passado o prazo sem assinatura, ele
-- cai no Grátis. Cair no Grátis nunca apaga nada: só impede criar acima do
-- limite (a pessoa continua vendo e exportando tudo).
--
-- Chave ausente em `limits` = sem limite. Os limites valem por workspace.
--
-- A fonte da verdade é o banco: os gatilhos recusam o que passa do limite, então
-- nem um navegador alterado passa. As Edge Functions e a interface só
-- espelham essas regras para avisar melhor.
-- =====================================================================

create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  extra_member_cents integer not null default 0 check (extra_member_cents >= 0),
  sort integer not null default 0,
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object')
);

insert into public.plans (id, name, price_cents, extra_member_cents, sort, limits) values
  ('free', 'Grátis', 0, 0, 1,
    '{"members":1,"viewers":0,"clients":5,"proposals_month":5,"quotes_month":5,"leads_month":0,"storage_mb":100,
      "signature":false,"billing":false,"nfse":false,"reminders":false}'),
  ('essential', 'Essencial', 2900, 0, 2,
    '{"members":2,"viewers":1,"leads_month":20,"storage_mb":1024,
      "signature":true,"billing":true,"nfse":false,"reminders":true}'),
  ('pro', 'Profissional', 5900, 1000, 3,
    '{"members":5,"viewers":1,"leads_month":100,"storage_mb":5120,
      "signature":true,"billing":true,"nfse":true,"reminders":true}')
on conflict (id) do update
  set name = excluded.name, price_cents = excluded.price_cents, extra_member_cents = excluded.extra_member_cents,
      sort = excluded.sort, limits = excluded.limits;

alter table public.plans enable row level security;
drop policy if exists "plans_select" on public.plans;
create policy "plans_select" on public.plans for select to authenticated using (true);
revoke insert, update, delete, truncate, trigger, references on public.plans from authenticated, anon;

-- ---------------------------------------------------------------------
-- Assinatura no workspace
-- ---------------------------------------------------------------------
alter table public.workspaces
  add column if not exists plan_id text not null default 'free' references public.plans (id),
  add column if not exists subscription_status text not null default 'none'
    check (subscription_status in ('none', 'trialing', 'active', 'past_due', 'canceled', 'courtesy')),
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists extra_members integer not null default 0 check (extra_members between 0 and 100);

-- quem já usa o sistema fica no Profissional, como cortesia (sem prazo)
update public.workspaces
   set plan_id = 'pro', subscription_status = 'courtesy'
 where subscription_status = 'none' and plan_id = 'free';

-- o app não altera plano nem assinatura: só o servidor (billing, painel admin)
-- (as colunas novas não entram no grant de update de 020/023)

-- ---------------------------------------------------------------------
-- Plano em vigor e limites
-- ---------------------------------------------------------------------
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
           when w.subscription_status in ('active', 'past_due') then w.plan_id
           else 'free'
         end
    from public.workspaces w
   where w.id = p_workspace;
$$;

-- limite numérico do plano em vigor (null = sem limite). Membros somam os extras comprados.
create or replace function public.plan_limit(p_workspace uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p_key = 'members' then (p.limits ->> 'members')::integer + w.extra_members
           else (p.limits ->> p_key)::integer
         end
    from public.workspaces w
    join public.plans p on p.id = public.effective_plan(w.id)
   where w.id = p_workspace;
$$;

create or replace function public.plan_feature(p_workspace uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((p.limits ->> p_key)::boolean, false)
    from public.workspaces w
    join public.plans p on p.id = public.effective_plan(w.id)
   where w.id = p_workspace;
$$;

-- o mês dos limites mensais: o de Brasília
create or replace function public.plan_month_start()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select date_trunc('month', now() at time zone 'America/Bahia') at time zone 'America/Bahia';
$$;

-- ---------------------------------------------------------------------
-- Uso atual: alimenta a tela de plano
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Cota mensal de buscas de leads (chamada pela Edge Function com o JWT de quem busca)
-- ---------------------------------------------------------------------
create or replace function public.consume_plan_quota(p_workspace uuid, p_api text, p_calls integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_month date := date_trunc('month', now() at time zone 'America/Bahia')::date;
  v_used integer;
begin
  if auth.uid() is null or not public.is_member(p_workspace, 'member') then
    raise exception 'unauthorized';
  end if;
  if p_api <> 'leads' or p_calls < 1 or p_calls > 5 then
    raise exception 'invalid_request';
  end if;
  v_limit := public.plan_limit(p_workspace, 'leads_month');
  insert into public.api_usage (workspace_id, api, month, calls)
  values (p_workspace, p_api, v_month, 0)
  on conflict (workspace_id, api, month) do nothing;
  -- trava a linha para duas buscas ao mesmo tempo não furarem o limite
  select calls into v_used from public.api_usage where workspace_id = p_workspace and api = p_api and month = v_month for update;
  if v_limit is not null and v_used + p_calls > v_limit then
    return jsonb_build_object('ok', false, 'used', v_used, 'limit', v_limit);
  end if;
  update public.api_usage set calls = calls + p_calls, updated_at = now()
   where workspace_id = p_workspace and api = p_api and month = v_month;
  return jsonb_build_object('ok', true, 'used', v_used + p_calls, 'limit', v_limit);
end;
$$;

-- ---------------------------------------------------------------------
-- Gatilhos: recusam o que passa do limite
-- ---------------------------------------------------------------------
create or replace function public.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
  v_month timestamptz := public.plan_month_start();
  v_label text;
begin
  if tg_table_name = 'clients' then
    v_limit := public.plan_limit(new.workspace_id, 'clients');
    if v_limit is not null then
      select count(*) into v_count from public.clients where workspace_id = new.workspace_id and status <> 'inactive';
      v_label := 'clientes ativos';
    end if;
  elsif tg_table_name = 'proposals' then
    v_limit := public.plan_limit(new.workspace_id, 'proposals_month');
    if v_limit is not null then
      select count(*) into v_count from public.proposals where workspace_id = new.workspace_id and created_at >= v_month;
      v_label := 'propostas neste mês';
    end if;
  elsif tg_table_name = 'quotes' then
    v_limit := public.plan_limit(new.workspace_id, 'quotes_month');
    if v_limit is not null then
      select count(*) into v_count from public.quotes where workspace_id = new.workspace_id and created_at >= v_month;
      v_label := 'orçamentos neste mês';
    end if;
  end if;

  if v_limit is not null and v_count >= v_limit then
    raise exception 'Seu plano permite % (%). Faça upgrade em Minha empresa → Plano para continuar.', v_label, v_limit
      using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_limit_clients on public.clients;
create trigger plan_limit_clients before insert on public.clients for each row execute function public.enforce_plan_limit();
drop trigger if exists plan_limit_proposals on public.proposals;
create trigger plan_limit_proposals before insert on public.proposals for each row execute function public.enforce_plan_limit();
drop trigger if exists plan_limit_quotes on public.quotes;
create trigger plan_limit_quotes before insert on public.quotes for each row execute function public.enforce_plan_limit();

-- membros e convites: o dono não conta (já está), leitura tem limite próprio
create or replace function public.enforce_plan_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_limit integer;
  v_count integer;
begin
  if tg_table_name = 'workspace_members' and new.role = 'owner' then
    return new;
  end if;
  v_key := case when new.role = 'viewer' then 'viewers' else 'members' end;
  v_limit := public.plan_limit(new.workspace_id, v_key);
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count from public.workspace_members m
   where m.workspace_id = new.workspace_id and ((new.role = 'viewer') = (m.role = 'viewer'));
  -- ao criar um convite, os outros convites abertos já ocupam vaga; ao aceitar, o próprio convite não conta de novo
  if tg_table_name = 'workspace_invites' then
    select v_count + count(*) into v_count from public.workspace_invites i
     where i.workspace_id = new.workspace_id and i.accepted_at is null and i.expires_at > now()
       and ((new.role = 'viewer') = (i.role = 'viewer'));
  end if;

  if v_count >= v_limit then
    raise exception '%', format(case when v_key = 'viewers'
      then 'Seu plano permite %s convidado(s) de leitura (contador). Faça upgrade em Minha empresa → Plano.'
      else 'Seu plano permite %s pessoa(s) no workspace. Faça upgrade em Minha empresa → Plano.' end, v_limit)
      using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_seats_members on public.workspace_members;
create trigger plan_seats_members before insert on public.workspace_members for each row execute function public.enforce_plan_seats();
drop trigger if exists plan_seats_invites on public.workspace_invites;
create trigger plan_seats_invites before insert on public.workspace_invites for each row execute function public.enforce_plan_seats();

-- assinatura online (link de proposta e contrato) é do plano Essencial para cima
create or replace function public.enforce_plan_signature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.share_token is not null and new.share_token is distinct from old.share_token
     and not coalesce(public.plan_feature(new.workspace_id, 'signature'), false) then
    raise exception 'A assinatura online é do plano Essencial ou superior. Faça upgrade em Minha empresa → Plano.'
      using errcode = 'P0001', hint = 'plan_feature';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_signature_proposals on public.proposals;
create trigger plan_signature_proposals before update on public.proposals for each row execute function public.enforce_plan_signature();
drop trigger if exists plan_signature_contracts on public.contracts;
create trigger plan_signature_contracts before update on public.contracts for each row execute function public.enforce_plan_signature();

-- ---------------------------------------------------------------------
-- Cadastro novo: o primeiro workspace da pessoa começa em trial de 14 dias
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_ws uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_name)
  on conflict (id) do nothing;

  insert into public.workspaces (name, created_by, email, plan_id, subscription_status, trial_ends_at)
  values (coalesce(nullif(btrim(v_name), ''), 'Meu workspace'), new.id, new.email, 'pro', 'trialing', now() + interval '14 days')
  returning id into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, new.id, 'owner');
  return new;
end;
$$;

revoke all on function public.effective_plan(uuid), public.plan_limit(uuid, text), public.plan_feature(uuid, text), public.plan_month_start() from public, anon;
revoke all on function public.plan_usage(uuid), public.consume_plan_quota(uuid, text, integer) from public, anon;
grant execute on function public.effective_plan(uuid), public.plan_limit(uuid, text), public.plan_feature(uuid, text), public.plan_month_start() to authenticated, service_role;
grant execute on function public.plan_usage(uuid), public.consume_plan_quota(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
