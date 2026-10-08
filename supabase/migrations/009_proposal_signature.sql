-- =====================================================================
-- Assinatura da proposta pelo cliente, por um link público.
--
-- O link carrega um token aleatório (share_token). Quem não está logado
-- continua sem acesso a nenhuma tabela: a página pública fala só com as
-- duas funções abaixo, que devolvem uma única proposta (a do token) e
-- registram a assinatura uma única vez.
-- =====================================================================

alter table public.proposals
  add column if not exists share_token uuid,
  add column if not exists signed_at timestamptz,
  add column if not exists signer_name text,
  add column if not exists signer_document text,
  add column if not exists signature_image text,
  add column if not exists signature_method text,
  add column if not exists signature_ip text,
  add column if not exists signature_user_agent text,
  add column if not exists signature_hash text;

create unique index if not exists idx_proposals_share_token on public.proposals (share_token) where share_token is not null;

alter table public.proposals drop constraint if exists proposals_status_check;
alter table public.proposals
  add constraint proposals_status_check
  check (status in ('draft', 'sent', 'awaiting_signature', 'signed', 'approved', 'rejected'));

alter table public.proposals drop constraint if exists proposals_signature_check;
alter table public.proposals
  add constraint proposals_signature_check
  check (
    (signature_method is null or signature_method in ('link', 'manual'))
    and (signature_image is null or (signature_image like 'data:image/png;base64,%' and length(signature_image) <= 200000))
    and (signer_name is null or length(signer_name) <= 120)
    and (signer_document is null or length(signer_document) <= 20)
  );

-- ---------------------------------------------------------------------
-- Leitura pública: só a proposta do token, e só enquanto o link vale
-- (aguardando assinatura, ou já assinada).
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
      select jsonb_build_object('full_name', pr.full_name, 'company_name', pr.company_name, 'document', pr.document, 'email', pr.email, 'phone', pr.phone)
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
-- Assinatura pública: uma vez só, com nome, CPF/CNPJ e a assinatura
-- desenhada. Guarda data, IP, navegador e um resumo (hash) do conteúdo
-- assinado, como evidência.
-- ---------------------------------------------------------------------
create or replace function public.sign_shared_proposal(p_token uuid, p_name text, p_document text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
  v_headers json;
  v_name text := btrim(coalesce(p_name, ''));
  v_document text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  v_now timestamptz := now();
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

  select * into v_proposal from public.proposals where share_token = p_token for update;
  if not found then
    raise exception 'Link de assinatura inválido.';
  end if;
  if v_proposal.status <> 'awaiting_signature' then
    raise exception 'Esta proposta não está aguardando assinatura.';
  end if;

  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  update public.proposals
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
             concat_ws('|', v_proposal.id, v_proposal.proposal_number, v_proposal.title, coalesce(v_proposal.scope_text, ''), v_proposal.content::text,
                       v_proposal.total_amount, coalesce(v_proposal.payment_terms, ''), v_name, v_document, v_now),
             'UTF8')),
           'hex')
   where id = v_proposal.id;

  return jsonb_build_object('signed_at', v_now);
end;
$$;

revoke all on function public.get_shared_proposal(uuid) from public;
revoke all on function public.sign_shared_proposal(uuid, text, text, text) from public;
grant execute on function public.get_shared_proposal(uuid) to anon, authenticated;
grant execute on function public.sign_shared_proposal(uuid, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
