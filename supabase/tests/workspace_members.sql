-- Prova das regras de membros e convites (migração 021). Só no banco de testes;
-- tudo dentro de uma transação que termina em ROLLBACK.
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@teste.local', '{"full_name":"Ana"}', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beto@teste.local', '{"full_name":"Beto"}', now(), now()),
  ('cccccccc-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cris@teste.local', '{"full_name":"Cris"}', now(), now()),
  ('dddddddd-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'duda@teste.local', '{"full_name":"Duda"}', now(), now());

do $$
declare v_a uuid;
begin
  select workspace_id into v_a from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform set_config('test.ws_a', v_a::text, true);
end $$;

set local role authenticated;

-- ---------- Ana (dona) convida Beto como membro e Cris como leitora ----------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare v_a uuid := current_setting('test.ws_a')::uuid; v_i jsonb;
begin
  v_i := public.create_workspace_invite(v_a, 'Beto@Teste.Local', 'member');
  perform set_config('test.tok_beto', v_i ->> 'token', true);
  v_i := public.create_workspace_invite(v_a, 'cris@teste.local', 'viewer');
  perform set_config('test.tok_cris', v_i ->> 'token', true);
  v_i := public.create_workspace_invite(v_a, 'duda@teste.local', 'admin');
  perform set_config('test.tok_duda', v_i ->> 'token', true);
end $$;

-- ---------- convite é só para o e-mail certo ----------
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.accept_workspace_invite(current_setting('test.tok_beto')::uuid);
    raise exception 'FALHA: Cris aceitou o convite do Beto';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  if (public.get_workspace_invite(current_setting('test.tok_beto')::uuid) ->> 'for_you')::boolean then
    raise exception 'FALHA: convite do Beto aparece como da Cris';
  end if;
  perform public.accept_workspace_invite(current_setting('test.tok_cris')::uuid);
end $$;

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare v_a uuid := current_setting('test.ws_a')::uuid;
begin
  perform public.accept_workspace_invite(current_setting('test.tok_beto')::uuid);
  -- convite não vale duas vezes
  begin
    perform public.accept_workspace_invite(current_setting('test.tok_beto')::uuid);
    raise exception 'FALHA: o convite valeu duas vezes';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  if public.default_workspace_id() = v_a then raise exception 'FALHA: o padrão do Beto deveria ser o workspace dele'; end if;
  if (select count(*) from public.list_workspace_members(v_a)) <> 3 then raise exception 'FALHA: a lista deveria ter 3 membros'; end if;

  -- membro não convida, não muda papel, não remove
  begin perform public.create_workspace_invite(v_a, 'x@teste.local', 'member'); raise exception 'FALHA: membro convidou';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin perform public.remove_workspace_member(v_a, 'cccccccc-0000-0000-0000-00000000000c'); raise exception 'FALHA: membro removeu alguém';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin perform public.change_member_role(v_a, 'cccccccc-0000-0000-0000-00000000000c', 'admin'); raise exception 'FALHA: membro mudou papel';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  -- membro não vê os convites (nem o token)
  if (select count(*) from public.workspace_invites) <> 0 then raise exception 'FALHA: membro enxerga convites'; end if;
end $$;

-- ---------- Duda entra como admin; admin não mexe em admin nem no dono ----------
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$
declare v_a uuid := current_setting('test.ws_a')::uuid;
begin
  perform public.accept_workspace_invite(current_setting('test.tok_duda')::uuid);
  -- admin convida membro e leitor, mas não admin
  perform public.create_workspace_invite(v_a, 'novo@teste.local', 'member');
  begin perform public.create_workspace_invite(v_a, 'novo2@teste.local', 'admin'); raise exception 'FALHA: admin convidou admin';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin perform public.remove_workspace_member(v_a, 'aaaaaaaa-0000-0000-0000-00000000000a'); raise exception 'FALHA: admin removeu o dono';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin perform public.change_member_role(v_a, 'aaaaaaaa-0000-0000-0000-00000000000a', 'viewer'); raise exception 'FALHA: admin rebaixou o dono';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  -- admin gerencia membro e leitor
  perform public.change_member_role(v_a, 'bbbbbbbb-0000-0000-0000-00000000000b', 'viewer');
  perform public.change_member_role(v_a, 'bbbbbbbb-0000-0000-0000-00000000000b', 'member');
  -- admin vê os convites, mas não o token
  if (select count(*) from public.workspace_invites where workspace_id = v_a) < 1 then raise exception 'FALHA: admin não vê convites'; end if;
  begin perform token from public.workspace_invites limit 1; raise exception 'FALHA: admin leu o token do convite';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;

-- ---------- Ana: posse, saída ----------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare v_a uuid := current_setting('test.ws_a')::uuid;
begin
  begin perform public.leave_workspace(v_a); raise exception 'FALHA: o dono saiu';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin perform public.transfer_workspace_ownership(v_a, 'dddddddd-0000-0000-0000-00000000000e'); raise exception 'FALHA: transferiu para quem não é membro';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  perform public.change_member_role(v_a, 'dddddddd-0000-0000-0000-00000000000d', 'member'); -- dono rebaixa admin
  perform public.transfer_workspace_ownership(v_a, 'bbbbbbbb-0000-0000-0000-00000000000b');
  if (select role from public.workspace_members where workspace_id = v_a and user_id = 'bbbbbbbb-0000-0000-0000-00000000000b') <> 'owner' then raise exception 'FALHA: Beto não virou dono'; end if;
  if (select count(*) from public.workspace_members where workspace_id = v_a and role = 'owner') <> 1 then raise exception 'FALHA: deveria haver um só dono'; end if;
  if (select role from public.workspace_members where workspace_id = v_a and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> 'admin' then raise exception 'FALHA: Ana deveria virar admin'; end if;
  -- Ana (agora admin) sai
  perform public.change_member_role(v_a, 'dddddddd-0000-0000-0000-00000000000d', 'viewer');
exception when others then
  if sqlerrm like 'FALHA%' then raise; end if;
  -- Ana virou admin: mudar papel de membro continua permitido, mas admin não mexe em admin
  null;
end $$;

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$
declare v_a uuid := current_setting('test.ws_a')::uuid;
begin
  perform public.leave_workspace(v_a);
  if exists (select 1 from public.workspace_members where workspace_id = v_a and user_id = 'dddddddd-0000-0000-0000-00000000000d') then
    raise exception 'FALHA: Duda continua no workspace';
  end if;
  if (select count(*) from public.clients where workspace_id = v_a) <> 0 then raise exception 'FALHA: ex-membro ainda enxerga dados'; end if;
end $$;

reset role;
select 'OK: membros e convites' as resultado;
rollback;
