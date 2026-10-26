-- =====================================================================
-- 021: gestão de membros e convites do workspace.
--
-- Tudo passa por funções (SECURITY DEFINER) que conferem o papel de quem
-- chama; as tabelas workspace_members e workspace_invites não aceitam
-- gravação direta pela API.
--
-- Regras de papéis:
--   - só o dono dá ou tira o papel de admin e remove admins;
--   - o admin convida e gerencia membros e leitores;
--   - o dono não sai nem é removido: transfere a posse antes;
--   - o convite vale para o e-mail convidado, por 7 dias, uma vez.
--
-- O envio do e-mail do convite fica para a fase de cadastro: por ora o
-- admin copia o link e manda.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quem está no workspace (nome e e-mail vêm do perfil, que cada pessoa só
-- lê da própria linha; por isso a lista passa por uma função)
-- ---------------------------------------------------------------------
create or replace function public.list_workspace_members(p_workspace uuid)
returns table (user_id uuid, role text, full_name text, email text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.role, p.full_name, p.email, m.created_at
    from public.workspace_members m
    left join public.profiles p on p.id = m.user_id
   where m.workspace_id = p_workspace
     and public.is_member(p_workspace)
   order by public.role_rank(m.role) desc, m.created_at;
$$;

-- ---------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------
create or replace function public.create_workspace_invite(p_workspace uuid, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invite public.workspace_invites%rowtype;
begin
  if auth.uid() is null or not public.is_member(p_workspace, 'admin') then
    raise exception 'Você não tem permissão para convidar neste workspace.';
  end if;
  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'Papel inválido.';
  end if;
  if p_role = 'admin' and not public.is_member(p_workspace, 'owner') then
    raise exception 'Só o dono pode convidar um administrador.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Informe um e-mail válido.';
  end if;
  if exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
     where m.workspace_id = p_workspace and lower(u.email) = v_email
  ) then
    raise exception 'Esta pessoa já faz parte do workspace.';
  end if;
  if (select count(*) from public.workspace_invites
       where workspace_id = p_workspace and accepted_at is null and expires_at > now()) >= 20 then
    raise exception 'Há convites demais em aberto. Cancele alguns antes de enviar outro.';
  end if;

  -- um convite aberto por e-mail: o novo substitui o anterior
  delete from public.workspace_invites
   where workspace_id = p_workspace and lower(email) = v_email and accepted_at is null;

  insert into public.workspace_invites (workspace_id, email, role, invited_by)
  values (p_workspace, v_email, p_role, auth.uid())
  returning * into v_invite;

  return jsonb_build_object('id', v_invite.id, 'token', v_invite.token, 'email', v_invite.email, 'role', v_invite.role, 'expires_at', v_invite.expires_at);
end;
$$;

create or replace function public.revoke_workspace_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from public.workspace_invites where id = p_invite and accepted_at is null;
  if v_ws is null or not public.is_member(v_ws, 'admin') then
    raise exception 'Convite não encontrado.';
  end if;
  delete from public.workspace_invites where id = p_invite;
end;
$$;

-- o que a pessoa convidada vê antes de aceitar
create or replace function public.get_workspace_invite(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'workspace', w.name,
    'role', i.role,
    'email', i.email,
    'expired', i.expires_at <= now(),
    'accepted', i.accepted_at is not null,
    'for_you', lower(i.email) = lower(coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
  )
  from public.workspace_invites i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token and auth.uid() is not null;
$$;

create or replace function public.accept_workspace_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.workspace_invites%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para aceitar o convite.';
  end if;
  select * into v_invite from public.workspace_invites where token = p_token for update;
  if not found or v_invite.accepted_at is not null or v_invite.expires_at <= now() then
    raise exception 'Este convite não é mais válido. Peça um novo a quem convidou.';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from lower(v_invite.email) then
    raise exception 'Este convite foi enviado para outro e-mail. Entre com %.', v_invite.email;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, auth.uid(), v_invite.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.workspace_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Membros: papel, remoção, saída e posse
-- ---------------------------------------------------------------------
create or replace function public.change_member_role(p_workspace uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'Papel inválido.';
  end if;
  if auth.uid() is null or not public.is_member(p_workspace, 'admin') then
    raise exception 'Você não tem permissão para alterar papéis.';
  end if;
  select role into v_current from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  if v_current is null then
    raise exception 'Membro não encontrado.';
  end if;
  if v_current = 'owner' then
    raise exception 'O papel do dono só muda ao transferir a posse.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio papel.';
  end if;
  if (p_role = 'admin' or v_current = 'admin') and not public.is_member(p_workspace, 'owner') then
    raise exception 'Só o dono pode dar ou tirar o papel de administrador.';
  end if;
  update public.workspace_members set role = p_role where workspace_id = p_workspace and user_id = p_user;
end;
$$;

create or replace function public.remove_workspace_member(p_workspace uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null or not public.is_member(p_workspace, 'admin') then
    raise exception 'Você não tem permissão para remover membros.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Para sair do workspace, use a opção "Sair".';
  end if;
  select role into v_role from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  if v_role is null then
    raise exception 'Membro não encontrado.';
  end if;
  if v_role = 'owner' then
    raise exception 'O dono não pode ser removido.';
  end if;
  if v_role = 'admin' and not public.is_member(p_workspace, 'owner') then
    raise exception 'Só o dono pode remover um administrador.';
  end if;
  delete from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  -- os aparelhos da pessoa não recebem mais lembretes deste workspace (os lembretes
  -- passam a seguir a lista de membros); nada mais a limpar aqui
end;
$$;

create or replace function public.leave_workspace(p_workspace uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.workspace_members where workspace_id = p_workspace and user_id = auth.uid();
  if v_role is null then
    raise exception 'Você não faz parte deste workspace.';
  end if;
  if v_role = 'owner' then
    raise exception 'O dono não pode sair. Transfira a posse ou exclua o workspace.';
  end if;
  delete from public.workspace_members where workspace_id = p_workspace and user_id = auth.uid();
end;
$$;

create or replace function public.transfer_workspace_ownership(p_workspace uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_member(p_workspace, 'owner') then
    raise exception 'Só o dono pode transferir a posse.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você já é o dono.';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace and user_id = p_user) then
    raise exception 'A pessoa precisa ser membro do workspace.';
  end if;
  -- só pode haver um dono: rebaixa o atual antes de promover o novo
  update public.workspace_members set role = 'admin' where workspace_id = p_workspace and user_id = auth.uid();
  update public.workspace_members set role = 'owner' where workspace_id = p_workspace and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões: só quem está logado chama; ninguém anônimo
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'list_workspace_members(uuid)',
    'create_workspace_invite(uuid, text, text)',
    'revoke_workspace_invite(uuid)',
    'get_workspace_invite(uuid)',
    'accept_workspace_invite(uuid)',
    'change_member_role(uuid, uuid, text)',
    'remove_workspace_member(uuid, uuid)',
    'leave_workspace(uuid)',
    'transfer_workspace_ownership(uuid, uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
