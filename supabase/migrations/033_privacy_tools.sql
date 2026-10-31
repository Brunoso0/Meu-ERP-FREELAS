-- Direitos do titular (LGPD): exportar os próprios dados e apagar a conta.

-- Tudo o que a pessoa enxerga nos workspaces de que faz parte, em um JSON só.
-- Segredos (chaves de gateway, tokens de convite, códigos de recuperação) ficam de fora.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid[];
  v_out jsonb;
  t text;
  v_rows jsonb;
begin
  if v_uid is null or not public.mfa_ok() then
    raise exception 'Entre na sua conta para exportar os dados.';
  end if;
  select coalesce(array_agg(workspace_id), '{}') into v_ws from public.workspace_members where user_id = v_uid;

  v_out := jsonb_build_object(
    'exportado_em', now(),
    'conta', (select jsonb_build_object('id', u.id, 'email', u.email, 'criada_em', u.created_at) from auth.users u where u.id = v_uid),
    'perfil', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'workspaces', (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from public.workspaces w where w.id = any (v_ws)),
    'membros', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.workspace_members m where m.workspace_id = any (v_ws))
  );

  foreach t in array array['clients','projects','proposals','tasks','calendar_events','financial_transactions','contracts','goals','quotes','quote_recurrences','freelancers']
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x where x.workspace_id = any ($1)', t) into v_rows using v_ws;
    v_out := v_out || jsonb_build_object(t, v_rows);
  end loop;
  return v_out;
end;
$$;

-- Apaga a conta e os workspaces em que a pessoa é a única integrante. Quem é dono de um
-- workspace com outras pessoas precisa antes transferir a posse ou removê-las.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
begin
  if v_uid is null or not public.mfa_ok() then
    raise exception 'Entre na sua conta para apagá-la.';
  end if;

  if exists (
    select 1
    from public.workspace_members o
    where o.user_id = v_uid and o.role = 'owner'
      and exists (select 1 from public.workspace_members x where x.workspace_id = o.workspace_id and x.user_id <> v_uid)
  ) then
    raise exception 'Você é dono de um workspace com outras pessoas. Transfira a posse ou remova os membros antes de apagar a conta.';
  end if;

  for v_ws in select workspace_id from public.workspace_members where user_id = v_uid and role = 'owner'
  loop
    delete from vault.secrets
     where id in (select api_key_secret_id from public.billing_integrations where workspace_id = v_ws);
    delete from public.workspaces where id = v_ws;
  end loop;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
