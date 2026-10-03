// Tipos centralizados do banco. Espelham supabase/migrations/001_initial_schema.sql.

export type ClientStatus = 'active' | 'inactive' | 'lead'
export type FreelancerStatus = 'active' | 'inactive'
export type ProposalStatus = 'draft' | 'sent' | 'approved' | 'rejected'
export type ProjectStatus = 'planning' | 'in_progress' | 'review' | 'completed' | 'cancelled'
export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type EventType = 'meeting' | 'deadline' | 'review'
export type TransactionType = 'income' | 'expense'
export type TransactionStatus = 'pending' | 'paid' | 'overdue'
export type ContractStatus = 'draft' | 'signed' | 'active' | 'terminated'
export type GoalCategory = 'revenue' | 'clients' | 'projects'

export interface Profile {
  id: string
  full_name: string | null
  company_name: string | null
  document: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
}

export interface Client {
  id: string
  user_id: string
  name: string
  company_name: string | null
  email: string | null
  phone: string | null
  document: string | null
  status: ClientStatus
  hourly_rate: number | null
  notes: string | null
  created_at: string
}

export interface Freelancer {
  id: string
  user_id: string
  name: string
  specialty: string | null
  email: string | null
  phone: string | null
  pix_key: string | null
  cost_per_hour: number | null
  rating: number | null
  status: FreelancerStatus
  created_at: string
}

export interface ProposalItem {
  description: string
  quantity: number
  unit_price: number
}

export interface ProposalScheduleStep {
  label: string
  duration: string
}

export interface ProposalContent {
  deliverables?: string[]
  schedule?: ProposalScheduleStep[]
  items?: ProposalItem[]
}

export interface Proposal {
  id: string
  user_id: string
  proposal_number: number
  client_id: string | null
  title: string
  scope_text: string | null
  content: ProposalContent
  total_amount: number
  validity_days: number
  status: ProposalStatus
  payment_terms: string | null
  created_at: string
}

export type QuoteStatus = 'pending' | 'paid'

/** Orçamento rápido com pagamento via Pix. Mais leve que uma proposta. */
export interface Quote {
  id: string
  user_id: string
  quote_number: number
  client_id: string | null
  /** Nome livre quando o cliente não está cadastrado. */
  customer_name: string | null
  title: string
  items: ProposalItem[]
  notes: string | null
  total_amount: number
  validity_days: number
  status: QuoteStatus
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  client_id: string | null
  proposal_id: string | null
  title: string
  description: string | null
  budget: number | null
  status: ProjectStatus
  deadline: string | null
  created_at: string
}

export interface Task {
  id: string
  user_id: string
  project_id: string | null
  freelancer_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  scheduled_date: string | null
  due_date: string | null
  cost_amount: number | null
  charged_amount: number | null
  created_at: string
}

export interface CalendarEvent {
  id: string
  user_id: string
  title: string
  event_type: EventType
  start_time: string
  end_time: string | null
  meeting_link: string | null
  client_id: string | null
  freelancer_id: string | null
  created_at: string
}

export interface FinancialTransaction {
  id: string
  user_id: string
  type: TransactionType
  category: string | null
  description: string | null
  amount: number
  due_date: string
  payment_date: string | null
  status: TransactionStatus
  client_id: string | null
  freelancer_id: string | null
  project_id: string | null
  proof_url: string | null
  created_at: string
}

export interface Contract {
  id: string
  user_id: string
  proposal_id: string | null
  client_id: string | null
  title: string
  content_markdown: string
  status: ContractStatus
  created_at: string
}

export interface Goal {
  id: string
  user_id: string
  title: string
  target_amount: number
  current_amount: number
  start_date: string
  end_date: string
  category: GoalCategory
  created_at: string
}

export interface Tables {
  profiles: Profile
  clients: Client
  freelancers: Freelancer
  proposals: Proposal
  quotes: Quote
  projects: Project
  tasks: Task
  calendar_events: CalendarEvent
  financial_transactions: FinancialTransaction
  contracts: Contract
  goals: Goal
}

export type TableName = keyof Tables
