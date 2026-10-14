-- =====================================================================
-- Assinatura do contrato pelo cliente por link público (igual à da
-- proposta) e a assinatura do próprio emitente, guardada no perfil para
-- sair nas propostas e nos contratos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Assinatura do emitente (Minha empresa)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists signature_image text;

alter table public.profiles drop constraint if exists profiles_signature_image_check;
alter table public.profiles
  add constraint profiles_signature_image_check
  check (signature_image is null or (signature_image like 'data:image/png;base64,%' and length(signature_image) <= 200000));

-- ---------------------------------------------------------------------
-- Contratos: link de assinatura e dados do aceite
-- ---------------------------------------------------------------------
alter table public.contracts
  add column if not exists share_token uuid,
  add column if not exists signed_at timestamptz,
  add column if not exists signer_name text,
  add column if not exists signer_document text,
  add column if not exists signature_image text,
  add column if not exists signature_method text,
  add column if not exists signature_ip text,
  add column if not exists signature_user_agent text,
  add column if not exists signature_hash text;

create unique index if not exists idx_contracts_share_token on public.contracts (share_token) where share_token is not null;

alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts
  add constraint contracts_status_check
  check (status in ('draft', 'awaiting_signature', 'signed', 'active', 'terminated'));

alter table public.contracts drop constraint if exists contracts_signature_check;
alter table public.contracts
  add constraint contracts_signature_check
  check (
    (signature_method is null or signature_method in ('link', 'manual'))
    and (signature_image is null or (signature_image like 'data:image/png;base64,%' and length(signature_image) <= 200000))
    and (signer_name is null or length(signer_name) <= 120)
    and (signer_document is null or length(signer_document) <= 20)
  );

-- ---------------------------------------------------------------------
-- Proposta pelo link: passa a levar também a assinatura do emitente.
-- ---------------------------------------------------------------------
create or replace function public.get_shared_proposal(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'proposal', jsonb_build_object(
      'proposal_number', p.proposal_number,
      'title', p.title,
      'scope_text', p.scope_text,
      'content', p.content,
      'total_amount', p.total_amount,
      'validity_days', p.validity_days,
      'payment_terms', p.payment_terms,
      'created_at', p.created_at,
      'status', p.status,
      'signed_at', p.signed_at,
      'signer_name', p.signer_name,
      'signer_document', p.signer_document,
      'signature_image', p.signature_image,
      'signature_method', p.signature_method,
      'signature_ip', p.signature_ip,
      'signature_hash', p.signature_hash
    ),
    'issuer', (
      select jsonb_build_object('full_name', pr.full_name, 'company_name', pr.company_name, 'document', pr.document, 'email', pr.email, 'phone', pr.phone,
                                'signature_image', pr.signature_image)
      from public.profiles pr where pr.id = p.user_id
    ),
    'client', (
      select jsonb_build_object('name', c.name, 'company_name', c.company_name, 'document', c.document, 'email', c.email, 'phone', c.phone)
      from public.clients c where c.id = p.client_id
    )
  )
  from public.proposals p
  where p.share_token = p_token
    and (p.status in ('awaiting_signature', 'signed') or (p.status = 'approved' and p.signed_at is not null));
$$;

-- ---------------------------------------------------------------------
-- Contrato pelo link: leitura (só o contrato do token, enquanto aguarda
-- assinatura ou depois de assinado pelo link).
-- ---------------------------------------------------------------------
create or replace function public.get_shared_contract(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'contract', jsonb_build_object(
      'title', c.title,
      'content_markdown', c.content_markdown,
      'created_at', c.created_at,
      'status', c.status,
      'signed_at', c.signed_at,
      'signer_name', c.signer_name,
      'signer_document', c.signer_document,
      'signature_image', c.signature_image,
      'signature_method', c.signature_method,
      'signature_ip', c.signature_ip,
      'signature_hash', c.signature_hash
    ),
    'issuer', (
      select jsonb_build_object('full_name', pr.full_name, 'company_name', pr.company_name, 'signature_image', pr.signature_image)
      from public.profiles pr where pr.id = c.user_id
    )
  )
  from public.contracts c
  where c.share_token = p_token
    and (c.status = 'awaiting_signature' or (c.signature_method = 'link' and c.status in ('signed', 'active')));
$$;

-- ---------------------------------------------------------------------
-- Contrato pelo link: assinatura. Uma vez só. Contrato com mensalidade
-- já lança as parcelas no financeiro, como acontece ao marcar "assinado"
-- dentro do sistema.
-- ---------------------------------------------------------------------
create or replace function public.sign_shared_contract(p_token uuid, p_name text, p_document text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.contracts%rowtype;
  v_headers json;
  v_name text := btrim(coalesce(p_name, ''));
  v_document text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  v_now timestamptz := now();
  v_months integer;
  v_first date;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'Informe o nome completo de quem assina.';
  end if;
  if length(v_document) not in (11, 14) then
    raise exception 'Informe um CPF ou CNPJ válido.';
  end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) < 500 or length(p_signature) > 200000 then
    raise exception 'Assinatura inválida. Desenhe a assinatura novamente.';
  end if;

  select * into v_contract from public.contracts where share_token = p_token for update;
  if not found then
    raise exception 'Link de assinatura inválido.';
  end if;
  if v_contract.status <> 'awaiting_signature' then
    raise exception 'Este contrato não está aguardando assinatura.';
  end if;

  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  update public.contracts
     set status = 'signed',
         signed_at = v_now,
         signer_name = v_name,
         signer_document = v_document,
         signature_image = p_signature,
         signature_method = 'link',
         signature_ip = nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
         signature_user_agent = left(v_headers ->> 'user-agent', 300),
         signature_hash = encode(
           sha256(convert_to(
             concat_ws('|', v_contract.id, v_contract.title, v_contract.content_markdown, coalesce(v_contract.monthly_amount::text, ''),
                       coalesce(v_contract.term_months::text, ''), v_name, v_document, v_now),
             'UTF8')),
           'hex')
   where id = v_contract.id;

  -- mensalidades: uma por mês de vigência, se ainda não foram lançadas
  v_months := least(coalesce(v_contract.term_months, 0), 120);
  if coalesce(v_contract.monthly_amount, 0) > 0 and v_months >= 1
     and not exists (select 1 from public.financial_transactions t where t.contract_id = v_contract.id) then
    v_first := coalesce(v_contract.first_due_date, (v_now + interval '1 month')::date);
    insert into public.financial_transactions
      (user_id, type, category, description, amount, due_date, payment_date, status, client_id, recurrence_id, installment, installments, contract_id)
    select
      v_contract.user_id, 'income', 'Mensalidade',
      'Mensalidade — ' || regexp_replace(v_contract.title, '^Contrato\s+[—-]\s+', '', 'i'),
      v_contract.monthly_amount,
      (v_first + make_interval(months => i))::date,
      null, 'pending', v_contract.client_id, r.id, i + 1, v_months, v_contract.id
    from generate_series(0, v_months - 1) as i
    cross join (select gen_random_uuid() as id) as r;
  end if;

  return jsonb_build_object('signed_at', v_now);
end;
$$;

revoke all on function public.get_shared_proposal(uuid) from public;
revoke all on function public.get_shared_contract(uuid) from public;
revoke all on function public.sign_shared_contract(uuid, text, text, text) from public;
grant execute on function public.get_shared_proposal(uuid) to anon, authenticated;
grant execute on function public.get_shared_contract(uuid) to anon, authenticated;
grant execute on function public.sign_shared_contract(uuid, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
