-- Exportar dados e apagar conta (migração 033).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('cccccccc-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@teste.local', '{"full_name":"C"}', now(), now()),
  ('dddddddd-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@teste.local', '{"full_name":"D"}', now(), now());

do $$
declare w uuid;
begin
  select workspace_id into w from public.workspace_members where user_id = 'cccccccc-0000-0000-0000-00000000000c';
  perform set_config('test.ws_c', w::text, true);
  insert into public.clients (user_id, workspace_id, name) values ('cccccccc-0000-0000-0000-00000000000c', w, 'Cliente C');
end $$;

set local role anon;
select throws_ok($$ select public.export_my_data() $$, '42501', null, 'anon não exporta');
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'anon não apaga conta');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal1"}';
select is(jsonb_array_length(public.export_my_data()->'clients'), 1, 'exporta os próprios clientes');
select is(public.export_my_data()->'conta'->>'email', 'c@teste.local', 'exporta a conta');
reset role;

-- dono com outra pessoa no workspace: bloqueia
insert into public.workspace_members (workspace_id, user_id, role)
values (current_setting('test.ws_c')::uuid, 'dddddddd-0000-0000-0000-00000000000d', 'member');
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal1"}';
select throws_like($$ select public.delete_my_account() $$, 'Você é dono%', 'bloqueia dono de equipe');
reset role;

delete from public.workspace_members where user_id = 'dddddddd-0000-0000-0000-00000000000d' and workspace_id = current_setting('test.ws_c')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal1"}';
select lives_ok($$ select public.delete_my_account() $$, 'apaga a conta sozinha');
reset role;

select is((select count(*) from auth.users where id = 'cccccccc-0000-0000-0000-00000000000c'), 0::bigint, 'usuário apagado');
select is((select count(*) from public.workspaces where id = current_setting('test.ws_c')::uuid), 0::bigint, 'workspace apagado');
select is((select count(*) from public.clients where workspace_id = current_setting('test.ws_c')::uuid), 0::bigint, 'dados apagados');
select is((select count(*) from auth.users where id = 'dddddddd-0000-0000-0000-00000000000d'), 1::bigint, 'conta de outra pessoa intacta');

select * from finish();
rollback;
