// Tipos centralizados do banco. Espelham supabase/migrations/001_initial_schema.sql.

export type ClientStatus = 'active' | 'inactive' | 'lead'
export type FreelancerStatus = 'active' | 'inactive'
export type ProposalStatus = 'draft' | 'sent' | 'awaiting_signature' | 'signed' | 'approved' | 'rejected'
export type ProjectStatus = 'planning' | 'in_progress' | 'review' | 'completed' | 'cancelled'
export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type EventType = 'meeting' | 'deadline' | 'review'
export type TransactionType = 'income' | 'expense'
export type TransactionStatus = 'pending' | 'paid' | 'overdue'
export type ContractStatus = 'draft' | 'awaiting_signature' | 'signed' | 'active' | 'terminated'
export type GoalCategory = 'revenue' | 'clients' | 'projects'
/** Forma de cobrança: Pix fixo do perfil ou um gateway de pagamento. */
export type BillingProvider = 'simple' | 'asaas'
export type BillingType = 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD'

/** Um serviço que o MEI presta e descreve na nota fiscal (um por CNAE). */
export interface NfseService {
  id: string
  label: string
  /** CNAE do MEI a que o serviço corresponde (só para referência). */
  cnae: string
  /** Código de serviço (tributação nacional) usado no Portal Nacional da NFS-e. */
  code: string
  /** Texto padrão da descrição da nota. */
  description: string
  /** Código NBS, quando a prefeitura exige (opcional). */
  nbs?: string
}

/** Regime tributário da nota: MEI (SIMEI), ME/EPP no Simples Nacional ou regime normal. */
export type NfseRegime = 'mei' | 'simples' | 'normal'

/** Alíquotas da nota, em %. */
export interface NfseTaxes {
  iss?: number
  retainIss?: boolean
  pis?: number
  cofins?: number
  csll?: number
  inss?: number
  ir?: number
}

export interface Profile {
  id: string
  full_name: string | null
  company_name: string | null
  document: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  /** Chave Pix para receber pagamentos (aparece nos orçamentos). */
  pix_key: string | null
  /** QR Code Pix, guardado como data URL de imagem. */
  pix_qr_image: string | null
  /** Sua assinatura (PNG em data URL), usada nas propostas e nos contratos. */
  signature_image?: string | null
  /** Como os recebimentos são cobrados (migração 011). */
  billing_provider?: BillingProvider
  /** Multa após o vencimento, em %. */
  billing_fine_pct?: number
  /** Juros ao mês após o vencimento, em %. */
  billing_interest_pct?: number
  /** Desconto para pagamento antecipado, em % (0 = sem desconto). */
  billing_discount_pct?: number
  /** Até quantos dias antes do vencimento vale o desconto (0 = até o dia). */
  billing_discount_days?: number
  billing_types?: BillingType
  /** O gateway avisa o cliente por e-mail/SMS sobre a cobrança. */
  billing_notify?: boolean
  /** Serviços que podem ir na nota fiscal (migração 012). */
  nfse_services?: NfseService[]
  /** Observações que saem em toda nota. */
  nfse_observations?: string | null
  /** Regime e alíquotas da última nota (migração 013). */
  nfse_regime?: NfseRegime
  nfse_taxes?: NfseTaxes
  /** Lembrete diário das demandas (migração 016). */
  reminder_email?: boolean
  reminder_push?: boolean
  /** Hora do lembrete, no horário de Brasília (0 a 23). */
  reminder_hour?: number
  reminder_last_sent?: string | null
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
  /** Coluna antiga, sem uso na interface. */
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
  /** Token do link público de assinatura; vazio enquanto o link não foi gerado. */
  share_token?: string | null
  signed_at?: string | null
  signer_name?: string | null
  signer_document?: string | null
  /** Assinatura desenhada pelo cliente (PNG em data URL), quando assinou pelo link. */
  signature_image?: string | null
  /** `link` = assinou pela página pública; `manual` = cópia assinada recebida por fora. */
  signature_method?: 'link' | 'manual' | null
  signature_ip?: string | null
  signature_user_agent?: string | null
  /** Resumo (SHA-256) do conteúdo assinado, gerado pelo banco. */
  signature_hash?: string | null
  created_at: string
}

export type QuoteStatus = 'pending' | 'partial' | 'paid'

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
  /** Proposta aprovada que deu origem ao orçamento, quando houver. */
  proposal_id?: string | null
  /** Percentual pago de entrada (ex.: 50); vazio = cobrança integral. */
  deposit_pct?: number | null
  /** Vencimento fixo (mensalidades); vazio = emissão + validade. Migração 015. */
  due_date?: string | null
  /** Série de mensalidade a que o orçamento pertence. */
  recurrence_id?: string | null
  created_at: string
}

/**
 * Mensalidade do gerador de orçamentos: todo mês nasce um orçamento novo,
 * réplica do último da série, com o vencimento do mês seguinte.
 */
export interface QuoteRecurrence {
  id: string
  user_id: string
  client_id: string | null
  active: boolean
  /** Dia do vencimento (1 a 31; meses curtos usam o último dia). */
  day_of_month: number
  /** Com quantos dias de antecedência o orçamento do mês é gerado. */
  lead_days: number
  /** Vencimento da próxima mensalidade a ser gerada. */
  next_due_date: string
  /** Última mensalidade com vencimento até esta data; vazio = sem prazo. */
  ends_on: string | null
  last_quote_id: string | null
  last_run_at: string | null
  /** O que deu errado na última geração (ex.: a cobrança no Asaas). */
  last_error: string | null
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
  /** PDF da nota fiscal emitida para este recebimento. */
  invoice_url?: string | null
  /** Parcelas de uma mesma recorrência compartilham este id. */
  recurrence_id?: string | null
  /** Posição da parcela na série (1 = primeira). */
  installment?: number | null
  /** Total de parcelas da série. */
  installments?: number | null
  /** Contrato que gerou a parcela, quando veio de um contrato assinado. */
  contract_id?: string | null
  /** Orçamento a que o lançamento pertence; os dois mudam de situação juntos. */
  quote_id?: string | null
  /** Gateway em que a cobrança foi criada (vazio = sem cobrança). */
  gateway?: 'asaas' | null
  gateway_env?: 'sandbox' | 'production' | null
  gateway_charge_id?: string | null
  /** Situação da cobrança no gateway (PENDING, RECEIVED, OVERDUE...). */
  gateway_status?: string | null
  /** Página de pagamento do cliente (Pix, boleto ou cartão). */
  gateway_invoice_url?: string | null
  gateway_bank_slip_url?: string | null
  /** Pix copia e cola da cobrança. */
  gateway_pix_payload?: string | null
  /** QR Code Pix da cobrança (data URL). */
  gateway_pix_image?: string | null
  /** Valor líquido, já descontada a taxa do gateway. */
  gateway_net_value?: number | null
  gateway_synced_at?: string | null
  /** NFS-e emitida pelo Asaas para este recebimento (migração 012). */
  nfse_id?: string | null
  nfse_status?: string | null
  nfse_number?: string | null
  /** Serviço do catálogo usado na nota. */
  nfse_service?: string | null
  /** Motivo, quando a prefeitura ou o Portal recusou a nota. */
  nfse_error?: string | null
  nfse_synced_at?: string | null
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
  /** Mensalidade do contrato; vazio em contrato sem recorrência. */
  monthly_amount?: number | null
  /** Meses de vigência (quantas mensalidades serão lançadas). */
  term_months?: number | null
  /** Vencimento da primeira mensalidade; vazio = um mês após a assinatura. */
  first_due_date?: string | null
  /** Token do link público de assinatura; vazio enquanto o link não foi gerado. */
  share_token?: string | null
  signed_at?: string | null
  signer_name?: string | null
  signer_document?: string | null
  /** Assinatura desenhada pelo cliente (PNG em data URL), quando assinou pelo link. */
  signature_image?: string | null
  /** `link` = assinou pela página pública; `manual` = cópia assinada recebida por fora. */
  signature_method?: 'link' | 'manual' | null
  signature_ip?: string | null
  signature_user_agent?: string | null
  signature_hash?: string | null
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

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

/** A empresa: dados, cobrança e nota. Todo dado do sistema pertence a um workspace (migração 020). */
export type BusinessType = 'mei' | 'me' | 'epp' | 'outra_pj' | 'pf'
export type PlanId = 'free' | 'essential' | 'pro'
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'courtesy'
export type TeamSize = 'solo' | '2-5' | '6-15' | '16+'

export interface Workspace {
  id: string
  name: string
  created_by: string | null
  created_at: string
  company_name: string | null
  document: string | null
  email: string | null
  phone: string | null
  pix_key: string | null
  pix_qr_image: string | null
  signature_image: string | null
  billing_provider: BillingProvider
  billing_fine_pct: number
  billing_interest_pct: number
  billing_discount_pct: number
  billing_discount_days: number
  billing_types: BillingType
  billing_notify: boolean
  nfse_services: NfseService[]
  nfse_observations: string | null
  nfse_regime: NfseRegime
  nfse_taxes: NfseTaxes
  business_type: BusinessType | null
  team_size: TeamSize | null
  segment: string | null
  onboarded_at: string | null
  plan_id: PlanId
  subscription_status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
  extra_members: number
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  created_at: string
}

/** Linha devolvida por list_workspace_members (nome e e-mail vêm do perfil). */
export interface MemberInfo {
  user_id: string
  role: WorkspaceRole
  full_name: string | null
  email: string | null
  joined_at: string
}

export interface WorkspaceInvite {
  id: string
  workspace_id: string
  email: string
  role: Exclude<WorkspaceRole, 'owner'>
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface Tables {
  profiles: Profile
  workspaces: Workspace
  clients: Client
  freelancers: Freelancer
  proposals: Proposal
  quotes: Quote
  quote_recurrences: QuoteRecurrence
  projects: Project
  tasks: Task
  calendar_events: CalendarEvent
  financial_transactions: FinancialTransaction
  contracts: Contract
  goals: Goal
}

export type TableName = keyof Tables
