import type { Client, Contract, Project, Proposal, Quote } from '@/types/database.types'
import { defaultClauses, type ContractParams } from './contract'

/**
 * Atendimento = o caminho de um trabalho, do cliente ao projeto. Não tem tabela própria:
 * é a proposta e tudo que já nasceu dela (assinatura, orçamento com Pix, contrato, projeto).
 * Por isso o sistema "guarda onde você parou" sem nada a mais para manter.
 */
export const ENGAGEMENT_STEPS = ['Cliente', 'Proposta', 'Assinatura', 'Cobrança', 'Contrato', 'Projeto', 'Pronto'] as const
export type EngagementStep = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface EngagementData {
  clients: Client[]
  quotes: Quote[]
  contracts: Contract[]
  projects: Project[]
}

export interface Engagement {
  proposal: Proposal
  client?: Client
  quote?: Quote
  contract?: Contract
  project?: Project
  /** Etapas concluídas (mesma ordem de ENGAGEMENT_STEPS). */
  done: boolean[]
  /** Primeira etapa ainda aberta; 6 (Pronto) quando tudo foi feito. */
  step: EngagementStep
}

export const proposalIsSigned = (p: Pick<Proposal, 'status' | 'signed_at'>) => p.status === 'signed' || p.status === 'approved' || !!p.signed_at
export const contractIsSigned = (c: Pick<Contract, 'status'>) => c.status === 'signed' || c.status === 'active'

export function engagementOf(proposal: Proposal, data: EngagementData): Engagement {
  const client = data.clients.find((c) => c.id === proposal.client_id)
  const quote = data.quotes.find((q) => q.proposal_id === proposal.id)
  const contract = data.contracts.find((c) => c.proposal_id === proposal.id)
  const project = data.projects.find((p) => p.proposal_id === proposal.id)

  const done = [!!client, true, proposalIsSigned(proposal), !!quote, !!contract && contractIsSigned(contract), !!project]
  const first = done.findIndex((d) => !d)
  return { proposal, client, quote, contract, project, done: [...done, first === -1], step: (first === -1 ? 6 : first) as EngagementStep }
}

/** Propostas rejeitadas ficam fora: o atendimento acabou. */
export const isOpenEngagement = (e: Engagement) => e.proposal.status !== 'rejected' && e.step < 6

/** Valores padrão do contrato gerado direto no atendimento (as cláusulas podem ser refinadas no gerador). */
export const defaultContractParams = (title: string, objectDetails: string): ContractParams => ({
  title,
  services: ['maintenance', 'data'],
  objectDetails,
  executionDays: 30,
  termMonths: 12,
  monthlyAmount: 0,
  infoDeadlineDays: 7,
  infoGraceDays: 3,
  infoDailyFee: 90,
  revisionLimit: 2,
  paymentDays: 5,
  latePenaltyPct: 2,
  terminationPenaltyPct: 20,
  noticeDays: 15,
  warrantyDays: 30,
  responseHours: 24,
  forum: '',
  clauses: defaultClauses,
})
