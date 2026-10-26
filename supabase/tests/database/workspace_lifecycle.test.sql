-- Criar e excluir workspace (migração 022).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beto@teste.local', '{"full_name":"Beto"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare v_ws uuid;
begin
  v_ws := public.create_workspace('Empresa Nova');
  perform set_config('test.ws', v_ws::text, true);
  insert into public.clients (name, workspace_id) values ('Cliente da Nova', v_ws);
  perform public.create_workspace_invite(v_ws, 'beto@teste.local', 'member');
end $$;

select is((select count(*) from public.workspace_members where role = 'owner' and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 2::bigint, 'Ana é dona do principal e do novo');

-- Beto entra como membro e não consegue excluir
reset role;
insert into public.workspace_members (workspace_id, user_id, role)
values (current_setting('test.ws')::uuid, 'bbbbbbbb-0000-0000-0000-00000000000b', 'admin');
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  format($f$ select public.delete_workspace(%L, 'Empresa Nova') $f$, current_setting('test.ws')),
  null, 'Só o dono pode excluir o workspace.', 'admin não exclui'
);

-- Ana: nome errado falha, nome certo apaga tudo
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok(
  format($f$ select public.delete_workspace(%L, 'outro nome') $f$, current_setting('test.ws')),
  null, 'O nome digitado não confere com o do workspace.', 'nome errado não exclui'
);
select lives_ok(format($f$ select public.delete_workspace(%L, 'Empresa Nova') $f$, current_setting('test.ws')), 'dona exclui com o nome certo');

reset role;
select is((select count(*) from public.workspaces where id = current_setting('test.ws')::uuid), 0::bigint, 'workspace sumiu');
select is((select count(*) from public.clients where workspace_id = current_setting('test.ws')::uuid), 0::bigint, 'dados sumiram');
select is((select count(*) from public.workspace_members where workspace_id = current_setting('test.ws')::uuid), 0::bigint, 'membros sumiram');
select is((select count(*) from public.workspace_invites where workspace_id = current_setting('test.ws')::uuid), 0::bigint, 'convites sumiram');
select is((select count(*) from public.workspaces where created_by = 'aaaaaaaa-0000-0000-0000-00000000000a'), 1::bigint, 'o workspace principal de Ana segue intacto');

select pass('ciclo de vida do workspace ok');
select * from finish();
rollback;
