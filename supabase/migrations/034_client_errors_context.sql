-- Registro de erros, versão 2: contexto suficiente para reproduzir o problema.
-- Além de mensagem e pilha, guarda de onde veio o erro (tela quebrou, promessa, rede, consulta),
-- em que workspace, em que tela e navegador, e o rastro curto do que a pessoa fazia antes
-- (telas visitadas e chamadas de rede com o id trocado por :id). Nunca guarda texto digitado,
-- e-mail, nome ou valores de campos. Conta também quantas pessoas diferentes foram afetadas.

alter table public.client_errors
  add column kind text,
  add column workspace_id uuid,
  add column context jsonb,
  add column breadcrumbs jsonb,
  add column user_ids uuid[] not null default '{}';

drop function if exists public.report_client_error(text, text, text, text, text);

create or replace function public.report_client_error(
  p_message     text,
  p_stack       text default null,
  p_path        text default null,
  p_user_agent  text default null,
  p_app_version text default null,
  p_kind        text default null,
  p_workspace   uuid default null,
  p_context     jsonb default null,
  p_breadcrumbs jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text := left(coalesce(nullif(btrim(p_message), ''), 'erro sem mensagem'), 500);
  v_stack   text := left(p_stack, 3000);
  v_path    text := left(regexp_replace(coalesce(p_path, ''), '[?#].*$', ''), 200);
  v_fp      text := md5(v_message || '|' || coalesce(left(v_stack, 400), ''));
  v_uid     uuid := auth.uid();
  v_ctx     jsonb := case when p_context is null then null
                          when length(p_context::text) > 4000 then jsonb_build_object('truncado', true)
                          else p_context end;
  v_crumbs  jsonb := case when p_breadcrumbs is null then null
                          when length(p_breadcrumbs::text) > 6000 then jsonb_build_object('truncado', true)
                          else p_breadcrumbs end;
begin
  -- contra enchente (bug em laço ou abuso): passou de 500 erros novos na última hora, só conta os já conhecidos
  if not exists (select 1 from public.client_errors where fingerprint = v_fp)
     and (select count(*) from public.client_errors where first_seen > now() - interval '1 hour') >= 500 then
    return;
  end if;

  insert into public.client_errors (fingerprint, message, stack, path, user_agent, app_version, user_id, kind, workspace_id, context, breadcrumbs, user_ids)
  values (v_fp, v_message, v_stack, v_path, left(p_user_agent, 300), left(p_app_version, 40), v_uid, left(p_kind, 30), p_workspace, v_ctx, v_crumbs,
          case when v_uid is null then '{}' else array[v_uid] end)
  on conflict (fingerprint) do update
    set count = public.client_errors.count + 1,
        last_seen = now(),
        path = excluded.path,
        user_agent = excluded.user_agent,
        app_version = coalesce(excluded.app_version, public.client_errors.app_version),
        kind = coalesce(excluded.kind, public.client_errors.kind),
        workspace_id = coalesce(excluded.workspace_id, public.client_errors.workspace_id),
        context = coalesce(excluded.context, public.client_errors.context),
        breadcrumbs = coalesce(excluded.breadcrumbs, public.client_errors.breadcrumbs),
        user_id = coalesce(excluded.user_id, public.client_errors.user_id),
        user_ids = case
          when v_uid is null or v_uid = any (public.client_errors.user_ids) or cardinality(public.client_errors.user_ids) >= 50
            then public.client_errors.user_ids
          else public.client_errors.user_ids || v_uid end;

  if random() < 0.02 then
    delete from public.client_errors where last_seen < now() - interval '90 days';
  end if;
end;
$$;

revoke all on function public.report_client_error(text, text, text, text, text, text, uuid, jsonb, jsonb) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text, uuid, jsonb, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
