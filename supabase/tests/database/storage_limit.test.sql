-- Limite de armazenamento do plano (migração 027).
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

-- Grátis: 100 MB
update public.workspaces set trial_ends_at = now() - interval '1 day' where id = current_setting('test.ws_a')::uuid;
select is(public.plan_limit(current_setting('test.ws_a')::uuid, 'storage_mb'), 100, 'Grátis tem 100 MB');

-- 60 MB já usados
insert into storage.objects (bucket_id, name, metadata)
values ('proofs', current_setting('test.ws_a') || '/antigo.pdf', '{"size": 62914560}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(public.storage_has_room(current_setting('test.ws_a')::uuid, 5242880), true, '5 MB cabem em 100 MB com 60 usados');
select is(public.storage_has_room(current_setting('test.ws_a')::uuid, 40 * 1048576), true, '40 MB cabem (60 + 40 = 100, o limite exato)');
select is(public.storage_has_room(current_setting('test.ws_a')::uuid, 45 * 1048576), false, '45 MB não cabem (60 + 45 passa de 100)');
select is(public.can_store(current_setting('test.ws_a') || '/novo.pdf'), true, 'envio liberado abaixo do limite');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('proofs', current_setting('test.ws_a') || '/novo.pdf') $$, 'comprovante novo entra abaixo do limite');

-- estranho não consulta o espaço de outro workspace
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok($$ select public.storage_has_room(current_setting('test.ws_a')::uuid, 1) $$, 'P0001', 'unauthorized', 'estranho não vê o espaço alheio');

-- passou do limite: novos envios são recusados, nada é apagado
reset role;
update storage.objects set metadata = '{"size": 110000000}' where name = current_setting('test.ws_a') || '/antigo.pdf';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(public.can_store(current_setting('test.ws_a') || '/outro.pdf'), false, 'acima do limite o envio é negado');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('proofs', current_setting('test.ws_a') || '/outro.pdf') $$, '42501', null, 'a política recusa o envio acima do limite');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name like current_setting('test.ws_a') || '/%'), 2, 'os arquivos antigos continuam lá');

-- Profissional: 5 GB, o mesmo uso cabe
reset role;
update public.workspaces set plan_id = 'pro', subscription_status = 'active' where id = current_setting('test.ws_a')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(public.can_store(current_setting('test.ws_a') || '/outro.pdf'), true, 'no Profissional o mesmo uso cabe');

reset role;
select pass('armazenamento ok');
select * from finish();
rollback;
