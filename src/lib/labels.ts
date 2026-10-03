import type {
  ClientStatus,
  ContractStatus,
  EventType,
  GoalCategory,
  ProjectStatus,
  ProposalStatus,
  TaskPriority,
  TaskStatus,
  TransactionStatus,
} from '@/types/database.types'

export type Tone = 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'indigo'

type LabelMap<K extends string> = Record<K, { label: string; tone: Tone }>

export const clientStatus: LabelMap<ClientStatus> = {
  active: { label: 'Ativo', tone: 'green' },
  inactive: { label: 'Inativo', tone: 'slate' },
  lead: { label: 'Lead', tone: 'blue' },
}

export const freelancerStatus: LabelMap<'active' | 'inactive'> = {
  active: { label: 'Disponível', tone: 'green' },
  inactive: { label: 'Inativo', tone: 'slate' },
}

export const proposalStatus: LabelMap<ProposalStatus> = {
  draft: { label: 'Rascunho', tone: 'slate' },
  sent: { label: 'Enviada', tone: 'blue' },
  approved: { label: 'Aprovada', tone: 'green' },
  rejected: { label: 'Recusada', tone: 'red' },
}

export const projectStatus: LabelMap<ProjectStatus> = {
  planning: { label: 'Planejamento', tone: 'slate' },
  in_progress: { label: 'Em andamento', tone: 'blue' },
  review: { label: 'Em revisão', tone: 'amber' },
  completed: { label: 'Concluído', tone: 'green' },
  cancelled: { label: 'Cancelado', tone: 'red' },
}

export const taskStatus: LabelMap<TaskStatus> = {
  backlog: { label: 'Backlog', tone: 'slate' },
  in_progress: { label: 'Em andamento', tone: 'blue' },
  review: { label: 'Em revisão', tone: 'amber' },
  done: { label: 'Concluída', tone: 'green' },
}

export const taskPriority: LabelMap<TaskPriority> = {
  low: { label: 'Baixa', tone: 'slate' },
  medium: { label: 'Média', tone: 'blue' },
  high: { label: 'Alta', tone: 'amber' },
  urgent: { label: 'Urgente', tone: 'red' },
}

export const eventType: LabelMap<EventType> = {
  meeting: { label: 'Reunião', tone: 'indigo' },
  deadline: { label: 'Prazo', tone: 'red' },
  review: { label: 'Revisão', tone: 'amber' },
}

export const transactionStatus: LabelMap<TransactionStatus> = {
  pending: { label: 'Pendente', tone: 'amber' },
  paid: { label: 'Pago', tone: 'green' },
  overdue: { label: 'Atrasado', tone: 'red' },
}

export const contractStatus: LabelMap<ContractStatus> = {
  draft: { label: 'Rascunho', tone: 'slate' },
  signed: { label: 'Assinado', tone: 'blue' },
  active: { label: 'Vigente', tone: 'green' },
  terminated: { label: 'Encerrado', tone: 'red' },
}

export const goalCategory: Record<GoalCategory, string> = {
  revenue: 'Faturamento',
  clients: 'Novos clientes',
  projects: 'Projetos',
}

export const toOptions = <K extends string>(map: Record<K, { label: string }>) =>
  (Object.keys(map) as K[]).map((value) => ({ value, label: map[value].label }))
