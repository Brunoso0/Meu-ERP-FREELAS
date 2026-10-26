-- =====================================================================
-- 022: criar e excluir workspace.
--
-- Excluir apaga tudo que é do workspace: as tabelas de dados caem em
-- cascata (on delete cascade da migração 020) e os segredos do Vault
-- (chave do gateway de cobrança) são removidos aqui, porque o Vault não
-- tem chave estrangeira. Os arquivos do Storage não podem ser apagados
-- por SQL (o Supabase bloqueia); o app os remove pela API antes de chamar
-- esta função.
--
-- Só o dono exclui, e precisa digitar o nome do workspace.
-- =====================================================================

create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para criar um workspace.';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'Informe um nome de até 120 caracteres.';
  end if;
  if (select count(*) from public.workspace_members where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'Você já é dono de 5 workspaces, o limite por conta.';
  end if;

  insert into public.workspaces (name, created_by, email)
  values (v_name, auth.uid(), (select email from auth.users where id = auth.uid()))
  returning id into v_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end;
$$;

create or replace function public.delete_workspace(p_workspace uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text;
begin
  if auth.uid() is null or not public.is_member(p_workspace, 'owner') then
    raise exception 'Só o dono pode excluir o workspace.';
  end if;
  select name into v_name from public.workspaces where id = p_workspace;
  if btrim(coalesce(p_confirm_name, '')) is distinct from v_name then
    raise exception 'O nome digitado não confere com o do workspace.';
  end if;

  -- segredos do Vault (chaves de gateway de cobrança) deste workspace
  delete from vault.secrets
   where id in (select api_key_secret_id from public.billing_integrations where workspace_id = p_workspace);

  -- o resto cai em cascata (dados, membros, convites, cobranças, recorrências)
  delete from public.workspaces where id = p_workspace;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['create_workspace(text)', 'delete_workspace(uuid, text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
