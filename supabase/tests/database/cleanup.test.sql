-- Limpeza técnica (migração 028): profiles só pessoal e vínculos dentro do mesmo workspace.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beto@teste.local', '{"full_name":"Beto"}', now(), now());

-- profiles: só o que é pessoal
select hasnt_column('public', 'profiles', 'company_name', 'profiles não guarda mais a empresa');
select hasnt_column('public', 'profiles', 'pix_key', 'profiles não guarda mais o Pix');
select hasnt_column('public', 'profiles', 'billing_provider', 'profiles não guarda mais a cobrança');
select hasnt_column('public', 'profiles', 'nfse_regime', 'profiles não guarda mais a nota fiscal');
select has_column('public', 'profiles', 'full_name', 'profiles guarda o nome');
select has_column('public', 'profiles', 'reminder_hour', 'profiles guarda os lembretes');
select is((select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'Ana', 'cadastro novo ainda cria o perfil');

-- dados de duas empresas
do $$
declare v_a uuid; v_b uuid;
begin
  select workspace_id into v_a from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  select workspace_id into v_b from public.workspace_members where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  perform set_config('test.ws_a', v_a::text, true);
  perform set_config('test.ws_b', v_b::text, true);
  insert into public.clients (id, user_id, workspace_id, name) values
    ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', v_a, 'Cliente A'),
    ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', v_b, 'Cliente B');
  insert into public.projects (id, user_id, workspace_id, title) values
    ('b2b2b2b2-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b', v_b, 'Projeto B');
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok($$ insert into public.proposals (client_id, title) values ('a1a1a1a1-0000-0000-0000-000000000001', 'Do mesmo workspace') $$, 'proposta com cliente do próprio workspace');
select lives_ok($$ insert into public.proposals (title) values ('Sem cliente') $$, 'vínculo vazio é permitido');
select throws_ok($$ insert into public.proposals (client_id, title) values ('b1b1b1b1-0000-0000-0000-000000000001', 'Cliente alheio') $$, '23514', null, 'proposta com cliente de outro workspace é recusada');
select throws_ok($$ insert into public.financial_transactions (type, category, description, amount, due_date, project_id) values ('income', 'x', 'y', 10, current_date, 'b2b2b2b2-0000-0000-0000-000000000002') $$, '23514', null, 'lançamento com projeto de outro workspace é recusado');

-- trocar o vínculo por um de fora também é recusado
select throws_ok($$ update public.proposals set client_id = 'b1b1b1b1-0000-0000-0000-000000000001' where title = 'Do mesmo workspace' $$, '23514', null, 'update para cliente alheio é recusado');
select lives_ok($$ update public.proposals set title = 'Renomeada' where title = 'Do mesmo workspace' $$, 'editar outros campos continua livre');

reset role;
select pass('limpeza ok');
select * from finish();
rollback;
