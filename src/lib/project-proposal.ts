import type { Project, ProjectStatus, Proposal } from '@/types/database.types'
import { deleteRow, insertRow, listRows, updateRow } from './db'

/**
 * Projeto e proposta andam juntos, um para um (`projects.proposal_id`):
 * - proposta nova ganha o seu projeto (em planejamento);
 * - projeto novo, criado na tela de Projetos, ganha a sua proposta;
 * - excluir um exclui o outro, desde que nenhum dos dois tenha histórico
 *   (demandas, recebimentos, orçamento ou contrato).
 */

const sameMoney = (a: unknown, b: unknown) => Math.round(Number(a ?? 0) * 100) === Math.round(Number(b ?? 0) * 100)
const agreed = (status: Proposal['status']) => status === 'approved' || status === 'signed'
/** Situação do projeto que nasce da proposta: combinado, recusado ou ainda em planejamento. */
const projectStatusFor = (status: Proposal['status']): ProjectStatus => (agreed(status) ? 'in_progress' : status === 'rejected' ? 'cancelled' : 'planning')

export async function projectOfProposal(proposalId: string) {
  return (await listRows('projects')).find((p) => p.proposal_id === proposalId) ?? null
}

/**
 * Garante o projeto da proposta. Proposta aprovada ou assinada tira o projeto
 * do planejamento (recusada o cancela); valor e cliente da proposta acompanham o projeto enquanto
 * ele não foi concluído. O título do projeto não é mexido (pode ter outro nome).
 * Devolve true se criou ou alterou o projeto.
 */
export async function syncProjectFromProposal(proposal: Proposal): Promise<boolean> {
  const project = await projectOfProposal(proposal.id)
  if (!project) {
    await insertRow('projects', {
      title: proposal.title,
      client_id: proposal.client_id,
      proposal_id: proposal.id,
      description: proposal.scope_text,
      budget: Number(proposal.total_amount),
      status: projectStatusFor(proposal.status),
      deadline: null,
    })
    return true
  }
  const patch: Partial<Project> = {}
  if (project.status !== 'completed' && project.status !== 'cancelled') {
    if (!sameMoney(project.budget, proposal.total_amount)) patch.budget = Number(proposal.total_amount)
    if (project.client_id !== proposal.client_id) patch.client_id = proposal.client_id
    if (project.status === 'planning' && projectStatusFor(proposal.status) !== 'planning') patch.status = projectStatusFor(proposal.status)
  }
  if (!Object.keys(patch).length) return false
  await updateRow('projects', project.id, patch)
  return true
}

/** Proposta do projeto que já está combinado (fora do planejamento) entra como aprovada. */
const proposalStatusFor = (status: ProjectStatus): Proposal['status'] => (status === 'planning' ? 'draft' : 'approved')

/**
 * Garante a proposta do projeto criado sem ela (pela tela de Projetos), com o
 * título, a descrição e o orçamento do projeto como item único. Devolve true
 * se criou.
 */
export async function ensureProposalForProject(project: Project): Promise<boolean> {
  if (project.proposal_id) return false
  const budget = Number(project.budget ?? 0)
  const proposal = await insertRow('proposals', {
    client_id: project.client_id,
    title: project.title,
    scope_text: project.description,
    content: { items: [{ description: project.title, quantity: 1, unit_price: budget }] },
    total_amount: budget,
    status: proposalStatusFor(project.status),
    payment_terms: null,
  })
  await updateRow('projects', project.id, { proposal_id: proposal.id })
  return true
}

/**
 * Antes de excluir um projeto: a proposta dele vai junto, a não ser que ela
 * já tenha orçamento ou contrato (aí o projeto também fica). Devolve a
 * proposta que deve ser excluída depois do projeto.
 */
export async function proposalToRemoveWithProject(projectId: string): Promise<string | null> {
  const project = (await listRows('projects')).find((p) => p.id === projectId)
  if (!project?.proposal_id) return null
  const [quotes, contracts] = await Promise.all([listRows('quotes'), listRows('contracts')])
  if (quotes.some((q) => q.proposal_id === project.proposal_id) || contracts.some((c) => c.proposal_id === project.proposal_id)) {
    throw new Error('A proposta deste projeto já tem orçamento ou contrato. Para manter o histórico, o projeto não pode ser excluído; marque-o como cancelado.')
  }
  return project.proposal_id
}

/**
 * Antes de excluir uma proposta: o projeto dela vai junto, a não ser que ele
 * já tenha demandas ou recebimentos. Devolve o projeto que deve ser excluído.
 */
export async function projectToRemoveWithProposal(proposalId: string): Promise<string | null> {
  const project = await projectOfProposal(proposalId)
  if (!project) return null
  const [tasks, transactions] = await Promise.all([listRows('tasks'), listRows('financial_transactions')])
  if (tasks.some((t) => t.project_id === project.id) || transactions.some((t) => t.project_id === project.id)) {
    throw new Error(`O projeto "${project.title}" desta proposta já tem demandas ou recebimentos. Para manter o histórico, a proposta não pode ser excluída; marque-a como recusada.`)
  }
  return project.id
}

export const removeLinked = (table: 'projects' | 'proposals', id: string | null) => (id ? deleteRow(table, id) : Promise.resolve())

/** O projeto da proposta já tem recebimentos lançados (gerar orçamento cobraria de novo). */
export async function proposalProjectIsBilled(proposalId: string) {
  const project = await projectOfProposal(proposalId)
  if (!project) return false
  return (await listRows('financial_transactions')).some((t) => t.type === 'income' && t.project_id === project.id)
}
