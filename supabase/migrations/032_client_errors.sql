-- Registro de erros do app (sem serviço externo).
--
-- O navegador avisa quando algo quebra (erro de tela, promessa rejeitada) pela função
-- report_client_error. Erros iguais viram uma linha só, com contador e última ocorrência.
-- Ninguém lê a tabela pelo app: quem administra consulta no painel do Supabase (supabase/ERRORS.md).
-- Guardamos só o necessário: mensagem e pilha (cortadas), caminho sem parâmetros, navegador e o id
-- de quem estava logado. Nada de e-mail, nome ou conteúdo das telas.

create table public.client_errors (
  id          bigint generated always as identity primary key,
  fingerprint text not null unique,
  message     text not null,
  stack       text,
  path        text,
  user_agent  text,
  app_version text,
  user_id     uuid references auth.users (id) on delete set null,
  count       integer not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index client_errors_last_seen_idx on public.client_errors (last_seen desc);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;

create or replace function public.report_client_error(
  p_message     text,
  p_stack       text default null,
  p_path        text default null,
  p_user_agent  text default null,
  p_app_version text default null
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
begin
  -- contra enchente (bug em laço ou abuso): passou de 500 erros novos na última hora, só conta os já conhecidos
  if not exists (select 1 from public.client_errors where fingerprint = v_fp)
     and (select count(*) from public.client_errors where first_seen > now() - interval '1 hour') >= 500 then
    return;
  end if;

  insert into public.client_errors (fingerprint, message, stack, path, user_agent, app_version, user_id)
  values (v_fp, v_message, v_stack, v_path, left(p_user_agent, 300), left(p_app_version, 40), auth.uid())
  on conflict (fingerprint) do update
    set count = public.client_errors.count + 1,
        last_seen = now(),
        path = excluded.path,
        user_id = coalesce(excluded.user_id, public.client_errors.user_id);

  -- limpeza de vez em quando: 90 dias bastam
  if random() < 0.02 then
    delete from public.client_errors where last_seen < now() - interval '90 days';
  end if;
end;
$$;

revoke all on function public.report_client_error(text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text) to anon, authenticated;
