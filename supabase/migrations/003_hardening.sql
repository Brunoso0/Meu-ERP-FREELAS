-- =====================================================================
-- Endurecimento de segurança (sistema de uso individual)
-- O RLS já isola os dados por usuário; aqui fechamos o que sobra em volta.
-- =====================================================================

-- 1. Visitantes sem login não têm privilégio nenhum nas tabelas.
--    Antes o RLS devolvia lista vazia; agora a API recusa a requisição.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- 2. Usuário logado só precisa ler e escrever linhas; nada de truncate,
--    triggers ou references pela API.
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- 3. Funções internas (triggers) não são chamáveis pela API e usam um
--    search_path fixo, para não resolverem objetos de outro schema.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_proposal_number() from public, anon, authenticated;
revoke execute on function public.set_quote_number() from public, anon, authenticated;
alter function public.set_proposal_number() set search_path = public;
alter function public.set_quote_number() set search_path = public;

-- 4. O id do dono nunca muda depois de criado (evita "doar" uma linha
--    para outro usuário ou trocar o id do próprio profile).
create or replace function public.keep_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'profiles' then
    new.id := old.id;
  else
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_owner() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'clients', 'freelancers', 'proposals', 'quotes', 'projects', 'tasks',
    'calendar_events', 'financial_transactions', 'contracts', 'goals'
  ]
  loop
    execute format('drop trigger if exists trg_keep_owner on public.%I', t);
    execute format('create trigger trg_keep_owner before update on public.%I for each row execute function public.keep_owner()', t);
  end loop;
end;
$$;

-- 5. Comprovantes: no máximo 5 MB e só imagem ou PDF, validado pelo
--    Storage (o app também valida, mas o servidor é quem manda).
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
 where id = 'proofs';
