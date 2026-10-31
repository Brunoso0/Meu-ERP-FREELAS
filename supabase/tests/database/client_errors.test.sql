-- Registro de erros do app (migração 032).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now());

-- sem sessão (tela de login) também registra
set local role anon;
select lives_ok($$ select public.report_client_error('Falhou X', 'stack linha 1', '/app/clientes?token=segredo#x', 'Chrome', 'abc') $$, 'anon registra erro');
select lives_ok($$ select public.report_client_error('Falhou X', 'stack linha 1', '/app/clientes', 'Chrome', 'abc') $$, 'erro igual não duplica');
select throws_ok($$ select * from public.client_errors $$, '42501', null, 'anon não lê os erros');
reset role;

select is((select count(*) from public.client_errors), 1::bigint, 'erros iguais viram uma linha');
select is((select count from public.client_errors), 2, 'com contador');
select is((select path from public.client_errors), '/app/clientes', 'caminho sem parâmetros nem âncora');

-- logado: guarda quem foi, corta textos longos
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}';
select lives_ok($$ select public.report_client_error(repeat('m', 900), repeat('s', 5000), '/app', repeat('u', 600), repeat('v', 100)) $$, 'logado registra erro grande');
select throws_ok($$ select * from public.client_errors $$, '42501', null, 'logado não lê os erros');
reset role;

select is((select length(message) from public.client_errors where message like 'mmm%'), 500, 'mensagem cortada em 500');
select is((select length(stack) from public.client_errors where message like 'mmm%'), 3000, 'pilha cortada em 3000');
select is((select user_id from public.client_errors where message like 'mmm%'), 'aaaaaaaa-0000-0000-0000-00000000000a'::uuid, 'guarda o id de quem estava logado');
select is((select length(app_version) from public.client_errors where message like 'mmm%'), 40, 'versão cortada');

-- mensagem vazia vira texto padrão
select lives_ok($$ select public.report_client_error('   ') $$, 'mensagem vazia aceita');
select is((select count(*) from public.client_errors where message = 'erro sem mensagem'), 1::bigint, 'com texto padrão');


-- versão 2: contexto, rastro e pessoas afetadas
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}';
select lives_ok($$ select public.report_client_error('Erro com contexto', 'pilha', '/app/clientes', 'Chrome', 'v1', 'react', null, '{"viewport":"390x844"}', '[{"t":1,"type":"nav","to":"/app/clientes"}]') $$, 'aceita contexto e rastro');
select lives_ok($$ select public.report_client_error('Erro com contexto', 'pilha', '/app/clientes', 'Chrome', 'v1', 'react') $$, 'mesmo erro de novo');
reset role;
select is((select count from public.client_errors where message = 'Erro com contexto'), 2, 'conta repetições');
select is((select kind from public.client_errors where message = 'Erro com contexto'), 'react', 'guarda o tipo');
select is((select context->>'viewport' from public.client_errors where message = 'Erro com contexto'), '390x844', 'guarda o contexto e não o apaga na repetição sem contexto');
select is((select cardinality(user_ids) from public.client_errors where message = 'Erro com contexto'), 1, 'mesma pessoa conta uma vez');
select lives_ok($$ select public.report_client_error('Erro com contexto', 'pilha', '/app', 'Chrome', 'v1', 'react') $$, 'anônimo repete o erro');
select is((select cardinality(user_ids) from public.client_errors where message = 'Erro com contexto'), 1, 'anônimo não entra na contagem de pessoas');
set local role anon;
select lives_ok($$ select public.report_client_error('Enorme', null, '/', null, null, null, null, (select jsonb_build_object('x', repeat('a', 5000))), null) $$, 'contexto gigante não quebra');
reset role;
select is((select context from public.client_errors where message = 'Enorme'), '{"truncado": true}'::jsonb, 'contexto gigante é descartado');

select pass('erros ok');
select * from finish();
rollback;
