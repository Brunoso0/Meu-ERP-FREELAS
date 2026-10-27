-- =====================================================================
-- 024: login com Google/GitHub.
--
-- O Google manda o nome em `full_name` (ou `name`), o GitHub em `name`
-- (ou `user_name`). A conta nova usa o primeiro que existir; sem nenhum,
-- a parte do e-mail antes do @, como antes.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_ws uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_name)
  on conflict (id) do nothing;

  insert into public.workspaces (name, created_by, email)
  values (coalesce(nullif(btrim(v_name), ''), 'Meu workspace'), new.id, new.email)
  returning id into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, new.id, 'owner');
  return new;
end;
$$;
