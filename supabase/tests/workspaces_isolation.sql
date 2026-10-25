-- Prova de isolamento entre workspaces. Rode SÓ no banco de testes, no SQL
-- Editor ou por `psql -f`. Tudo acontece dentro de uma transação que termina
-- em ROLLBACK: nada fica gravado. Qualquer falha lança uma exceção.
begin;

-- duas pessoas, cada uma com o seu workspace (o gatilho de cadastro cria)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beto@teste.local', '{"full_name":"Beto"}', now(), now()),
  ('cccccccc-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cris@teste.local', '{"full_name":"Cris"}', now(), now());

do $$
declare
  v_a uuid; v_b uuid; v_n int;
begin
  select workspace_id into v_a from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  select workspace_id into v_b from public.workspace_members where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  if v_a is null or v_b is null or v_a = v_b then raise exception 'FALHA: cadastro não criou um workspace para cada pessoa'; end if;

  -- Cris (contador) entra no workspace da Ana só para leitura
  insert into public.workspace_members (workspace_id, user_id, role) values (v_a, 'cccccccc-0000-0000-0000-00000000000c', 'viewer');
  perform set_config('test.ws_a', v_a::text, true);
  perform set_config('test.ws_b', v_b::text, true);
end $$;

-- ---------------- Ana grava no workspace dela ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare v_a uuid := current_setting('test.ws_a')::uuid; v_n int; v_num int;
begin
  insert into public.clients (name) values ('Cliente da Ana');           -- workspace_id vem do padrão
  insert into public.proposals (title) values ('Proposta 1'), ('Proposta 2');
  select proposal_number into v_num from public.proposals where title = 'Proposta 2';
  if v_num <> 2 then raise exception 'FALHA: numeração por workspace (esperado 2, veio %)', v_num; end if;
  select count(*) into v_n from public.clients where workspace_id = v_a;
  if v_n <> 1 then raise exception 'FALHA: Ana deveria ter 1 cliente'; end if;
end $$;

-- ---------------- Beto não vê nada da Ana ----------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare v_a uuid := current_setting('test.ws_a')::uuid; v_b uuid := current_setting('test.ws_b')::uuid; v_n int; v_num int;
begin
  select count(*) into v_n from public.clients;
  if v_n <> 0 then raise exception 'FALHA: Beto enxerga % cliente(s) de outro workspace', v_n; end if;
  select count(*) into v_n from public.proposals;
  if v_n <> 0 then raise exception 'FALHA: Beto enxerga propostas de outro workspace'; end if;
  select count(*) into v_n from public.workspaces where id = v_a;
  if v_n <> 0 then raise exception 'FALHA: Beto enxerga o workspace da Ana'; end if;
  select count(*) into v_n from public.workspace_members where workspace_id = v_a;
  if v_n <> 0 then raise exception 'FALHA: Beto enxerga os membros da Ana'; end if;

  -- numeração independente: a primeira proposta do Beto é a número 1
  insert into public.proposals (title) values ('Proposta do Beto');
  select proposal_number into v_num from public.proposals where title = 'Proposta do Beto';
  if v_num <> 1 then raise exception 'FALHA: numeração do Beto deveria começar em 1 (veio %)', v_num; end if;

  -- não consegue gravar no workspace da Ana
  begin
    insert into public.clients (name, workspace_id) values ('Invasor', v_a);
    raise exception 'FALHA: Beto gravou no workspace da Ana';
  exception when insufficient_privilege then null; when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- nem alterar nem apagar
  update public.clients set name = 'Hackeado' where workspace_id = v_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHA: Beto alterou dados da Ana'; end if;
  delete from public.clients where workspace_id = v_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHA: Beto apagou dados da Ana'; end if;

  -- nem se promover a membro
  begin
    insert into public.workspace_members (workspace_id, user_id, role) values (v_a, 'bbbbbbbb-0000-0000-0000-00000000000b', 'owner');
    raise exception 'FALHA: Beto se adicionou ao workspace da Ana';
  exception when insufficient_privilege then null; when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

-- ---------------- Cris (contador, só leitura) ----------------
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-00000000000c","role":"authenticated"}', true);

do $$
declare v_a uuid := current_setting('test.ws_a')::uuid; v_n int;
begin
  select count(*) into v_n from public.clients where workspace_id = v_a;
  if v_n <> 1 then raise exception 'FALHA: o contador deveria ler os dados da Ana'; end if;

  begin
    insert into public.clients (name, workspace_id) values ('Do contador', v_a);
    raise exception 'FALHA: o contador gravou dados';
  exception when insufficient_privilege then null; when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  update public.clients set name = 'X' where workspace_id = v_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHA: o contador alterou dados'; end if;
  delete from public.proposals where workspace_id = v_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHA: o contador apagou dados'; end if;

  -- ao ter workspace próprio (criado no cadastro), o padrão dele é esse, não o da Ana
  if public.default_workspace_id() = v_a then raise exception 'FALHA: o padrão do contador deveria ser o workspace dele'; end if;
end $$;

-- ---------------- a pessoa não move dados para outro workspace ----------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare v_a uuid := current_setting('test.ws_a')::uuid; v_b uuid := current_setting('test.ws_b')::uuid; v_ws uuid;
begin
  update public.clients set workspace_id = v_b where workspace_id = v_a;
  select workspace_id into v_ws from public.clients where name = 'Cliente da Ana';
  if v_ws <> v_a then raise exception 'FALHA: o workspace da linha mudou'; end if;
end $$;

reset role;
select 'OK: isolamento entre workspaces' as resultado;
rollback;
