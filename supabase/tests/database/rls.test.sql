-- =====================================================================
-- Isolamento entre contas (RLS).
--
-- O usuário A cria dados; o usuário B não pode ver, alterar, apagar nem
-- "doar" linhas para A; visitante sem login não lê nada. Roda com
-- `supabase test db` (local e no GitHub Actions), dentro de uma transação
-- que é desfeita no fim.
-- =====================================================================

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------- usuários de teste ----------
insert into auth.users (id, email, aud, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@teste.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@teste.local', 'authenticated', 'authenticated');

-- ---------- toda tabela pública tem RLS ----------
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint,
  'toda tabela do schema public tem RLS ligado'
);

-- ---------- A cria os próprios dados ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok($$ insert into public.clients (name) values ('Cliente de A') $$, 'A cria cliente');
select lives_ok($$ insert into public.freelancers (name) values ('Parceiro de A') $$, 'A cria parceiro');
select lives_ok($$ insert into public.proposals (title) values ('Proposta de A') $$, 'A cria proposta');
select lives_ok($$ insert into public.projects (title) values ('Projeto de A') $$, 'A cria projeto');
select lives_ok($$ insert into public.tasks (title) values ('Demanda de A') $$, 'A cria demanda');
select lives_ok($$ insert into public.quotes (title) values ('Orçamento de A') $$, 'A cria orçamento');
select lives_ok($$ insert into public.contracts (title) values ('Contrato de A') $$, 'A cria contrato');
select lives_ok($$ insert into public.goals (title, start_date, end_date) values ('Meta de A', current_date, current_date + 30) $$, 'A cria meta');
select lives_ok($$ insert into public.calendar_events (title, start_time) values ('Reunião de A', now()) $$, 'A cria evento');
select lives_ok(
  $$ insert into public.financial_transactions (type, category, description, amount, due_date) values ('income', 'Projeto', 'Recebimento de A', 100, current_date) $$,
  'A cria lançamento'
);
-- a pasta dos arquivos é o id do workspace (migração 020), criado no cadastro
select lives_ok(
  format($f$ insert into storage.objects (bucket_id, name) values ('proofs', '%s/comprovante.pdf') $f$,
         (select workspace_id from public.workspace_members where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  'A envia arquivo para a pasta do próprio workspace'
);
select is((select count(*) from public.clients), 1::bigint, 'A vê o próprio cliente');

-- ---------- B não enxerga nada de A ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select is((select count(*) from public.clients), 0::bigint, 'B não vê clientes de A');
select is((select count(*) from public.freelancers), 0::bigint, 'B não vê parceiros de A');
select is((select count(*) from public.proposals), 0::bigint, 'B não vê propostas de A');
select is((select count(*) from public.projects), 0::bigint, 'B não vê projetos de A');
select is((select count(*) from public.tasks), 0::bigint, 'B não vê demandas de A');
select is((select count(*) from public.quotes), 0::bigint, 'B não vê orçamentos de A');
select is((select count(*) from public.contracts), 0::bigint, 'B não vê contratos de A');
select is((select count(*) from public.goals), 0::bigint, 'B não vê metas de A');
select is((select count(*) from public.calendar_events), 0::bigint, 'B não vê eventos de A');
select is((select count(*) from public.financial_transactions), 0::bigint, 'B não vê lançamentos de A');
select is((select count(*) from storage.objects where bucket_id = 'proofs'), 0::bigint, 'B não vê arquivos de A');
select is((select count(*) from public.profiles), 1::bigint, 'B vê só o próprio perfil');

-- ---------- B não altera nem apaga dados de A ----------
select is_empty($$ update public.clients set name = 'invadido' returning id $$, 'B não altera clientes de A');
select is_empty($$ update public.financial_transactions set amount = 0 returning id $$, 'B não altera lançamentos de A');
select is_empty($$ delete from public.proposals returning id $$, 'B não apaga propostas de A');
select is_empty($$ delete from public.financial_transactions returning id $$, 'B não apaga lançamentos de A');
select is_empty($$ update public.profiles set full_name = 'invadido' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id $$, 'B não altera o perfil de A');

-- ---------- B não grava em nome de A ----------
select throws_ok(
  $$ insert into public.clients (user_id, name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'plantado') $$,
  '42501', null, 'B não cria cliente em nome de A'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('proofs', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/plantado.pdf') $$,
  '42501', null, 'B não envia arquivo para a pasta de A'
);

-- o dono de uma linha nunca muda (keep_owner, migração 003)
insert into public.clients (name) values ('Cliente de B');
update public.clients set user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where name = 'Cliente de B';
select is(
  (select user_id from public.clients where name = 'Cliente de B'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'B não consegue doar a própria linha para A'
);

-- ---------- A continua com tudo ----------
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select results_eq($$ select name from public.clients $$, $$ values ('Cliente de A') $$, 'os dados de A seguem intactos');

-- ---------- visitante sem login ----------
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.clients $$, '42501', null, 'visitante sem login não lê clientes');
select throws_ok($$ select count(*) from public.financial_transactions $$, '42501', null, 'visitante sem login não lê lançamentos');

reset role;
select * from finish();
rollback;
