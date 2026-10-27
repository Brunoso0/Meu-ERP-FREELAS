-- Planos, trial e limites (migração 025).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beto@teste.local', '{"full_name":"Beto"}', now(), now());

do $$
declare v_a uuid;
begin
  select workspace_id into v_a from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform set_config('test.ws_a', v_a::text, true);
end $$;

-- cadastro novo: trial de 14 dias com o Profissional
select is(public.effective_plan(current_setting('test.ws_a')::uuid), 'pro', 'conta nova está no trial (Profissional)');
select is((select subscription_status from public.workspaces where id = current_setting('test.ws_a')::uuid), 'trialing', 'status trialing');
select ok((select trial_ends_at between now() + interval '13 days' and now() + interval '15 days' from public.workspaces where id = current_setting('test.ws_a')::uuid), 'trial dura 14 dias');
select is(public.plan_feature(current_setting('test.ws_a')::uuid, 'nfse'), true, 'trial libera nota fiscal');

-- trial vencido sem assinatura: cai no Grátis
update public.workspaces set trial_ends_at = now() - interval '1 day' where id = current_setting('test.ws_a')::uuid;
select is(public.effective_plan(current_setting('test.ws_a')::uuid), 'free', 'trial vencido volta ao Grátis');
select is(public.plan_limit(current_setting('test.ws_a')::uuid, 'clients'), 5, 'Grátis limita 5 clientes');
select is(public.plan_feature(current_setting('test.ws_a')::uuid, 'signature'), false, 'Grátis não tem assinatura online');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 5 clientes passam, o 6º não
select lives_ok($$ insert into public.clients (name) select 'Cliente ' || g from generate_series(1, 5) g $$, 'cinco clientes cabem no Grátis');
select throws_ok($$ insert into public.clients (name) values ('Cliente 6') $$, 'P0001', null, 'o sexto cliente é recusado');

-- cliente inativo não conta
select lives_ok($$ update public.clients set status = 'inactive' where name = 'Cliente 1' $$, 'inativa um cliente');
select lives_ok($$ insert into public.clients (name) values ('Cliente 6') $$, 'vaga liberada ao inativar');

-- assinatura online só do Essencial para cima
select lives_ok($$ insert into public.proposals (client_id, title, total_amount) select id, 'P1', 100 from public.clients limit 1 $$, 'proposta cabe no Grátis');
select throws_ok($$ update public.proposals set share_token = gen_random_uuid() $$, 'P0001', null, 'Grátis não gera link de assinatura');

-- limite de 5 propostas no mês
select lives_ok($$ insert into public.proposals (client_id, title, total_amount) select id, 'P' || g, 100 from public.clients, generate_series(2, 5) g limit 4 $$, 'até 5 propostas');
select throws_ok($$ insert into public.proposals (client_id, title, total_amount) select id, 'P6', 100 from public.clients limit 1 $$, 'P0001', null, 'a sexta proposta do mês é recusada');

-- só Grátis: ninguém além do dono
select throws_ok(
  $$ select public.create_workspace_invite(current_setting('test.ws_a')::uuid, 'beto@teste.local', 'member') $$,
  'P0001', null, 'Grátis não convida outra pessoa');

-- uso aparece na tela
select is((public.plan_usage(current_setting('test.ws_a')::uuid) -> 'usage' ->> 'proposals_month')::int, 5, 'plan_usage conta as propostas do mês');
select is(public.plan_usage(current_setting('test.ws_a')::uuid) ->> 'plan', 'free', 'plan_usage informa o plano em vigor');

-- cota de leads: Grátis não tem
select is(public.consume_plan_quota(current_setting('test.ws_a')::uuid, 'leads', 1) ->> 'ok', 'false', 'Grátis não tem busca de leads');

-- quem não é membro não vê o uso
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok($$ select public.plan_usage(current_setting('test.ws_a')::uuid) $$, 'P0001', 'unauthorized', 'estranho não vê o uso do plano');

-- o app não altera plano nem assinatura
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$ update public.workspaces set plan_id = 'pro' where id = current_setting('test.ws_a')::uuid $$, '42501', null, 'dono não troca o próprio plano pelo app');
select throws_ok($$ update public.workspaces set subscription_status = 'active' where id = current_setting('test.ws_a')::uuid $$, '42501', null, 'dono não ativa a própria assinatura');

-- Essencial: 2 pessoas, 1 leitor, assinatura liberada, leads 20/mês
reset role;
update public.workspaces set plan_id = 'essential', subscription_status = 'active' where id = current_setting('test.ws_a')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
select lives_ok($$ update public.proposals set share_token = gen_random_uuid() where title = 'P1' $$, 'Essencial gera link de assinatura');
select lives_ok($$ select public.create_workspace_invite(current_setting('test.ws_a')::uuid, 'beto@teste.local', 'member') $$, 'Essencial convida a segunda pessoa');
select throws_ok($$ select public.create_workspace_invite(current_setting('test.ws_a')::uuid, 'cris@teste.local', 'member') $$, 'P0001', null, 'a terceira pessoa não cabe');
select lives_ok($$ select public.create_workspace_invite(current_setting('test.ws_a')::uuid, 'cris@teste.local', 'viewer') $$, 'o leitor tem vaga própria');
select is(public.consume_plan_quota(current_setting('test.ws_a')::uuid, 'leads', 5) ->> 'ok', 'true', 'Essencial busca leads');
select is((public.consume_plan_quota(current_setting('test.ws_a')::uuid, 'leads', 5) ->> 'used')::int, 10, 'a cota soma');

reset role;
select pass('planos ok');
select * from finish();
rollback;
