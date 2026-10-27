-- Perfil do negócio (migração 023): valores válidos, quem edita e quem já existia.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beto@teste.local', '{"full_name":"Beto"}', now(), now());

-- conta nova: ainda não entrevistada
select is((select onboarded_at from public.workspaces where created_by = 'aaaaaaaa-0000-0000-0000-00000000000a'), null, 'conta nova começa sem entrevista');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ update public.workspaces set business_type = 'mei', team_size = 'solo', segment = 'sites', onboarded_at = now() where created_by = 'aaaaaaaa-0000-0000-0000-00000000000a' $$,
  'dono grava o perfil do negócio'
);
select throws_ok($$ update public.workspaces set business_type = 'inventado' where created_by = 'aaaaaaaa-0000-0000-0000-00000000000a' $$, '23514', null, 'tipo inválido é recusado');
select throws_ok($$ update public.workspaces set team_size = '1000' where created_by = 'aaaaaaaa-0000-0000-0000-00000000000a' $$, '23514', null, 'tamanho inválido é recusado');

-- outra pessoa não altera o perfil alheio
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}';
select is_empty($$ update public.workspaces set business_type = 'me' where created_by = 'aaaaaaaa-0000-0000-0000-00000000000a' returning id $$, 'outra conta não altera o perfil');

reset role;
select is((select business_type from public.workspaces where created_by = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'mei', 'perfil de Ana segue como gravado');
select pass('perfil do negócio ok');
select * from finish();
rollback;
