-- Verificação em duas etapas (app autenticador, TOTP do próprio Supabase Auth).
--
-- 1) mfa_ok(): quem ativou a verificação só acessa os dados com a sessão já confirmada
--    pelo código (aal2). Quem não ativou segue como sempre. Vale no banco, não só na tela:
--    senha roubada, sem o código, não abre nenhum dado.
-- 2) Códigos de recuperação para quem perder o celular. Só o hash fica guardado, e só a
--    função de borda `mfa` mexe nas tabelas (nenhuma política para os papéis do app).

create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

-- códigos de recuperação (hash) e tentativas erradas (limite contra adivinhação)
create table public.mfa_recovery_codes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, code_hash)
);

create table public.mfa_recovery_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index mfa_recovery_attempts_user_idx on public.mfa_recovery_attempts (user_id, created_at desc);

alter table public.mfa_recovery_codes enable row level security;
alter table public.mfa_recovery_attempts enable row level security;
revoke all on public.mfa_recovery_codes, public.mfa_recovery_attempts from anon, authenticated;

-- política restritiva em toda tabela do app com RLS: soma-se às que já existem (não as substitui)
do $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname not in ('mfa_recovery_codes', 'mfa_recovery_attempts')
  loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format('create policy mfa_required on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t);
  end loop;
end $$;

-- arquivos (comprovantes, assinaturas, notas) seguem a mesma regra
drop policy if exists mfa_required on storage.objects;
create policy mfa_required on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
