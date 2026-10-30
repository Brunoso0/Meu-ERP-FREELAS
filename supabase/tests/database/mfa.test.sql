-- Verificação em duas etapas (migração 030): com o código ativado, só a sessão aal2 vê e grava dados.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beto@teste.local', '{"full_name":"Beto"}', now(), now());

do $$
declare v_a uuid; v_b uuid;
begin
  select workspace_id into v_a from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  select workspace_id into v_b from public.workspace_members where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  insert into public.clients (id, user_id, workspace_id, name) values
    ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', v_a, 'Cliente A'),
    ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', v_b, 'Cliente B');
end $$;

-- Ana ativou a verificação; Beto não. Um segundo fator de Beto ainda não confirmado não conta.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'celular', 'totp', 'verified', 'JBSWY3DPEHPK3PXP', now(), now()),
  ('22222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b', 'celular', 'totp', 'unverified', 'JBSWY3DPEHPK3PXP', now(), now());

select has_function('public', 'mfa_ok', 'existe mfa_ok()');
select policies_are('public', 'mfa_recovery_codes', array[]::name[], 'códigos de recuperação sem política para o app');

set local role authenticated;

-- Ana, só com a senha (aal1): nada abre
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}';
select is((select count(*) from public.clients), 0::bigint, 'aal1 com a verificação ativa não vê clientes');
select throws_ok($$ insert into public.clients (user_id, workspace_id, name) select 'aaaaaaaa-0000-0000-0000-00000000000a', workspace_id, 'Novo' from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' $$, '42501', null, 'aal1 com a verificação ativa não grava');
select is((select count(*) from public.profiles), 0::bigint, 'aal1 não vê nem o perfil');

-- Ana, com o código (aal2): tudo como sempre
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}';
select is((select count(*) from public.clients), 1::bigint, 'aal2 vê os próprios clientes');
select lives_ok($$ update public.clients set name = 'Cliente A2' where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$, 'aal2 grava');

-- Ana sem o claim aal (sessão antiga): tratado como aal1
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*) from public.clients), 0::bigint, 'sem claim aal conta como aal1');

-- Beto não ativou nada: aal1 basta, e o isolamento entre empresas continua
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal1"}';
select is((select count(*) from public.clients), 1::bigint, 'sem verificação ativa o acesso segue normal');
select is((select name from public.clients), 'Cliente B', 'e só vê o que é dele');

-- o app não lê nem escreve os códigos de recuperação
select throws_ok($$ select * from public.mfa_recovery_codes $$, '42501', null, 'códigos de recuperação fechados para o app');

reset role;
select pass('mfa ok');
select * from finish();
rollback;
