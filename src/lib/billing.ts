import { activeWorkspaceId } from '@/store/workspace'
import { isoDay } from './utils'
import { listRows, updateRow } from './db'
import { supabase } from './supabase'
import type { BillingProvider, FinancialTransaction, NfseRegime, NfseTaxes, Profile } from '@/types/database.types'

/**
 * Cobrança por gateway (hoje, o Asaas). Tudo que fala com o gateway passa pela
 * Edge Function `billing`, que guarda a chave de API cifrada no banco; o
 * navegador só envia a chave uma vez, ao conectar.
 *
 * No modo demo (sem Supabase) as cobranças são simuladas aqui mesmo, sem
 * chamar o Asaas, para dar para ver o fluxo inteiro.
 */

export type GatewayEnv = 'sandbox' | 'production'

export interface BillingConnection {
  provider: Exclude<BillingProvider, 'simple'>
  environment: GatewayEnv
  account_name: string | null
  account_email: string | null
  /** O webhook (aviso automático de pagamento) foi criado no gateway. */
  webhook: boolean
  connected_at: string
}

export const billingProviders: Record<BillingProvider, { label: string; hint: string }> = {
  simple: { label: 'Simples: chave Pix e QR Code fixo', hint: 'O cliente paga pela sua chave Pix e você marca como pago à mão.' },
  asaas: { label: 'Asaas: cobrança com vencimento, multa e juros', hint: 'Cada recebimento vira uma cobrança no Asaas (Pix, boleto ou cartão), com multa e juros após o vencimento e baixa automática quando o cliente paga.' },
}

export const billingTypes = [
  { value: 'UNDEFINED', label: 'O cliente escolhe (Pix, boleto ou cartão)' },
  { value: 'PIX', label: 'Só Pix' },
  { value: 'BOLETO', label: 'Boleto (com Pix no mesmo documento)' },
  { value: 'CREDIT_CARD', label: 'Só cartão de crédito' },
]

/** Situações da cobrança no Asaas, em português. */
export const gatewayStatus: Record<string, { label: string; tone: 'slate' | 'green' | 'amber' | 'red' | 'blue' }> = {
  PENDING: { label: 'Aguardando', tone: 'amber' },
  OVERDUE: { label: 'Vencida', tone: 'red' },
  RECEIVED: { label: 'Recebida', tone: 'green' },
  CONFIRMED: { label: 'Confirmada', tone: 'green' },
  RECEIVED_IN_CASH: { label: 'Recebida por fora', tone: 'green' },
  REFUNDED: { label: 'Estornada', tone: 'slate' },
  REFUND_REQUESTED: { label: 'Estorno solicitado', tone: 'slate' },
  REFUND_IN_PROGRESS: { label: 'Estorno em andamento', tone: 'slate' },
  CHARGEBACK_REQUESTED: { label: 'Contestada', tone: 'red' },
  AWAITING_RISK_ANALYSIS: { label: 'Em análise', tone: 'blue' },
}
export const gatewayStatusOf = (status: string | null | undefined) => (status ? gatewayStatus[status] ?? { label: status, tone: 'slate' as const } : null)

/** O lançamento tem cobrança aberta no gateway (que ainda pode ser paga ou cancelada)? */
export const hasOpenCharge = (t: Pick<FinancialTransaction, 'gateway_charge_id' | 'status'>) => !!t.gateway_charge_id && t.status !== 'paid'

export const usesGateway = (profile: Pick<Profile, 'billing_provider'> | undefined) => profile?.billing_provider === 'asaas'

// ---------------------------------------------------------------------
// modo demo
// ---------------------------------------------------------------------

const DEMO_KEY = 'meu-erp-freelas:demo-billing:v1'

function demoConnection(): BillingConnection | null {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? 'null')
  } catch {
    return null
  }
}

async function demoAction(action: string, body: Record<string, unknown>): Promise<any> {
  const find = async () => {
    const tx = (await listRows('financial_transactions')).find((t) => t.id === body.transactionId)
    if (!tx) throw new Error('Lançamento não encontrado.')
    return tx
  }
  switch (action) {
    case 'connect': {
      const key = String(body.apiKey ?? '')
      if (!/^\$aact_/.test(key) || key.length < 30) throw new Error('Cole a chave de API completa, que começa com $aact_.')
      const connection: BillingConnection = { provider: 'asaas', environment: body.environment as GatewayEnv, account_name: 'Demo Serviços Digitais', account_email: 'demo@meuerp.example', webhook: true, connected_at: new Date().toISOString() }
      localStorage.setItem(DEMO_KEY, JSON.stringify(connection))
      const profile = (await listRows('profiles'))[0]
      if (profile) await updateRow('profiles', profile.id, { billing_provider: 'asaas' })
      return connection
    }
    case 'disconnect': {
      localStorage.removeItem(DEMO_KEY)
      const profile = (await listRows('profiles'))[0]
      if (profile) await updateRow('profiles', profile.id, { billing_provider: 'simple' })
      return { connected: false }
    }
    case 'create-charge': {
      if (!demoConnection()) throw new Error('Conecte a sua conta do Asaas em Minha empresa → Forma de cobrança.')
      const tx = await find()
      if (!tx.client_id) throw new Error('Escolha o cliente do lançamento antes de gerar a cobrança.')
      if (tx.due_date < isoDay(new Date())) throw new Error('O vencimento deste lançamento já passou. Edite a data de vencimento e gere a cobrança de novo.')
      const client = (await listRows('clients')).find((c) => c.id === tx.client_id)
      const doc = (client?.document ?? '').replace(/\D/g, '')
      if (doc.length !== 11 && doc.length !== 14) throw new Error(`Cadastre o CPF ou CNPJ de ${client?.company_name || client?.name} para gerar a cobrança.`)
      const id = `pay_demo${Math.random().toString(36).slice(2, 10)}`
      return {
        transaction: await updateRow('financial_transactions', tx.id, {
          gateway: 'asaas',
          gateway_env: demoConnection()!.environment,
          gateway_charge_id: id,
          gateway_status: 'PENDING',
          gateway_invoice_url: `https://www.asaas.com/i/${id.slice(4)}`,
          gateway_pix_payload: `00020126580014br.gov.bcb.pix0136demo-${id}520400005303986540${Number(tx.amount).toFixed(2)}5802BR`,
          gateway_pix_image: demoQr(),
          gateway_synced_at: new Date().toISOString(),
        }),
      }
    }
    case 'update-charge':
    case 'refresh-pix':
      return { transaction: await find() }
    case 'cancel-charge': {
      const tx = await find()
      return { transaction: await updateRow('financial_transactions', tx.id, clearedCharge) }
    }
    case 'refresh-charge': {
      const tx = await find()
      return { transaction: await updateRow('financial_transactions', tx.id, { gateway_synced_at: new Date().toISOString() }) }
    }
    case 'undo-receive-in-cash': {
      const tx = await find()
      return { transaction: await updateRow('financial_transactions', tx.id, { status: 'pending', payment_date: null, gateway_status: 'PENDING' }) }
    }
    case 'issue-invoice': {
      if (!demoConnection()) throw new Error('Conecte a sua conta do Asaas em Minha empresa → Forma de cobrança.')
      const tx = await find()
      if (tx.status !== 'paid') throw new Error('Emita a nota depois que o pagamento estiver registrado.')
      if (String(body.serviceDescription ?? '').trim().length < 10) throw new Error('Descreva o serviço prestado (pelo menos uma frase).')
      if (!String(body.serviceCode ?? '').trim()) throw new Error('Informe o código do serviço no catálogo de serviços do perfil.')
      const number = String(Math.floor(Math.random() * 900) + 100)
      return {
        transaction: await updateRow('financial_transactions', tx.id, {
          nfse_id: `inv_demo${number}`,
          nfse_status: 'AUTHORIZED',
          nfse_number: number,
          nfse_service: String(body.serviceName ?? ''),
          nfse_error: null,
          invoice_url: await demoInvoicePdf(number, tx, String(body.serviceDescription)),
          nfse_synced_at: new Date().toISOString(),
        }),
      }
    }
    case 'fiscal-info':
      if (!demoConnection()) throw new Error('Conecte a sua conta do Asaas em Minha empresa → Forma de cobrança.')
      return { configured: true, simplesNacional: true, specialTaxRegime: null, nationalPortalTaxCalculationRegime: null, cnae: '9511800', municipalInscription: null, serviceProvisionCityDefaultType: 'MY_ACCOUNT_CITY' } satisfies FiscalInfo
    case 'search-service-codes': {
      const term = String(body.term ?? '').toLowerCase()
      const list = body.kind === 'nbs' ? demoNbsCodes : demoServiceCodes
      const digits = term.replace(/\D/g, '')
      return { data: list.filter((i) => (digits && i.code.replace(/\D/g, '').includes(digits)) || i.description.toLowerCase().includes(term)) }
    }
    case 'refresh-invoice':
      return { transaction: await find() }
    case 'cancel-invoice': {
      const tx = await find()
      return { transaction: await updateRow('financial_transactions', tx.id, { nfse_status: 'CANCELED', invoice_url: null }) }
    }
    case 'receive-in-cash': {
      const tx = await find()
      return { transaction: await updateRow('financial_transactions', tx.id, { status: 'paid', payment_date: String(body.paymentDate || isoDay(new Date())), gateway_status: 'RECEIVED_IN_CASH' }) }
    }
  }
  throw new Error('Ação desconhecida.')
}

// amostra da tabela do Asaas, só para o modo demo (a busca real consulta o Asaas)
const demoServiceCodes: ServiceCode[] = [
  { code: '010701', description: 'Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas de computação e bancos de dados (amostra do modo demo)' },
  { code: '080201', description: 'Instrução, treinamento, orientação pedagógica e educacional, avaliação de conhecimentos de qualquer natureza (amostra do modo demo)' },
  { code: '140101', description: 'Lubrificação, limpeza, revisão, conserto, manutenção e conservação de máquinas, aparelhos e equipamentos (amostra do modo demo)' },
]
const demoNbsCodes: ServiceCode[] = [{ code: '1.1506.00.00', description: '1.1506.00.00 - Serviços de suporte em tecnologia da informação (amostra do modo demo)' }]

/** PDF de exemplo da nota (só no modo demo, marcado como demonstração). */
async function demoInvoicePdf(number: string, tx: FinancialTransaction, description: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF()
  pdf.setFontSize(16)
  pdf.text(`NFS-e nº ${number} (DEMONSTRAÇÃO, SEM VALOR FISCAL)`, 15, 20)
  pdf.setFontSize(11)
  pdf.text(pdf.splitTextToSize(description, 180), 15, 34)
  pdf.text(`Valor: ${Number(tx.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 15, 80)
  return pdf.output('datauristring')
}

/** Desenho de QR de exemplo (não é um Pix de verdade), só para o modo demo mostrar o layout do orçamento. */
function demoQr() {
  const size = 29
  const cells: string[] = []
  let seed = 7
  const finder = (x: number, y: number) => {
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      const dx = x - ox
      const dy = y - oy
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0
    }
    return -1
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const f = finder(x, y)
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      if (f === 1 || (f === -1 && (seed >>> 16) % 2 === 0)) cells.push(`<rect x="${x + 2}" y="${y + 2}" width="1" height="1"/>`)
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 4} ${size + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${cells.join('')}</g></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

const clearedCharge: Partial<FinancialTransaction> = {
  gateway: null,
  gateway_env: null,
  gateway_charge_id: null,
  gateway_status: null,
  gateway_invoice_url: null,
  gateway_bank_slip_url: null,
  gateway_pix_payload: null,
  gateway_pix_image: null,
  gateway_net_value: null,
  gateway_synced_at: null,
}

// ---------------------------------------------------------------------
// chamadas
// ---------------------------------------------------------------------

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) return demoAction(action, body)
  const { data, error } = await supabase.functions.invoke('billing', { body: { action, workspaceId: activeWorkspaceId(), ...body } })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context?.status === 404) throw new Error('A função de cobrança (billing) ainda não foi publicada no Supabase.')
    const detail = await context?.json?.().catch(() => null)
    throw new Error(detail?.message ?? error.message)
  }
  return data as T
}

export async function getBillingConnection(): Promise<BillingConnection | null> {
  if (!supabase) return demoConnection()
  const { data, error } = await supabase.rpc('get_billing_status', { p_workspace: activeWorkspaceId() })
  if (error) throw new Error(error.message)
  return ((data as BillingConnection[] | null) ?? []).find((c) => c.provider === 'asaas') ?? null
}

export const connectGateway = (environment: GatewayEnv, apiKey: string) =>
  call<BillingConnection & { webhookError?: string | null }>('connect', { environment, apiKey })
export const disconnectGateway = () => call<{ connected: false }>('disconnect')

/** `pixWarning`: o QR Code Pix não pôde ir para a cobrança (o link continua valendo). */
type ChargeResult = {
  transaction: FinancialTransaction
  pixWarning?: string | null
  /** O que a função fez além do pedido (ex.: cancelou a cobrança antiga). */
  notice?: string | null
}
export const createCharge = (transactionId: string) => call<ChargeResult>('create-charge', { transactionId })
export const updateCharge = (transactionId: string) => call<ChargeResult>('update-charge', { transactionId })
export const cancelCharge = (transactionId: string) => call<ChargeResult>('cancel-charge', { transactionId })
export const refreshCharge = (transactionId: string) => call<ChargeResult>('refresh-charge', { transactionId })
export const refreshPix = (transactionId: string) => call<ChargeResult>('refresh-pix', { transactionId })
export const receiveInCash = (transactionId: string, paymentDate: string) => call<ChargeResult>('receive-in-cash', { transactionId, paymentDate })
export const undoReceiveInCash = (transactionId: string) => call<ChargeResult>('undo-receive-in-cash', { transactionId })

export interface InvoiceRequest {
  transactionId: string
  serviceName: string
  serviceCode: string
  serviceDescription: string
  observations: string
  nbsCode?: string
  regime: NfseRegime
  deductions: number
  taxes: NfseTaxes
}

/** Configuração fiscal da conta no Asaas (Notas fiscais → Configurações). */
export interface FiscalInfo {
  configured: boolean
  simplesNacional?: boolean | null
  specialTaxRegime?: string | null
  nationalPortalTaxCalculationRegime?: string | null
  cnae?: string | null
  municipalInscription?: string | null
  serviceProvisionCityDefaultType?: 'MY_ACCOUNT_CITY' | 'CUSTOMER_CITY' | 'CUSTOMER_CITY_WHEN_ISS_IS_RETAINED' | null
}
export interface ServiceCode {
  code: string
  description: string
}
export const getFiscalInfo = () => call<FiscalInfo>('fiscal-info')
export const searchServiceCodes = (term: string, kind: 'national' | 'nbs' = 'national') => call<{ data: ServiceCode[] }>('search-service-codes', { term, kind })
export const issueInvoice = (request: InvoiceRequest) => call<ChargeResult>('issue-invoice', { ...request })
export const refreshInvoice = (transactionId: string) => call<ChargeResult>('refresh-invoice', { transactionId })
export const cancelInvoice = (transactionId: string) => call<ChargeResult>('cancel-invoice', { transactionId })

/**
 * O Asaas não aceita cobrança com vencimento no passado. Quando o lançamento
 * já venceu (ex.: orçamento antigo), devolve a nova data sugerida: hoje mais
 * `days` (no mínimo 1 dia). Devolve null quando o vencimento ainda vale.
 */
export function overdueSuggestion(t: Pick<FinancialTransaction, 'due_date'>, days = 3) {
  const today = isoDay(new Date())
  if (t.due_date >= today) return null
  const next = new Date()
  next.setDate(next.getDate() + Math.max(1, days))
  return isoDay(next)
}

/** Mensagem pronta para mandar o link de pagamento pelo WhatsApp. */
export function chargeMessage(t: Pick<FinancialTransaction, 'description' | 'amount' | 'due_date' | 'gateway_invoice_url'>, issuer: string) {
  const [y, m, d] = t.due_date.split('-')
  const amount = Number(t.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return [
    `Olá! Segue o link para pagamento de ${t.description ? `"${t.description}"` : 'sua cobrança'}, no valor de ${amount}, com vencimento em ${d}/${m}/${y}.`,
    `É só abrir o link para pagar: ${t.gateway_invoice_url}`,
    `Obrigado! ${issuer}`,
  ].join('\n\n')
}
