-- Assinatura (migração 026): o que vale em cada situação e quem enxerga o histórico.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now());

do $$
declare v_a uuid;
begin
  select workspace_id into v_a from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform set_config('test.ws', v_a::text, true);
end $$;

-- assinatura paga: vale o plano escolhido
update public.workspaces set plan_id = 'essential', subscription_status = 'active', current_period_end = now() + interval '20 days' where id = current_setting('test.ws')::uuid;
select is(public.effective_plan(current_setting('test.ws')::uuid), 'essential', 'assinatura ativa vale o plano contratado');

-- atrasou há 3 dias: ainda tolerado
update public.workspaces set subscription_status = 'past_due', past_due_since = now() - interval '3 days' where id = current_setting('test.ws')::uuid;
select is(public.effective_plan(current_setting('test.ws')::uuid), 'essential', 'atraso de 3 dias ainda vale o plano');

-- atrasou há 8 dias: volta ao Grátis
update public.workspaces set past_due_since = now() - interval '8 days' where id = current_setting('test.ws')::uuid;
select is(public.effective_plan(current_setting('test.ws')::uuid), 'free', 'atraso de mais de 7 dias volta ao Grátis');

-- cancelou com período pago: vale até o fim
update public.workspaces set subscription_status = 'canceled', current_period_end = now() + interval '5 days' where id = current_setting('test.ws')::uuid;
select is(public.effective_plan(current_setting('test.ws')::uuid), 'essential', 'cancelada vale até o fim do período pago');
update public.workspaces set current_period_end = now() - interval '1 day' where id = current_setting('test.ws')::uuid;
select is(public.effective_plan(current_setting('test.ws')::uuid), 'free', 'cancelada e vencida volta ao Grátis');

-- o app não vê nem escreve o histórico de avisos do Asaas
insert into public.subscription_events (id, workspace_id, event) values ('evt_1', current_setting('test.ws')::uuid, 'PAYMENT_CONFIRMED');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$ select * from public.subscription_events $$, '42501', null, 'o app não lê o histórico do Asaas');
select throws_ok($$ update public.workspaces set asaas_subscription_id = 'sub_x' where id = current_setting('test.ws')::uuid $$, '42501', null, 'o app não grava o id da assinatura');
select is((public.plan_usage(current_setting('test.ws')::uuid) ->> 'has_subscription')::boolean, false, 'plan_usage informa se há assinatura');
reset role;
select pass('assinatura ok');
select * from finish();
rollback;
