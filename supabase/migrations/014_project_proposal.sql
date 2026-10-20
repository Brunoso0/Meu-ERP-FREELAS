-- =====================================================================
-- 014: projeto e proposta andam juntos, um para um.
--
-- O app cria o projeto de cada proposta nova e a proposta de cada projeto
-- novo. Aqui: no máximo um projeto por proposta, e os registros antigos sem
-- par ganham o seu (projeto sem proposta ganha uma proposta com o título, a
-- descrição e o orçamento dele; proposta sem projeto ganha um projeto).
--
-- Antes de rodar, ligue à mão os pares que já existem (o projeto criado na
-- tela de Projetos e a proposta do mesmo trabalho), senão eles ganham um
-- par novo cada um e a duplicidade continua.
-- =====================================================================

create unique index if not exists idx_projects_proposal on public.projects (proposal_id) where proposal_id is not null;

do $$
declare
  p record;
  new_id uuid;
begin
  -- projeto sem proposta: proposta com o projeto como item único
  -- (combinado = aprovada, para não gerar orçamento nem cobrança de novo)
  for p in select * from public.projects where proposal_id is null order by created_at loop
    insert into public.proposals (user_id, client_id, title, scope_text, content, total_amount, status, created_at)
    values (
      p.user_id,
      p.client_id,
      p.title,
      p.description,
      jsonb_build_object('items', jsonb_build_array(jsonb_build_object('description', p.title, 'quantity', 1, 'unit_price', coalesce(p.budget, 0)))),
      coalesce(p.budget, 0),
      case when p.status = 'planning' then 'draft' else 'approved' end,
      p.created_at
    )
    returning id into new_id;
    update public.projects set proposal_id = new_id where id = p.id;
  end loop;

  -- proposta sem projeto: projeto com o título e o valor dela
  insert into public.projects (user_id, client_id, proposal_id, title, description, budget, status, created_at)
  select pr.user_id, pr.client_id, pr.id, pr.title, pr.scope_text, pr.total_amount,
         case when pr.status in ('approved', 'signed') then 'in_progress' when pr.status = 'rejected' then 'cancelled' else 'planning' end,
         pr.created_at
    from public.proposals pr
   where not exists (select 1 from public.projects pj where pj.proposal_id = pr.id);
end $$;

notify pgrst, 'reload schema';
