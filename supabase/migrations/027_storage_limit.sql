-- =====================================================================
-- 027: limite de armazenamento do plano (comprovantes).
--
-- O plano já mostrava os MB usados (plan_usage); agora o limite vale:
--   - o envio é recusado quando o workspace já está no limite do plano
--     (política de insert em storage.objects);
--   - o app pergunta antes de enviar, com o tamanho do arquivo, para
--     explicar o motivo em vez de mostrar um erro técnico.
-- Nada é apagado: quem passou do limite (ex.: trial que acabou) só não
-- consegue enviar novos arquivos até liberar espaço ou mudar de plano.
-- =====================================================================

-- bytes usados pelo workspace no bucket de comprovantes (uso interno)
create or replace function public.storage_used_bytes(p_workspace uuid)
returns numeric
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(sum((o.metadata ->> 'size')::numeric), 0)
    from storage.objects o
   where o.bucket_id = 'proofs'
     and (storage.foldername(o.name))[1] = p_workspace::text;
$$;
revoke all on function public.storage_used_bytes(uuid) from public, anon, authenticated;

-- cabe mais p_extra bytes no plano em vigor? (sem limite = sempre cabe; uso interno)
create or replace function public.storage_room(p_workspace uuid, p_extra numeric)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_limit integer := public.plan_limit(p_workspace, 'storage_mb');
begin
  if p_workspace is null then
    return false;
  end if;
  if v_limit is null then
    return true;
  end if;
  return public.storage_used_bytes(p_workspace) + greatest(p_extra, 0) <= v_limit::numeric * 1048576;
end;
$$;
revoke all on function public.storage_room(uuid, numeric) from public, anon, authenticated;

-- usada pela política de envio: o caminho do arquivo começa pelo workspace
create or replace function public.can_store(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select public.storage_room(public.storage_workspace(p_name), 1);
$$;
revoke all on function public.can_store(text) from public, anon;
grant execute on function public.can_store(text) to authenticated;

-- usada pelo app antes de enviar: cabe um arquivo deste tamanho?
create or replace function public.storage_has_room(p_workspace uuid, p_bytes bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_member(p_workspace) then
    raise exception 'unauthorized';
  end if;
  return public.storage_room(p_workspace, p_bytes);
end;
$$;
revoke all on function public.storage_has_room(uuid, bigint) from public, anon;
grant execute on function public.storage_has_room(uuid, bigint) to authenticated;

drop policy if exists "proofs_insert" on storage.objects;
create policy "proofs_insert" on storage.objects
  for insert with check (
    bucket_id = 'proofs'
    and public.is_member(public.storage_workspace(name), 'member')
    and public.can_store(name)
  );
