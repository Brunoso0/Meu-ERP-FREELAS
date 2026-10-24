-- Testes de acesso (pgTAP): um usuário não enxerga nem altera dados de outro,
-- e visitante sem login não lê nada. Na fase 2 os mesmos testes passam a provar
-- o isolamento entre workspaces. Rodam com `supabase test db`.
begin;
select no_plan();

-- usuários A e B (o gatilho handle_new_user cria o profile de cada um)
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local');

-- dados de cada um (como superusuário, ignorando RLS)
insert into public.clients (user_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cliente A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cliente B');
insert into public.financial_transactions (user_id, type, description, amount, due_date) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'income', 'Lancamento A', 100, current_date),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'income', 'Lancamento B', 200, current_date);
insert into storage.objects (bucket_id, name) values
  ('proofs', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a.png'),
  ('proofs', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/b.png');

-- regra geral: nenhuma tabela do schema public pode ficar sem RLS
select is_empty(
  $$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$,
  'toda tabela de public tem RLS ligado'
);

-- ---- logado como A ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select results_eq(
  $$select name from public.clients order by name$$,
  array['Cliente A'],
  'A só enxerga os próprios clientes'
);
select results_eq(
  $$select description from public.financial_transactions$$,
  array['Lancamento A'],
  'A só enxerga os próprios lançamentos'
);
select is_empty(
  $$update public.clients set name = 'invadido' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning id$$,
  'A não altera cliente de B'
);
select is_empty(
  $$delete from public.clients where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning id$$,
  'A não apaga cliente de B'
);
select is_empty(
  $$delete from public.financial_transactions where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning id$$,
  'A não apaga lançamento de B'
);
select throws_ok(
  $$insert into public.clients (user_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'plantado')$$,
  '42501',
  null,
  'A não cria cliente em nome de B'
);
select results_eq(
  $$select name from storage.objects where bucket_id = 'proofs'$$,
  array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a.png'],
  'A só enxerga os próprios comprovantes'
);

-- ---- visitante sem login ----
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

select is_empty($$select id from public.clients$$, 'visitante não lê clientes');
select is_empty($$select id from public.financial_transactions$$, 'visitante não lê lançamentos');
select is_empty($$select id from storage.objects where bucket_id = 'proofs'$$, 'visitante não lê comprovantes');

reset role;
select * from finish();
rollback;
