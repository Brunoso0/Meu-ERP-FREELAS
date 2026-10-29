-- =====================================================================
-- 028: limpeza técnica.
--
-- 1) profiles guarda só o que é pessoal. Os dados da empresa (Minha empresa,
--    cobrança, nota fiscal, Pix, assinatura) vivem em workspaces desde a 020 e
--    o app já lê e grava lá; as colunas antigas de profiles eram cópia morta.
-- 2) Um registro só pode apontar para outro do MESMO workspace. As políticas
--    de acesso já impedem ver dados de outro workspace, mas nada impedia
--    gravar, por exemplo, um client_id de outra empresa.
-- =====================================================================

alter table public.profiles
  drop column if exists company_name,
  drop column if exists document,
  drop column if exists phone,
  drop column if exists pix_key,
  drop column if exists pix_qr_image,
  drop column if exists signature_image,
  drop column if exists billing_provider,
  drop column if exists billing_fine_pct,
  drop column if exists billing_interest_pct,
  drop column if exists billing_discount_pct,
  drop column if exists billing_discount_days,
  drop column if exists billing_types,
  drop column if exists billing_notify,
  drop column if exists nfse_services,
  drop column if exists nfse_observations,
  drop column if exists nfse_regime,
  drop column if exists nfse_taxes;

-- ---------------------------------------------------------------------
-- Mesmo workspace. Argumentos do gatilho: 'coluna:tabela', um por vínculo.
-- SECURITY DEFINER para conferir a linha apontada mesmo sem poder vê-la, e
-- a mensagem não diz se ela existe em outro workspace.
-- ---------------------------------------------------------------------
create or replace function public.enforce_same_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  arg text;
  col text;
  ref text;
  ref_id uuid;
  ref_ws uuid;
begin
  foreach arg in array tg_argv loop
    col := split_part(arg, ':', 1);
    ref := split_part(arg, ':', 2);
    ref_id := nullif(to_jsonb(new) ->> col, '')::uuid;
    if ref_id is null then continue; end if;
    -- em UPDATE só confere o vínculo que mudou (linhas antigas não travam outras edições)
    if tg_op = 'UPDATE' and ref_id is not distinct from nullif(to_jsonb(old) ->> col, '')::uuid then continue; end if;
    execute format('select workspace_id from public.%I where id = $1', ref) into ref_ws using ref_id;
    if ref_ws is distinct from new.workspace_id then
      raise exception 'Registro de outro workspace: %', col using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.enforce_same_workspace() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('calendar_events', array['client_id:clients', 'freelancer_id:freelancers']),
      ('contracts', array['client_id:clients', 'proposal_id:proposals']),
      ('financial_transactions', array['client_id:clients', 'contract_id:contracts', 'freelancer_id:freelancers', 'project_id:projects', 'quote_id:quotes']),
      ('gateway_customers', array['client_id:clients']),
      ('projects', array['client_id:clients', 'proposal_id:proposals']),
      ('proposals', array['client_id:clients']),
      ('quote_recurrences', array['client_id:clients', 'last_quote_id:quotes']),
      ('quotes', array['client_id:clients', 'proposal_id:proposals', 'recurrence_id:quote_recurrences']),
      ('tasks', array['freelancer_id:freelancers', 'project_id:projects'])
    ) as v(t, links)
  loop
    execute format('drop trigger if exists zz_same_workspace on public.%I', r.t);
    execute format(
      'create trigger zz_same_workspace before insert or update on public.%I for each row execute function public.enforce_same_workspace(%s)',
      r.t,
      (select string_agg(quote_literal(x), ', ') from unnest(r.links) x)
    );
  end loop;
end $$;
