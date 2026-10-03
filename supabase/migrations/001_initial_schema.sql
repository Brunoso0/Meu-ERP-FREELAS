-- =====================================================================
-- Meu ERP Freelas — schema inicial
-- Rode no SQL Editor do Supabase (ou `supabase db push`).
-- Todas as tabelas têm RLS: cada usuário só enxerga as próprias linhas.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  company_name text,
  document text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  company_name text,
  email text,
  phone text,
  document text,
  status text not null default 'lead' check (status in ('active', 'inactive', 'lead')),
  hourly_rate numeric(12, 2) default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- freelancers
-- ---------------------------------------------------------------------
create table if not exists public.freelancers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  specialty text,
  email text,
  phone text,
  pix_key text,
  cost_per_hour numeric(12, 2) default 0,
  rating numeric(2, 1) default 5 check (rating >= 0 and rating <= 5),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- proposals
-- proposal_number é uma sequência por usuário (exibida como #PROP-0001).
-- content guarda os blocos do gerador (entregáveis, cronograma, itens).
-- ---------------------------------------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  proposal_number integer not null,
  client_id uuid references public.clients (id) on delete set null,
  title text not null,
  scope_text text,
  content jsonb not null default '{}'::jsonb,
  total_amount numeric(12, 2) not null default 0,
  validity_days integer not null default 15,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'rejected')),
  payment_terms text,
  created_at timestamptz not null default now(),
  unique (user_id, proposal_number)
);

create or replace function public.set_proposal_number()
returns trigger
language plpgsql
as $$
begin
  if new.proposal_number is null then
    -- trava por usuário para duas propostas simultâneas não pegarem o mesmo número
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    select coalesce(max(proposal_number), 0) + 1
      into new.proposal_number
      from public.proposals
     where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_proposal_number on public.proposals;
create trigger trg_set_proposal_number
  before insert on public.proposals
  for each row execute function public.set_proposal_number();

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  proposal_id uuid references public.proposals (id) on delete set null,
  title text not null,
  description text,
  budget numeric(12, 2) default 0,
  status text not null default 'planning'
    check (status in ('planning', 'in_progress', 'review', 'completed', 'cancelled')),
  deadline date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- tasks (demandas & kanban)
-- user_id e due_date não estavam no briefing: user_id simplifica o RLS,
-- due_date é o prazo exibido no card (scheduled_date é o dia do kanban).
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  freelancer_id uuid references public.freelancers (id) on delete set null,
  title text not null,
  description text,
  status text not null default 'backlog' check (status in ('backlog', 'in_progress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  scheduled_date date,
  due_date date,
  cost_amount numeric(12, 2) default 0,
  charged_amount numeric(12, 2) default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  event_type text not null default 'meeting' check (event_type in ('meeting', 'deadline', 'review')),
  start_time timestamptz not null,
  end_time timestamptz,
  meeting_link text,
  client_id uuid references public.clients (id) on delete set null,
  freelancer_id uuid references public.freelancers (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- financial_transactions
-- ---------------------------------------------------------------------
create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category text,
  description text,
  amount numeric(12, 2) not null default 0,
  due_date date not null,
  payment_date date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  client_id uuid references public.clients (id) on delete set null,
  freelancer_id uuid references public.freelancers (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  proof_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- contracts
-- ---------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  proposal_id uuid references public.proposals (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  title text not null,
  content_markdown text not null default '',
  status text not null default 'draft' check (status in ('draft', 'signed', 'active', 'terminated')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  target_amount numeric(12, 2) not null default 0,
  current_amount numeric(12, 2) not null default 0,
  start_date date not null,
  end_date date not null,
  category text not null default 'revenue' check (category in ('revenue', 'clients', 'projects')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- índices
-- ---------------------------------------------------------------------
create index if not exists idx_clients_user on public.clients (user_id);
create index if not exists idx_freelancers_user on public.freelancers (user_id);
create index if not exists idx_proposals_user on public.proposals (user_id);
create index if not exists idx_proposals_client on public.proposals (client_id);
create index if not exists idx_projects_user on public.projects (user_id);
create index if not exists idx_projects_client on public.projects (client_id);
create index if not exists idx_tasks_user on public.tasks (user_id);
create index if not exists idx_tasks_project on public.tasks (project_id);
create index if not exists idx_tasks_scheduled on public.tasks (user_id, scheduled_date);
create index if not exists idx_events_user_start on public.calendar_events (user_id, start_time);
create index if not exists idx_transactions_user_due on public.financial_transactions (user_id, due_date);
create index if not exists idx_transactions_client on public.financial_transactions (client_id);
create index if not exists idx_transactions_project on public.financial_transactions (project_id);
create index if not exists idx_contracts_user on public.contracts (user_id);
create index if not exists idx_goals_user on public.goals (user_id);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'freelancers', 'proposals', 'projects', 'tasks',
    'calendar_events', 'financial_transactions', 'contracts', 'goals'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_own" on public.%I', t, t);
    execute format(
      'create policy "%s_own" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- cria o profile automaticamente quando o usuário se cadastra
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- usuários que já existiam antes desta migração também ganham profile
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
  from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Storage: comprovantes de PIX (bucket privado, pasta por usuário)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;

drop policy if exists "proofs_select_own" on storage.objects;
create policy "proofs_select_own" on storage.objects
  for select using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "proofs_insert_own" on storage.objects;
create policy "proofs_insert_own" on storage.objects
  for insert with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "proofs_delete_own" on storage.objects;
create policy "proofs_delete_own" on storage.objects
  for delete using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
