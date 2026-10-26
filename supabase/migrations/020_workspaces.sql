-- =====================================================================
-- 020: workspaces (multiempresa).
--
-- Cada conta passa a ser um workspace: os dados pertencem ao workspace e as
-- pessoas entram nele como membros, com um papel:
--
--   owner   tudo, inclusive plano, cobrança, excluir e transferir a posse
--   admin   tudo menos plano e exclusão do workspace
--   member  clientes, propostas, projetos, demandas, agenda e financeiro
--   viewer  só leitura (o contador)
--
-- user_id continua em todas as tabelas e passa a significar "quem criou".
-- A regra de acesso deixa de ser auth.uid() = user_id e vira "sou membro do
-- workspace" (is_member).
--
-- Quem já existe ganha um workspace com o MESMO id do seu usuário. Isso
-- mantém no lugar tudo o que já está apontando para esse id (as pastas do
-- Storage, os segredos do Vault) e ninguém perde nada. Workspaces novos
-- usam um id aleatório.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Papéis e funções de acesso
-- ---------------------------------------------------------------------
create or replace function public.role_rank(p_role text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'member' then 2 when 'viewer' then 1 else 0 end;
$$;

-- ---------------------------------------------------------------------
-- workspaces
-- Os dados da empresa saem do perfil: profiles passa a guardar só o que é
-- pessoal (nome, foto, lembretes). As colunas antigas de profiles ficam até
-- o app parar de usá-las e saem numa migração própria.
-- ---------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  company_name text,
  document text,
  email text,
  phone text,
  pix_key text check (pix_key is null or length(pix_key) <= 140),
  pix_qr_image text check (pix_qr_image is null or (pix_qr_image like 'data:image/%' and length(pix_qr_image) < 400000)),
  signature_image text check (signature_image is null or (signature_image like 'data:image/png;base64,%' and length(signature_image) <= 200000)),

  billing_provider text not null default 'simple' check (billing_provider in ('simple', 'asaas')),
  billing_fine_pct numeric(5, 2) not null default 2 check (billing_fine_pct between 0 and 10),
  billing_interest_pct numeric(5, 2) not null default 1 check (billing_interest_pct between 0 and 10),
  billing_discount_pct numeric(5, 2) not null default 0 check (billing_discount_pct between 0 and 50),
  billing_discount_days integer not null default 0 check (billing_discount_days between 0 and 60),
  billing_types text not null default 'UNDEFINED' check (billing_types in ('UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD')),
  billing_notify boolean not null default true,

  nfse_services jsonb not null default '[]'::jsonb check (jsonb_typeof(nfse_services) = 'array' and jsonb_array_length(nfse_services) <= 20),
  nfse_observations text check (nfse_observations is null or length(nfse_observations) <= 1000),
  nfse_regime text not null default 'mei' check (nfse_regime in ('mei', 'simples', 'normal')),
  nfse_taxes jsonb not null default '{}'::jsonb check (jsonb_typeof(nfse_taxes) = 'object')
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists idx_workspace_members_user on public.workspace_members (user_id);
-- um dono por workspace
create unique index if not exists idx_workspace_one_owner on public.workspace_members (workspace_id) where role = 'owner';

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (length(email) <= 254),
  role text not null check (role in ('admin', 'member', 'viewer')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_workspace_invites_workspace on public.workspace_invites (workspace_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

-- ---------------------------------------------------------------------
-- is_member: o centro das regras de acesso. SECURITY DEFINER para ler
-- workspace_members sem passar pelo próprio RLS dela.
-- ---------------------------------------------------------------------
create or replace function public.is_member(p_workspace uuid, p_min_role text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.workspace_id = p_workspace
       and m.user_id = auth.uid()
       and public.role_rank(m.role) >= public.role_rank(p_min_role)
  );
$$;

-- o workspace em que a pessoa trabalha quando o app não diz qual: o que ela
-- é dona, senão o mais antigo
create or replace function public.default_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.workspace_id
    from public.workspace_members m
   where m.user_id = auth.uid()
   order by (m.role = 'owner') desc, m.created_at, m.workspace_id
   limit 1;
$$;

revoke all on function public.role_rank(text) from public, anon;
revoke all on function public.is_member(uuid, text) from public, anon;
revoke all on function public.default_workspace_id() from public, anon;
grant execute on function public.role_rank(text) to authenticated, service_role;
grant execute on function public.is_member(uuid, text) to authenticated, service_role;
grant execute on function public.default_workspace_id() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Políticas das tabelas novas. Membros e convites só mudam por funções
-- próprias (convidar, aceitar, remover, sair), nunca direto pela API.
-- ---------------------------------------------------------------------
drop policy if exists "workspaces_select" on public.workspaces;
create policy "workspaces_select" on public.workspaces
  for select using (public.is_member(id));

-- os dados da empresa e a configuração de cobrança e nota são do admin para cima
drop policy if exists "workspaces_update" on public.workspaces;
create policy "workspaces_update" on public.workspaces
  for update using (public.is_member(id, 'admin')) with check (public.is_member(id, 'admin'));

drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select" on public.workspace_members
  for select using (public.is_member(workspace_id));

drop policy if exists "workspace_invites_select" on public.workspace_invites;
create policy "workspace_invites_select" on public.workspace_invites
  for select using (public.is_member(workspace_id, 'admin'));

revoke insert, delete, truncate, trigger, references on public.workspaces from authenticated;
revoke insert, update, delete, truncate, trigger, references on public.workspace_members from authenticated;
revoke insert, update, delete, truncate, trigger, references on public.workspace_invites from authenticated;
-- o convite guarda o token: quem não é admin não precisa enxergar a coluna
revoke select on public.workspace_invites from authenticated;
grant select (id, workspace_id, email, role, invited_by, expires_at, accepted_at, created_at) on public.workspace_invites to authenticated;
-- o app só edita os dados da empresa; nome do dono, criação e id não mudam
revoke update on public.workspaces from authenticated;
grant update (name, company_name, document, email, phone, pix_key, pix_qr_image, signature_image,
              billing_provider, billing_fine_pct, billing_interest_pct, billing_discount_pct, billing_discount_days,
              billing_types, billing_notify, nfse_services, nfse_observations, nfse_regime, nfse_taxes)
  on public.workspaces to authenticated;

-- ---------------------------------------------------------------------
-- Um workspace para cada usuário que já existe (mesmo id do usuário)
-- ---------------------------------------------------------------------
insert into public.workspaces (
  id, name, created_by, created_at, company_name, document, email, phone, pix_key, pix_qr_image, signature_image,
  billing_provider, billing_fine_pct, billing_interest_pct, billing_discount_pct, billing_discount_days, billing_types, billing_notify,
  nfse_services, nfse_observations, nfse_regime, nfse_taxes
)
select p.id,
       coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), 'Meu workspace'),
       p.id, p.created_at, p.company_name, p.document, p.email, p.phone, p.pix_key, p.pix_qr_image, p.signature_image,
       p.billing_provider, p.billing_fine_pct, p.billing_interest_pct, p.billing_discount_pct, p.billing_discount_days, p.billing_types, p.billing_notify,
       p.nfse_services, p.nfse_observations, p.nfse_regime, p.nfse_taxes
  from public.profiles p
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
select p.id, p.id, 'owner' from public.profiles p
on conflict do nothing;

-- quem se cadastrar daqui para frente já ganha o seu workspace
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  v_ws uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_name)
  on conflict (id) do nothing;

  insert into public.workspaces (name, created_by, email)
  values (coalesce(nullif(btrim(v_name), ''), 'Meu workspace'), new.id, new.email)
  returning id into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, new.id, 'owner');
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- workspace_id nas tabelas de dados
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'freelancers', 'proposals', 'projects', 'tasks', 'calendar_events',
    'financial_transactions', 'contracts', 'goals', 'quotes', 'quote_recurrences'
  ]
  loop
    execute format('alter table public.%I add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade', t);
    -- as linhas de hoje pertencem ao workspace de quem as criou
    execute format('update public.%I set workspace_id = user_id where workspace_id is null', t);
    execute format('alter table public.%I alter column workspace_id set default public.default_workspace_id()', t);
    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('create index if not exists idx_%s_workspace on public.%I (workspace_id)', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: de "é minha linha" para "sou membro do workspace"
--   leitura  : qualquer papel (inclui o contador)
--   gravação : membro para cima
--   exclusão : membro para cima; lançamentos financeiros e contratos, só admin
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  del_role text;
begin
  foreach t in array array[
    'clients', 'freelancers', 'proposals', 'projects', 'tasks', 'calendar_events',
    'financial_transactions', 'contracts', 'goals', 'quotes', 'quote_recurrences'
  ]
  loop
    del_role := case when t in ('financial_transactions', 'contracts') then 'admin' else 'member' end;

    execute format('drop policy if exists "%s_own" on public.%I', t, t);
    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);

    execute format('create policy "%s_select" on public.%I for select using (public.is_member(workspace_id))', t, t);
    execute format('create policy "%s_insert" on public.%I for insert with check (public.is_member(workspace_id, ''member'') and user_id = auth.uid())', t, t);
    execute format('create policy "%s_update" on public.%I for update using (public.is_member(workspace_id, ''member'')) with check (public.is_member(workspace_id, ''member''))', t, t);
    execute format('create policy "%s_delete" on public.%I for delete using (public.is_member(workspace_id, %L))', t, t, del_role);
  end loop;
end;
$$;

-- o workspace de uma linha nunca muda depois de criada (não dá para "mover"
-- dados de uma empresa para outra pela API)
create or replace function public.keep_workspace()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.workspace_id := old.workspace_id;
  return new;
end;
$$;
revoke execute on function public.keep_workspace() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'freelancers', 'proposals', 'projects', 'tasks', 'calendar_events',
    'financial_transactions', 'contracts', 'goals', 'quotes', 'quote_recurrences'
  ]
  loop
    execute format('drop trigger if exists trg_keep_workspace on public.%I', t);
    execute format('create trigger trg_keep_workspace before update on public.%I for each row execute function public.keep_workspace()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Numeração de propostas e orçamentos: por workspace
-- ---------------------------------------------------------------------
alter table public.proposals drop constraint if exists proposals_user_id_proposal_number_key;
alter table public.proposals drop constraint if exists proposals_workspace_number_key;
alter table public.proposals add constraint proposals_workspace_number_key unique (workspace_id, proposal_number);

alter table public.quotes drop constraint if exists quotes_user_id_quote_number_key;
alter table public.quotes drop constraint if exists quotes_workspace_number_key;
alter table public.quotes add constraint quotes_workspace_number_key unique (workspace_id, quote_number);

create or replace function public.set_proposal_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.proposal_number is null then
    -- trava por workspace para duas propostas simultâneas não pegarem o mesmo número
    perform pg_advisory_xact_lock(hashtext(new.workspace_id::text));
    select coalesce(max(proposal_number), 0) + 1
      into new.proposal_number
      from public.proposals
     where workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

create or replace function public.set_quote_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quote_number is null then
    perform pg_advisory_xact_lock(hashtext('quote:' || new.workspace_id::text));
    select coalesce(max(quote_number), 0) + 1
      into new.quote_number
      from public.quotes
     where workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Contador de APIs pagas: por workspace (os membros dividem a cota)
-- ---------------------------------------------------------------------
drop policy if exists "api_usage_select_own" on public.api_usage;
drop policy if exists "api_usage_select" on public.api_usage;

alter table public.api_usage add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
update public.api_usage set workspace_id = user_id where workspace_id is null;
alter table public.api_usage alter column workspace_id set not null;
alter table public.api_usage drop constraint if exists api_usage_pkey;
alter table public.api_usage add primary key (workspace_id, api, month);
alter table public.api_usage drop column if exists user_id;

create policy "api_usage_select" on public.api_usage
  for select using (public.is_member(workspace_id));

drop function if exists public.api_usage_add(text, integer);
create or replace function public.api_usage_add(p_api text, p_calls integer default 1, p_workspace uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid := coalesce(p_workspace, public.default_workspace_id());
  total integer;
begin
  if auth.uid() is null or v_ws is null or not public.is_member(v_ws, 'member') then
    raise exception 'unauthorized';
  end if;
  if p_calls < 1 or p_calls > 5 then
    raise exception 'invalid_calls';
  end if;
  insert into public.api_usage (workspace_id, api, month, calls)
  values (v_ws, p_api, date_trunc('month', now() at time zone 'America/Los_Angeles')::date, p_calls)
  on conflict (workspace_id, api, month)
    do update set calls = public.api_usage.calls + excluded.calls, updated_at = now()
  returning calls into total;
  return total;
end;
$$;
revoke all on function public.api_usage_add(text, integer, uuid) from public, anon;
grant execute on function public.api_usage_add(text, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Cobrança (Asaas) e clientes do gateway: do workspace
-- ---------------------------------------------------------------------
alter table public.billing_integrations add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
update public.billing_integrations set workspace_id = user_id where workspace_id is null;
alter table public.billing_integrations alter column workspace_id set not null;
alter table public.billing_integrations drop constraint if exists billing_integrations_pkey;
alter table public.billing_integrations add primary key (workspace_id, provider);
alter table public.billing_integrations drop column if exists user_id;

alter table public.gateway_customers add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
update public.gateway_customers set workspace_id = user_id where workspace_id is null;
alter table public.gateway_customers alter column workspace_id set not null;
alter table public.gateway_customers drop column if exists user_id;
create index if not exists idx_gateway_customers_workspace on public.gateway_customers (workspace_id);

drop function if exists public.billing_save_api_key(uuid, text, text, text, text, text);
drop function if exists public.billing_read_api_key(uuid, text);
drop function if exists public.billing_forget(uuid, text);
drop function if exists public.get_billing_status();

create or replace function public.billing_save_api_key(p_workspace uuid, p_provider text, p_environment text, p_key text, p_account_name text, p_account_email text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  select api_key_secret_id into v_secret from public.billing_integrations where workspace_id = p_workspace and provider = p_provider;
  if v_secret is null then
    v_secret := vault.create_secret(p_key, 'billing:' || p_provider || ':' || p_workspace, 'Chave de API do gateway de cobrança');
  else
    perform vault.update_secret(v_secret, p_key);
  end if;
  insert into public.billing_integrations (workspace_id, provider, environment, api_key_secret_id, account_name, account_email, connected_at)
  values (p_workspace, p_provider, p_environment, v_secret, p_account_name, p_account_email, now())
  on conflict (workspace_id, provider) do update
    set environment = excluded.environment,
        api_key_secret_id = excluded.api_key_secret_id,
        account_name = excluded.account_name,
        account_email = excluded.account_email,
        webhook_id = null,
        webhook_token_hash = null,
        connected_at = now();
end;
$$;

create or replace function public.billing_read_api_key(p_workspace uuid, p_provider text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select s.decrypted_secret
  from public.billing_integrations b
  join vault.decrypted_secrets s on s.id = b.api_key_secret_id
  where b.workspace_id = p_workspace and b.provider = p_provider;
$$;

create or replace function public.billing_forget(p_workspace uuid, p_provider text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  delete from public.billing_integrations where workspace_id = p_workspace and provider = p_provider returning api_key_secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

revoke all on function public.billing_save_api_key(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_read_api_key(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_forget(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_save_api_key(uuid, text, text, text, text, text) to service_role;
grant execute on function public.billing_read_api_key(uuid, text) to service_role;
grant execute on function public.billing_forget(uuid, text) to service_role;

-- o que o app pode saber da conexão (sem a chave); quem não é admin não vê nem o e-mail da conta
create or replace function public.get_billing_status(p_workspace uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', provider,
    'environment', environment,
    'account_name', account_name,
    'account_email', case when public.is_member(workspace_id, 'admin') then account_email end,
    'webhook', webhook_id is not null,
    'connected_at', connected_at
  )), '[]'::jsonb)
  from public.billing_integrations
  where workspace_id = coalesce(p_workspace, public.default_workspace_id())
    and public.is_member(workspace_id);
$$;
revoke all on function public.get_billing_status(uuid) from public, anon;
grant execute on function public.get_billing_status(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Links públicos de proposta e contrato: o emitente é o workspace
-- ---------------------------------------------------------------------
create or replace function public.get_shared_proposal(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'proposal', jsonb_build_object(
      'proposal_number', p.proposal_number,
      'title', p.title,
      'scope_text', p.scope_text,
      'content', p.content,
      'total_amount', p.total_amount,
      'validity_days', p.validity_days,
      'payment_terms', p.payment_terms,
      'created_at', p.created_at,
      'status', p.status,
      'signed_at', p.signed_at,
      'signer_name', p.signer_name,
      'signer_document', p.signer_document,
      'signature_image', p.signature_image,
      'signature_method', p.signature_method,
      'signature_ip', p.signature_ip,
      'signature_hash', p.signature_hash
    ),
    'issuer', (
      select jsonb_build_object('full_name', pr.full_name, 'company_name', w.company_name, 'document', w.document, 'email', w.email, 'phone', w.phone)
      from public.workspaces w
      left join public.profiles pr on pr.id = p.user_id
      where w.id = p.workspace_id
    ),
    'client', (
      select jsonb_build_object('name', c.name, 'company_name', c.company_name, 'document', c.document, 'email', c.email, 'phone', c.phone)
      from public.clients c where c.id = p.client_id
    )
  )
  from public.proposals p
  where p.share_token = p_token
    and (p.status in ('awaiting_signature', 'signed') or (p.status = 'approved' and p.signed_at is not null));
$$;

create or replace function public.get_shared_contract(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'contract', jsonb_build_object(
      'title', c.title,
      'content_markdown', c.content_markdown,
      'created_at', c.created_at,
      'status', c.status,
      'signed_at', c.signed_at,
      'signer_name', c.signer_name,
      'signer_document', c.signer_document,
      'signature_image', c.signature_image,
      'signature_method', c.signature_method,
      'signature_ip', c.signature_ip,
      'signature_hash', c.signature_hash
    ),
    'issuer', (
      select jsonb_build_object('full_name', pr.full_name, 'company_name', w.company_name, 'signature_image', w.signature_image)
      from public.workspaces w
      left join public.profiles pr on pr.id = c.user_id
      where w.id = c.workspace_id
    )
  )
  from public.contracts c
  where c.share_token = p_token
    and (c.status = 'awaiting_signature' or (c.signature_method = 'link' and c.status in ('signed', 'active')));
$$;

-- a assinatura do contrato lança as mensalidades no workspace do contrato
create or replace function public.sign_shared_contract(p_token uuid, p_name text, p_document text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.contracts%rowtype;
  v_headers json;
  v_name text := btrim(coalesce(p_name, ''));
  v_document text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  v_now timestamptz := now();
  v_months integer;
  v_first date;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'Informe o nome completo de quem assina.';
  end if;
  if length(v_document) not in (11, 14) then
    raise exception 'Informe um CPF ou CNPJ válido.';
  end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) < 500 or length(p_signature) > 200000 then
    raise exception 'Assinatura inválida. Desenhe a assinatura novamente.';
  end if;

  select * into v_contract from public.contracts where share_token = p_token for update;
  if not found then
    raise exception 'Link de assinatura inválido.';
  end if;
  if v_contract.status <> 'awaiting_signature' then
    raise exception 'Este contrato não está aguardando assinatura.';
  end if;

  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  update public.contracts
     set status = 'signed',
         signed_at = v_now,
         signer_name = v_name,
         signer_document = v_document,
         signature_image = p_signature,
         signature_method = 'link',
         signature_ip = nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
         signature_user_agent = left(v_headers ->> 'user-agent', 300),
         signature_hash = encode(
           sha256(convert_to(
             concat_ws('|', v_contract.id, v_contract.title, v_contract.content_markdown, coalesce(v_contract.monthly_amount::text, ''),
                       coalesce(v_contract.term_months::text, ''), v_name, v_document, v_now),
             'UTF8')),
           'hex')
   where id = v_contract.id;

  -- mensalidades: uma por mês de vigência, se ainda não foram lançadas
  v_months := least(coalesce(v_contract.term_months, 0), 120);
  if coalesce(v_contract.monthly_amount, 0) > 0 and v_months >= 1
     and not exists (select 1 from public.financial_transactions t where t.contract_id = v_contract.id) then
    v_first := coalesce(v_contract.first_due_date, (v_now + interval '1 month')::date);
    insert into public.financial_transactions
      (user_id, workspace_id, type, category, description, amount, due_date, payment_date, status, client_id, recurrence_id, installment, installments, contract_id)
    select
      v_contract.user_id, v_contract.workspace_id, 'income', 'Mensalidade',
      'Mensalidade — ' || regexp_replace(v_contract.title, '^Contrato\s+[—-]\s+', '', 'i'),
      v_contract.monthly_amount,
      (v_first + make_interval(months => i))::date,
      null, 'pending', v_contract.client_id, r.id, i + 1, v_months, v_contract.id
    from generate_series(0, v_months - 1) as i
    cross join (select gen_random_uuid() as id) as r;
  end if;

  return jsonb_build_object('signed_at', v_now);
end;
$$;

revoke all on function public.get_shared_proposal(uuid) from public;
revoke all on function public.get_shared_contract(uuid) from public;
revoke all on function public.sign_shared_contract(uuid, text, text, text) from public;
grant execute on function public.get_shared_proposal(uuid) to anon, authenticated;
grant execute on function public.get_shared_contract(uuid) to anon, authenticated;
grant execute on function public.sign_shared_contract(uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage (comprovantes): a pasta é o id do workspace. As pastas que já
-- existem (id do usuário) continuam valendo, porque o workspace de cada um
-- tem o mesmo id.
-- ---------------------------------------------------------------------
create or replace function public.storage_workspace(p_name text)
returns uuid
language sql
immutable
set search_path = public, storage
as $$
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (storage.foldername(p_name))[1]::uuid
  end;
$$;
revoke all on function public.storage_workspace(text) from public, anon;
grant execute on function public.storage_workspace(text) to authenticated;

drop policy if exists "proofs_select_own" on storage.objects;
drop policy if exists "proofs_insert_own" on storage.objects;
drop policy if exists "proofs_delete_own" on storage.objects;
drop policy if exists "proofs_select" on storage.objects;
drop policy if exists "proofs_insert" on storage.objects;
drop policy if exists "proofs_delete" on storage.objects;

create policy "proofs_select" on storage.objects
  for select using (bucket_id = 'proofs' and public.is_member(public.storage_workspace(name)));
create policy "proofs_insert" on storage.objects
  for insert with check (bucket_id = 'proofs' and public.is_member(public.storage_workspace(name), 'member'));
create policy "proofs_delete" on storage.objects
  for delete using (bucket_id = 'proofs' and public.is_member(public.storage_workspace(name), 'member'));

notify pgrst, 'reload schema';
